import assert from 'node:assert';
import { DateTime } from 'luxon';
import { db, initDatabase } from '../db/database';
import { FilterService } from '../services/filter.service';
import { AuthService } from '../services/auth.service';
import { JobService } from '../services/job.service';
import { SettingsService } from '../services/settings.service';
import { DeletionService } from '../services/deletion.service';
import { ScannerService } from '../services/scanner.service';
import { HistoryService } from '../services/history.service';
import { DiscordApiService, DiscordApiError } from '../services/discord-api.service';
import {
  DiscordPermissions,
  DISCORD_BULK_DELETE_HARD_MAX_HOURS,
  DISCORD_BULK_DELETE_MAX_CONFIGURABLE_HOURS,
  DISCORD_BULK_DELETE_MIN_CONFIGURABLE_HOURS
} from '../constants/discord.constants';
import { ChannelPermissionOverwrite, FilterConfig } from '../types';

initDatabase();

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n--- 1. Rate Limiting Coordination & Major Resource Bucket Identity ---');

  await test('Normal request returns data and headers', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    global.fetch = (async (_url: string) => {
      return new Response(JSON.stringify({ id: 'msg-1' }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'bucket-normal',
          'X-RateLimit-Remaining': '5',
          'X-RateLimit-Reset-After': '0.5'
        })
      });
    }) as any;

    try {
      const res = await DiscordApiService.request('/channels/1001/messages', 'token');
      assert.strictEqual(res.data.id, 'msg-1');
      assert.strictEqual(res.headers.get('X-RateLimit-Remaining'), '5');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Same-route concurrency: requests are serialized in sequence', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    const executionOrder: number[] = [];

    global.fetch = (async (_url: string) => {
      const current = executionOrder.length + 1;
      await new Promise(r => setTimeout(r, 20));
      executionOrder.push(current);
      return new Response(JSON.stringify({ seq: current }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'bucket-seq',
          'X-RateLimit-Remaining': '10',
          'X-RateLimit-Reset-After': '1'
        })
      });
    }) as any;

    try {
      const [r1, r2, r3] = await Promise.all([
        DiscordApiService.request('/channels/1002/messages', 'token'),
        DiscordApiService.request('/channels/1002/messages', 'token'),
        DiscordApiService.request('/channels/1002/messages', 'token')
      ]);

      assert.deepStrictEqual(executionOrder, [1, 2, 3]);
      assert.strictEqual(r1.data.seq, 1);
      assert.strictEqual(r2.data.seq, 2);
      assert.strictEqual(r3.data.seq, 3);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Two routes with SAME learned bucket hash AND SAME channel ID share quota', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    let callCount = 0;

    global.fetch = (async () => {
      callCount++;
      const remaining = callCount === 2 ? '0' : '5';
      const resetAfter = callCount === 2 ? '0.08' : '1';

      return new Response(JSON.stringify({ success: true, call: callCount }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'bucket-channel-shared-xyz',
          'X-RateLimit-Remaining': remaining,
          'X-RateLimit-Reset-After': resetAfter
        })
      });
    }) as any;

    try {
      // 1. Route A learns bucket-xyz for channel 1003
      await DiscordApiService.request('/channels/1003/messages', 'token');

      // 2. Route B learns bucket-xyz for channel 1003 and exhausts it
      await DiscordApiService.request('/channels/1003/messages/bulk-delete', 'token', { method: 'POST', body: { messages: ['1'] } });

      // 3. Route A is called again; now mapped to the shared bucket for channel 1003, it must wait
      const start = Date.now();
      await DiscordApiService.request('/channels/1003/messages', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 70, `Route A should wait on shared bucket quota exhausted by Route B (waited ${elapsed}ms)`);
      assert.strictEqual(callCount, 3);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Two routes with SAME learned bucket hash but DIFFERENT channel IDs do NOT share quota', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    const calls: Array<{ url: string; time: number }> = [];

    global.fetch = (async (url: string) => {
      calls.push({ url, time: Date.now() });

      const isChannel1 = url.includes('1004');
      const remaining = isChannel1 ? '0' : '5';
      const resetAfter = isChannel1 ? '0.5' : '1';

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'bucket-global-hash-same',
          'X-RateLimit-Remaining': remaining,
          'X-RateLimit-Reset-After': resetAfter
        })
      });
    }) as any;

    try {
      // 1. Call channel 1004 (it exhausts bucket for channel 1004)
      await DiscordApiService.request('/channels/1004/messages', 'token');

      // 2. Call channel 1005 (different channel ID). Should NOT be blocked by channel 1004's exhaustion!
      const start = Date.now();
      await DiscordApiService.request('/channels/1005/messages', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 200, `Different channel should NOT be delayed by channel 1004 quota (took ${elapsed}ms)`);
      assert.strictEqual(calls.length, 2);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Two routes with SAME learned bucket hash but DIFFERENT guild IDs remain independent', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    global.fetch = (async (url: string) => {
      const isGuild1 = url.includes('9001');
      const remaining = isGuild1 ? '0' : '5';
      const resetAfter = isGuild1 ? '0.5' : '1';

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'guild-shared-hash',
          'X-RateLimit-Remaining': remaining,
          'X-RateLimit-Reset-After': resetAfter
        })
      });
    }) as any;

    try {
      await DiscordApiService.request('/guilds/9001/members', 'token');

      const start = Date.now();
      await DiscordApiService.request('/guilds/9002/members', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 200, `Different guild should remain independent (took ${elapsed}ms)`);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Independent buckets execute in parallel without mutual blocking', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    let reqAStarted = false;
    let reqBStarted = false;
    let executedInParallel = false;

    global.fetch = (async (url: string) => {
      const isChannelA = url.includes('2001');
      const bucket = isChannelA ? 'bucket-A' : 'bucket-B';

      if (isChannelA) {
        reqAStarted = true;
        await new Promise(r => setTimeout(r, 30));
        if (reqBStarted) executedInParallel = true;
      } else {
        reqBStarted = true;
        await new Promise(r => setTimeout(r, 30));
        if (reqAStarted) executedInParallel = true;
      }

      return new Response(JSON.stringify({ bucket }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': bucket,
          'X-RateLimit-Remaining': '5',
          'X-RateLimit-Reset-After': '1'
        })
      });
    }) as any;

    try {
      const [resA, resB] = await Promise.all([
        DiscordApiService.request('/channels/2001/messages', 'token'),
        DiscordApiService.request('/channels/2002/messages', 'token')
      ]);

      assert.strictEqual(resA.data.bucket, 'bucket-A');
      assert.strictEqual(resB.data.bucket, 'bucket-B');
      assert.strictEqual(executedInParallel, true, 'Both requests should be in flight simultaneously');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Proactively waits when bucket remaining is 0 before reset', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    let callCount = 0;

    global.fetch = (async () => {
      callCount++;
      const remaining = callCount === 1 ? '0' : '4';
      const resetAfter = callCount === 1 ? '0.08' : '1';
      return new Response(JSON.stringify({ call: callCount }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'bucket-exhaust',
          'X-RateLimit-Remaining': remaining,
          'X-RateLimit-Reset-After': resetAfter
        })
      });
    }) as any;

    try {
      await DiscordApiService.request('/channels/3001/messages', 'token');

      const start = Date.now();
      await DiscordApiService.request('/channels/3001/messages', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 70, `Exhausted bucket delayed second request for ${elapsed}ms (expected >= 70ms)`);
      assert.strictEqual(callCount, 2);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Ordinary 429 response: pauses for retry_after and retries successfully', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    let attempts = 0;

    global.fetch = (async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ message: 'Rate limit hit', retry_after: 0.05 }), {
          status: 429,
          headers: new Headers({
            'Content-Type': 'application/json',
            'Retry-After': '0.05'
          })
        });
      }
      return new Response(JSON.stringify({ id: 'recovered-429' }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }) as any;

    try {
      const res = await DiscordApiService.request('/channels/4001/messages', 'token');
      assert.strictEqual(attempts, 2);
      assert.strictEqual(res.data.id, 'recovered-429');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Global 429 locks all requests across all routes', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    let attempts = 0;

    global.fetch = (async (url: string) => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ message: 'Global 429', retry_after: 0.08, global: true }), {
          status: 429,
          headers: new Headers({
            'Content-Type': 'application/json',
            'X-RateLimit-Global': 'true',
            'Retry-After': '0.08'
          })
        });
      }
      return new Response(JSON.stringify({ url, ok: true }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }) as any;

    try {
      const start = Date.now();
      const res = await DiscordApiService.request('/channels/5001/messages', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 70, `Global 429 paused execution for ${elapsed}ms`);
      assert.strictEqual(res.data.ok, true);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Missing rate-limit headers are handled without throwing NaN', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      return new Response(JSON.stringify({ status: 'no-headers' }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }) as any;

    try {
      const res = await DiscordApiService.request('/users/@me', 'token');
      assert.strictEqual(res.data.status, 'no-headers');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Malformed rate-limit headers do not corrupt rate limit state', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      return new Response(JSON.stringify({ status: 'malformed-headers' }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'bucket-bad',
          'X-RateLimit-Remaining': 'invalid-number',
          'X-RateLimit-Reset-After': 'not-a-float'
        })
      });
    }) as any;

    try {
      const res = await DiscordApiService.request('/channels/6001/messages', 'token');
      assert.strictEqual(res.data.status, 'malformed-headers');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Retry exhaustion on repeated 429 throws DiscordApiError(429)', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Persistent rate limit', retry_after: 0.01 }), {
        status: 429,
        headers: new Headers({ 'Retry-After': '0.01' })
      });
    }) as any;

    try {
      let threw = false;
      try {
        await DiscordApiService.request('/channels/7001/messages', 'token', { maxRetries: 2 });
      } catch (err: any) {
        threw = true;
        assert.strictEqual(err instanceof DiscordApiError, true);
        assert.strictEqual(err.statusCode, 429);
      }
      assert.strictEqual(threw, true, 'Should throw after exhausting 429 retries');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('Retry exhaustion on repeated 5xx errors throws DiscordApiError', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      return new Response('Server Error', { status: 502 });
    }) as any;

    try {
      let threw = false;
      try {
        await DiscordApiService.request('/channels/8001/messages', 'token', { maxRetries: 2 });
      } catch (err: any) {
        threw = true;
        assert.strictEqual(err instanceof DiscordApiError, true);
        assert.strictEqual(err.statusCode, 502);
      }
      assert.strictEqual(threw, true, 'Should throw after exhausting 5xx retries');
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  console.log('\n--- 2. Exact 14-Day (336-Hour) Bulk Delete Boundary ---');

  await test('Settings clamps bulkCutoffHours to hard ceiling of 336h', () => {
    const clampedMax = SettingsService.updateSettings({ bulkCutoffHours: 400 });
    assert.strictEqual(clampedMax.bulkCutoffHours, 336);

    const clampedMin = SettingsService.updateSettings({ bulkCutoffHours: 5 });
    assert.strictEqual(clampedMin.bulkCutoffHours, 24);

    SettingsService.updateSettings({ bulkCutoffHours: 336 });
  });

  await test('Exact boundary evaluation: 14d - 1ms is bulk candidate, exactly 14d and 14d + 1ms are individual only', () => {
    const cutoffDays = 14.0;
    const ref = DateTime.fromISO('2026-08-30T12:00:00.000Z', { zone: 'utc' });

    // 14 days minus 1 ms (13 days, 23 hours, 59 minutes, 59 seconds, 999 ms)
    const minus1ms = ref.minus({ days: 14 }).plus({ milliseconds: 1 }).toISO()!;
    assert.strictEqual(FilterService.isBulkDeletable(minus1ms, cutoffDays, ref), true, '14d - 1ms must be bulk candidate');

    // Exactly 14 days (14.000000 days -> age >= 14d -> false)
    const exactly14d = ref.minus({ days: 14 }).toISO()!;
    assert.strictEqual(FilterService.isBulkDeletable(exactly14d, cutoffDays, ref), false, 'Exactly 14.00d must be individual deletion only');

    // 14 days plus 1 ms (14 days + 1 ms -> age > 14d -> false)
    const plus1ms = ref.minus({ days: 14 }).minus({ milliseconds: 1 }).toISO()!;
    assert.strictEqual(FilterService.isBulkDeletable(plus1ms, cutoffDays, ref), false, '14d + 1ms must be individual deletion only');
  });

  console.log('\n--- 3. Scanner Limits (Table-Driven Pagination Tests) ---');

  const testLimits = [1, 99, 100, 101, 150, 199, 200, 250];

  for (const limit of testLimits) {
    await test(`Scanner limit = ${limit}: requests exact page sizes and caps total processed`, async () => {
      DiscordApiService.resetRateLimits();
      const originalFetch = global.fetch;
      const requestedLimits: number[] = [];
      let totalMessagesEmitted = 0;

      global.fetch = (async (url: string) => {
        const urlObj = new URL(url);
        const reqLimit = parseInt(urlObj.searchParams.get('limit') || '100', 10);
        requestedLimits.push(reqLimit);

        const messages = Array.from({ length: reqLimit }, (_, i) => ({
          id: `msg-${totalMessagesEmitted + i + 1}`,
          channel_id: '9901',
          author: { id: '987654321000000001', username: 'TargetUser', discriminator: '0001' },
          content: `Test message ${totalMessagesEmitted + i + 1}`,
          timestamp: new Date().toISOString()
        }));

        totalMessagesEmitted += messages.length;

        return new Response(JSON.stringify(messages), {
          status: 200,
          headers: new Headers({
            'Content-Type': 'application/json',
            'X-RateLimit-Bucket': 'bucket-scanner-table'
          })
        });
      }) as any;

      SettingsService.updateSettings({ maxMessagesPerChannel: limit });

      const filter: FilterConfig = {
        targetUserId: '987654321000000001',
        channelIds: ['9901'],
        timezone: 'UTC',
        dateMode: 'ALL_TIME',
        timeMode: 'ANY_TIME'
      };

      const job = JobService.createJob(
        'session-scanner-tbl',
        'guild-scan',
        'Guild Scan',
        '987654321000000001',
        'TargetUser',
        'TargetUser',
        '',
        [{ id: '9901', name: 'general' }],
        filter
      );

      try {
        const result = await ScannerService.scanMessages(
          job.id,
          'guild-scan',
          [{ id: '9901', name: 'general', type: 0 }],
          filter,
          false,
          'mock-token'
        );

        assert.strictEqual(result.scannedCount, limit, `Expected ${limit} scanned messages, got ${result.scannedCount}`);

        const totalRequested = requestedLimits.reduce((a, b) => a + b, 0);
        assert.strictEqual(totalRequested, limit, `Requested limits ${requestedLimits.join('+')} sum to ${totalRequested}, expected ${limit}`);

        for (const reqLimit of requestedLimits) {
          assert.ok(reqLimit <= 100, `Page limit ${reqLimit} exceeded Discord max 100`);
        }
      } finally {
        global.fetch = originalFetch;
        DiscordApiService.resetRateLimits();
      }
    });
  }

  SettingsService.updateSettings({ maxMessagesPerChannel: 1000 });

  console.log('\n--- 4. Session Ownership & Explicit Session-Scoped Report APIs ---');

  await test('Session isolation on retrieval, cancel, execution, and explicit ForSession report APIs', async () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const job = JobService.createJob(
      'session-alpha',
      'guild-123',
      'Guild Alpha',
      '987654321000000001',
      'TargetUser',
      'TargetUser',
      '',
      [{ id: '101', name: 'general' }],
      filter
    );

    // 1. Retrieval
    assert.ok(JobService.getJobForSession(job.id, 'session-alpha') !== null, 'Owner can retrieve job');
    assert.strictEqual(JobService.getJobForSession(job.id, 'session-beta'), null, 'Foreign session cannot retrieve job');

    // 2. Cancellation
    assert.strictEqual(JobService.cancelJobForSession(job.id, 'session-beta'), false, 'Foreign session cannot cancel job');
    assert.strictEqual(JobService.cancelJobForSession(job.id, 'session-alpha'), true, 'Owner can cancel job');

    // 3. Execution rejection for foreign session
    JobService.updateJobStatus(job.id, 'READY');
    db.prepare(`
      INSERT INTO job_scanned_messages (job_id, message_id, channel_id, channel_name, author_id, author_username, author_display_name, author_avatar_url, content, timestamp_utc, timestamp_local_formatted, is_bulk_deletable, age_days, is_selected)
      VALUES (?, 'msg-sess-1', '101', 'general', '987654321000000001', 'Target', 'Target', '', 'Test', '2026-08-20T12:00:00Z', '2026-08-20', 1, 5, 1)
    `).run(job.id);

    let foreignExecThrew = false;
    try {
      await DeletionService.executeDeletion(job.id, 'session-beta', null, true);
    } catch (err: any) {
      foreignExecThrew = true;
      assert.ok(err.message.includes('unauthorized') || err.message.includes('not found'));
    }
    assert.strictEqual(foreignExecThrew, true, 'Foreign session execution rejected');

    // 4. Report & Export session isolation via explicit ForSession APIs
    const alphaReport = HistoryService.getJobReportForSession(job.id, 'session-alpha');
    assert.ok(alphaReport !== null, 'Owner can access report via getJobReportForSession');

    const betaReport = HistoryService.getJobReportForSession(job.id, 'session-beta');
    assert.strictEqual(betaReport, null, 'Foreign session cannot access report via getJobReportForSession');

    assert.throws(() => {
      HistoryService.exportReportAsJSONForSession(job.id, 'session-beta');
    }, /unauthorized|not found/, 'Foreign session JSON export rejected');

    assert.throws(() => {
      HistoryService.exportReportAsCSVForSession(job.id, 'session-beta');
    }, /unauthorized|not found/, 'Foreign session CSV export rejected');
  });

  console.log('\n--- 5. Atomic Deletion Concurrency Lock ---');

  await test('Simultaneous deletion executions: exactly one acquires lock, competitor rejected', async () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const job = JobService.createJob(
      'session-lock-test',
      'guild-lock',
      'Guild Lock',
      '987654321000000001',
      'TargetUser',
      'TargetUser',
      '',
      [{ id: '101', name: 'general' }],
      filter
    );

    db.prepare(`
      INSERT INTO job_scanned_messages (job_id, message_id, channel_id, channel_name, author_id, author_username, author_display_name, author_avatar_url, content, timestamp_utc, timestamp_local_formatted, is_bulk_deletable, age_days, is_selected)
      VALUES (?, 'msg-lock-1', '101', 'general', '987654321000000001', 'Target', 'Target', '', 'T1', '2026-08-20T12:00:00Z', '2026-08-20', 1, 5, 1),
             (?, 'msg-lock-2', '101', 'general', '987654321000000001', 'Target', 'Target', '', 'T2', '2026-08-20T12:00:00Z', '2026-08-20', 1, 5, 1)
    `).run(job.id, job.id);

    JobService.updateJobStatus(job.id, 'READY');

    const [exec1, exec2] = await Promise.allSettled([
      DeletionService.executeDeletion(job.id, 'session-lock-test', null, true),
      DeletionService.executeDeletion(job.id, 'session-lock-test', null, true)
    ]);

    const successes = [exec1, exec2].filter(r => r.status === 'fulfilled');
    const failures = [exec1, exec2].filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Exactly one deletion must succeed');
    assert.strictEqual(failures.length, 1, 'Competing deletion must be rejected');

    const rejectedReason = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(rejectedReason.message.includes('Conflict') || rejectedReason.message.includes('READY'));

    const finalState = JobService.getJobForSession(job.id, 'session-lock-test');
    assert.strictEqual(finalState?.status, 'COMPLETED');
    assert.strictEqual(finalState?.deletedCount, 2);
  });

  console.log('\n--- 6. Authentication & Constant-Time Verification ---');

  await test('Verifies password via constant-time 32-byte SHA-256 digests across all input types', () => {
    process.env.ADMIN_PASSWORD = 'ProductionSafeAdminPass2026!';

    assert.strictEqual(AuthService.verifyPassword('ProductionSafeAdminPass2026!'), true);
    assert.strictEqual(AuthService.verifyPassword('ProductionSafeAdminPass2026'), false);
    assert.strictEqual(AuthService.verifyPassword('ProductionSafeAdminPass2026!Extra'), false);
    assert.strictEqual(AuthService.verifyPassword(''), false);
    assert.strictEqual(AuthService.verifyPassword('日本語パスワード'), false);
    assert.strictEqual(AuthService.verifyPassword(12345 as any), false);
    assert.strictEqual(AuthService.verifyPassword(null as any), false);
    assert.strictEqual(AuthService.verifyPassword(undefined as any), false);
    assert.strictEqual(AuthService.verifyPassword({} as any), false);

    process.env.ADMIN_PASSWORD = 'admin123';
  });

  console.log('\n--- 7. Discord Channel Permission Resolution Semantics ---');

  await test('Administrator role bypasses all channel-level denies', () => {
    const adminPerms = DiscordPermissions.ADMINISTRATOR;
    const overwrites: ChannelPermissionOverwrite[] = [{
      id: 'guild123',
      type: 0,
      allow: '0',
      deny: String(DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.MANAGE_MESSAGES)
    }];

    const result = DiscordApiService.computeChannelPermissions(adminPerms, overwrites, 'guild123');
    assert.strictEqual(result.canView, true);
    assert.strictEqual(result.canReadHistory, true);
    assert.strictEqual(result.canManageMessages, true);
  });

  await test('Channel @everyone deny removes permission when not granted elsewhere', () => {
    const basePerms = DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.MANAGE_MESSAGES;
    const overwrites: ChannelPermissionOverwrite[] = [{
      id: 'guild123',
      type: 0,
      allow: '0',
      deny: String(DiscordPermissions.MANAGE_MESSAGES)
    }];

    const result = DiscordApiService.computeChannelPermissions(basePerms, overwrites, 'guild123');
    assert.strictEqual(result.canView, true);
    assert.strictEqual(result.canManageMessages, false);
  });

  await test('Role allow overrides conflicting role deny across member roles', () => {
    const basePerms = DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.READ_MESSAGE_HISTORY;
    const overwrites: ChannelPermissionOverwrite[] = [
      { id: 'roleDeny', type: 0, allow: '0', deny: String(DiscordPermissions.MANAGE_MESSAGES) },
      { id: 'roleAllow', type: 0, allow: String(DiscordPermissions.MANAGE_MESSAGES), deny: '0' }
    ];

    const result = DiscordApiService.computeChannelPermissions(
      basePerms,
      overwrites,
      'guild123',
      ['roleDeny', 'roleAllow'],
      'user1'
    );
    assert.strictEqual(result.canManageMessages, true);
  });

  await test('Member-specific user overwrite takes precedence over role allow', () => {
    const basePerms = DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.READ_MESSAGE_HISTORY;
    const overwrites: ChannelPermissionOverwrite[] = [
      { id: 'roleAllow', type: 0, allow: String(DiscordPermissions.MANAGE_MESSAGES), deny: '0' },
      { id: 'user1', type: 1, allow: '0', deny: String(DiscordPermissions.MANAGE_MESSAGES) }
    ];

    const result = DiscordApiService.computeChannelPermissions(
      basePerms,
      overwrites,
      'guild123',
      ['roleAllow'],
      'user1'
    );
    assert.strictEqual(result.canManageMessages, false);
  });

  await test('Lack of VIEW_CHANNEL denies dependent read history and manage messages capabilities', () => {
    const basePerms = DiscordPermissions.MANAGE_MESSAGES | DiscordPermissions.READ_MESSAGE_HISTORY;
    const overwrites: ChannelPermissionOverwrite[] = [{
      id: 'guild123',
      type: 0,
      allow: '0',
      deny: String(DiscordPermissions.VIEW_CHANNEL)
    }];

    const result = DiscordApiService.computeChannelPermissions(basePerms, overwrites, 'guild123');
    assert.strictEqual(result.canView, false);
    assert.strictEqual(result.canReadHistory, false);
    assert.strictEqual(result.canManageMessages, false);
  });

  console.log(`\nTest Run Complete: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAllTests();
