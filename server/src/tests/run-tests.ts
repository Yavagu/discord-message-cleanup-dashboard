import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
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
import { apiRouter } from '../routes/api.routes';
import {
  DiscordPermissions,
  DISCORD_BULK_DELETE_HARD_MAX_HOURS
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
  console.log('\n--- Rate Limiting & Bucket Identity ---');

  await test('requests return payload and response headers', async () => {
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

  await test('requests on same route execute sequentially', async () => {
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

  await test('requests on same channel share learned rate limit bucket quota', async () => {
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
      await DiscordApiService.request('/channels/1003/messages', 'token');
      await DiscordApiService.request('/channels/1003/messages/bulk-delete', 'token', { method: 'POST', body: { messages: ['1'] } });

      const start = Date.now();
      await DiscordApiService.request('/channels/1003/messages', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 70, `Route should wait on shared bucket quota exhausted by other route (waited ${elapsed}ms)`);
      assert.strictEqual(callCount, 3);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('requests on different channels do not block each other', async () => {
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
      await DiscordApiService.request('/channels/1004/messages', 'token');

      const start = Date.now();
      await DiscordApiService.request('/channels/1005/messages', 'token');
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 200, `Different channel should not wait on channel 1004 quota (took ${elapsed}ms)`);
      assert.strictEqual(calls.length, 2);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('requests on different guilds execute independently', async () => {
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

  await test('requests on independent buckets execute in parallel', async () => {
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

  await test('exhausted bucket pauses subsequent requests until reset timestamp', async () => {
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

  await test('429 response pauses for retry_after and retries successfully', async () => {
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

  await test('global 429 locks all requests across all routes', async () => {
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

  await test('missing rate limit headers are handled gracefully', async () => {
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

  await test('malformed rate limit headers do not corrupt bucket state', async () => {
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

  await test('exhausting 429 retries throws typed DiscordApiError', async () => {
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

  await test('exhausting 5xx retries throws typed DiscordApiError', async () => {
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

  await test('new requests stay serialized behind pending requests after bucket identity is learned', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;
    const executionEvents: string[] = [];

    global.fetch = (async (url: string) => {
      if (url.includes('req-a')) {
        executionEvents.push('start:A');
        await new Promise(r => setTimeout(r, 40));
        executionEvents.push('end:A');
        return new Response(JSON.stringify({ name: 'A' }), {
          status: 200,
          headers: new Headers({
            'Content-Type': 'application/json',
            'X-RateLimit-Bucket': 'bucket-transition-hash',
            'X-RateLimit-Remaining': '10',
            'X-RateLimit-Reset-After': '1'
          })
        });
      }

      if (url.includes('req-b')) {
        executionEvents.push('start:B');
        await new Promise(r => setTimeout(r, 40));
        executionEvents.push('end:B');
        return new Response(JSON.stringify({ name: 'B' }), {
          status: 200,
          headers: new Headers({
            'Content-Type': 'application/json',
            'X-RateLimit-Bucket': 'bucket-transition-hash',
            'X-RateLimit-Remaining': '9',
            'X-RateLimit-Reset-After': '1'
          })
        });
      }

      if (url.includes('req-c')) {
        executionEvents.push('start:C');
        await new Promise(r => setTimeout(r, 20));
        executionEvents.push('end:C');
        return new Response(JSON.stringify({ name: 'C' }), {
          status: 200,
          headers: new Headers({
            'Content-Type': 'application/json',
            'X-RateLimit-Bucket': 'bucket-transition-hash',
            'X-RateLimit-Remaining': '8',
            'X-RateLimit-Reset-After': '1'
          })
        });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    try {
      // 1. Request A starts on unlearned route
      const pA = DiscordApiService.request('/channels/7777/messages?req-a', 'token');

      // 2. Request B queues behind A on unresolved route
      const pB = DiscordApiService.request('/channels/7777/messages?req-b', 'token');

      // 3. Wait for A to complete and teach the bucket hash
      await pA;

      // 4. Request C arrives after bucket hash is learned, while B is still executing
      const pC = DiscordApiService.request('/channels/7777/messages?req-c', 'token');

      await Promise.all([pB, pC]);

      // Verify B started and completed before C started
      const bStartIndex = executionEvents.indexOf('start:B');
      const bEndIndex = executionEvents.indexOf('end:B');
      const cStartIndex = executionEvents.indexOf('start:C');

      assert.ok(bStartIndex !== -1 && bEndIndex !== -1 && cStartIndex !== -1);
      assert.ok(bEndIndex < cStartIndex, `Request B must finish before Request C starts (events: ${executionEvents.join(', ')})`);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('queued requests converge onto existing canonical bucket and never dispatch concurrently', async () => {
    DiscordApiService.resetRateLimits();
    const originalFetch = global.fetch;

    let activeRequests = 0;
    let maxConcurrentRequests = 0;
    const events: string[] = [];

    global.fetch = (async (url: string) => {
      activeRequests++;
      if (activeRequests > maxConcurrentRequests) {
        maxConcurrentRequests = activeRequests;
      }

      const cleanUrl = url.split('?')[1] || url;
      events.push(`start:${cleanUrl}`);

      let delayMs = 30;
      if (cleanUrl === 'E1' || cleanUrl === 'E2') delayMs = 40;
      if (cleanUrl === 'A') delayMs = 20;
      if (cleanUrl === 'B') delayMs = 30;
      if (cleanUrl === 'C') delayMs = 20;

      await new Promise(r => setTimeout(r, delayMs));

      events.push(`end:${cleanUrl}`);
      activeRequests--;

      return new Response(JSON.stringify({ ok: true, name: cleanUrl }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Bucket': 'canonical-shared-bucket',
          'X-RateLimit-Remaining': '10',
          'X-RateLimit-Reset-After': '1'
        })
      });
    }) as any;

    try {
      // 1. Route One (/channels/8888/messages) learns canonical bucket 'canonical-shared-bucket'
      await DiscordApiService.request('/channels/8888/messages?init', 'token');

      // 2. Start request E1 on canonical bucket and queue E2 behind E1
      const pE1 = DiscordApiService.request('/channels/8888/messages?E1', 'token');
      const pE2 = DiscordApiService.request('/channels/8888/messages?E2', 'token');

      // 3. Start request A on Route Two (/channels/8888/messages/bulk-delete) which has not yet learned canonical identity
      const pA = DiscordApiService.request('/channels/8888/messages/bulk-delete?A', 'token', { method: 'POST', body: { messages: ['1'] } });

      // 4. Queue B behind A on Route Two
      const pB = DiscordApiService.request('/channels/8888/messages/bulk-delete?B', 'token', { method: 'POST', body: { messages: ['2'] } });

      // 5. Wait for A to complete and reveal that Route Two maps to 'canonical-shared-bucket'
      await pA;

      // 6. Send request C after the mapping has been learned
      const pC = DiscordApiService.request('/channels/8888/messages/bulk-delete?C', 'token', { method: 'POST', body: { messages: ['3'] } });

      await Promise.all([pE1, pE2, pB, pC]);

      // Check for concurrent execution between B and canonical bucket work (E1/E2)
      // Under previous Promise.all, B would dispatch independently when A finished while E1 or E2 was still running.
      const bStartIndex = events.indexOf('start:B');
      const e2EndIndex = events.indexOf('end:E2');
      const e1EndIndex = events.indexOf('end:E1');

      // B must not start until E1 and E2 on canonical bucket have completed
      assert.ok(bStartIndex > e1EndIndex, `B must start after E1 completes (events: ${events.join(', ')})`);
      assert.ok(bStartIndex > e2EndIndex, `B must start after E2 completes (events: ${events.join(', ')})`);

      // C must start after B completes
      const bEndIndex = events.indexOf('end:B');
      const cStartIndex = events.indexOf('start:C');
      assert.ok(cStartIndex > bEndIndex, `C must start after B completes (events: ${events.join(', ')})`);
    } finally {
      global.fetch = originalFetch;
      DiscordApiService.resetRateLimits();
    }
  });

  await test('member lookup and member search use distinct route identities', () => {
    const lookup = DiscordApiService.parseRouteInfo('GET', '/guilds/111/members/222');
    const search = DiscordApiService.parseRouteInfo('GET', '/guilds/111/members/search?query=test');
    const list = DiscordApiService.parseRouteInfo('GET', '/guilds/111/members');

    assert.notStrictEqual(lookup.routeKey, search.routeKey, 'Lookup and search must not share a route key');
    assert.notStrictEqual(lookup.routeKey, list.routeKey, 'Lookup and list must not share a route key');
    assert.strictEqual(lookup.majorParam, 'guild:111');
    assert.strictEqual(search.majorParam, 'guild:111');
  });

  await test('query parameters do not generate duplicate route identities', () => {
    const page1 = DiscordApiService.parseRouteInfo('GET', '/channels/555/messages?limit=50');
    const page2 = DiscordApiService.parseRouteInfo('GET', '/channels/555/messages?limit=100&before=999');

    assert.strictEqual(page1.routeKey, page2.routeKey, 'Varying query params on same endpoint must share route key');
    assert.strictEqual(page1.majorParam, 'channel:555');
  });

  console.log('\n--- Bulk Delete Boundary ---');

  await test('bulk cutoff setting clamps to 336 hour ceiling', () => {
    const clampedMax = SettingsService.updateSettings({ bulkCutoffHours: 400 });
    assert.strictEqual(clampedMax.bulkCutoffHours, 336);

    const clampedMin = SettingsService.updateSettings({ bulkCutoffHours: 5 });
    assert.strictEqual(clampedMin.bulkCutoffHours, 24);

    SettingsService.updateSettings({ bulkCutoffHours: 336 });
  });

  await test('message 14 days minus 1 ms is bulk candidate', () => {
    const cutoffDays = 14.0;
    const ref = DateTime.fromISO('2026-08-30T12:00:00.000Z', { zone: 'utc' });
    const minus1ms = ref.minus({ days: 14 }).plus({ milliseconds: 1 }).toISO()!;
    assert.strictEqual(FilterService.isBulkDeletable(minus1ms, cutoffDays, ref), true);
  });

  await test('message exactly 14 days old uses individual deletion', () => {
    const cutoffDays = 14.0;
    const ref = DateTime.fromISO('2026-08-30T12:00:00.000Z', { zone: 'utc' });
    const exactly14d = ref.minus({ days: 14 }).toISO()!;
    assert.strictEqual(FilterService.isBulkDeletable(exactly14d, cutoffDays, ref), false);
  });

  await test('message 14 days plus 1 ms uses individual deletion', () => {
    const cutoffDays = 14.0;
    const ref = DateTime.fromISO('2026-08-30T12:00:00.000Z', { zone: 'utc' });
    const plus1ms = ref.minus({ days: 14 }).minus({ milliseconds: 1 }).toISO()!;
    assert.strictEqual(FilterService.isBulkDeletable(plus1ms, cutoffDays, ref), false);
  });

  console.log('\n--- Scanner Pagination Limits ---');

  const testLimits = [1, 99, 100, 101, 150, 199, 200, 250];

  for (const limit of testLimits) {
    await test(`scanner requests exact page sizes and caps total processed (${limit})`, async () => {
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

        assert.strictEqual(result.scannedCount, limit);
        const totalRequested = requestedLimits.reduce((a, b) => a + b, 0);
        assert.strictEqual(totalRequested, limit);

        for (const reqLimit of requestedLimits) {
          assert.ok(reqLimit <= 100);
        }
      } finally {
        global.fetch = originalFetch;
        DiscordApiService.resetRateLimits();
      }
    });
  }

  SettingsService.updateSettings({ maxMessagesPerChannel: 1000 });

  console.log('\n--- Session Isolation & Authorization ---');

  await test('foreign session receives 404 and cannot execute deletion via HTTP route', async () => {
    const sessionA = AuthService.createSession('adminA', false);
    const sessionB = AuthService.createSession('adminB', false);

    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const jobA = JobService.createJob(
      sessionA.id,
      'guild-auth-test',
      'Guild Auth',
      '987654321000000001',
      'Target',
      'Target',
      '',
      [{ id: '101', name: 'general' }],
      filter
    );

    JobService.updateJobStatus(jobA.id, 'READY');
    db.prepare(`
      INSERT INTO job_scanned_messages (job_id, message_id, channel_id, channel_name, author_id, author_username, author_display_name, author_avatar_url, content, timestamp_utc, timestamp_local_formatted, is_bulk_deletable, age_days, is_selected)
      VALUES (?, 'msg-http-1', '101', 'general', '987654321000000001', 'Target', 'Target', '', 'Hello', '2026-08-20T12:00:00Z', '2026-08-20', 1, 5, 1)
    `).run(jobA.id);

    // Set cancellation token on Job A
    DeletionService.cancelJob(jobA.id);

    // Mount Express app for integration test
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', apiRouter);

    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      // Session B attempts to delete Job A
      const res = await fetch(`http://127.0.0.1:${port}/api/jobs/${jobA.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionB.id,
          'x-csrf-token': sessionB.csrfToken
        },
        body: JSON.stringify({ confirmed: true })
      });

      assert.strictEqual(res.status, 404, 'Foreign session must receive 404');
      const body = await res.json() as any;
      assert.ok(body.error.includes('unauthorized') || body.error.includes('not found'));

      // Verify Job A status remains READY in DB
      const jobAState = JobService.getJobForSession(jobA.id, sessionA.id);
      assert.strictEqual(jobAState?.status, 'READY', 'Job status must remain READY');

      // Verify cancellation token was not cleared by foreign attempt
      assert.strictEqual(DeletionService.isCancelled(jobA.id), true, 'Cancellation state must not be cleared');

      // Verify no failure records were written
      const failCount = db.prepare('SELECT COUNT(*) as count FROM job_failures WHERE job_id = ?').get(jobA.id) as any;
      assert.strictEqual(failCount.count, 0, 'No failures should be recorded');
    } finally {
      DeletionService.clearCancellation(jobA.id);
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  await test('concurrent owner deletion requests: exactly one accepted (200), competitor rejected with conflict (409)', async () => {
    const session = AuthService.createSession('adminOwner', false);

    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const job = JobService.createJob(
      session.id,
      'guild-owner-race',
      'Guild Owner Race',
      '987654321000000001',
      'Target',
      'Target',
      '',
      [{ id: '101', name: 'general' }],
      filter
    );

    JobService.updateJobStatus(job.id, 'READY');
    db.prepare(`
      INSERT INTO job_scanned_messages (job_id, message_id, channel_id, channel_name, author_id, author_username, author_display_name, author_avatar_url, content, timestamp_utc, timestamp_local_formatted, is_bulk_deletable, age_days, is_selected)
      VALUES (?, 'msg-owner-race-1', '101', 'general', '987654321000000001', 'Target', 'Target', '', 'Hello', '2026-08-20T12:00:00Z', '2026-08-20', 1, 5, 1)
    `).run(job.id);

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', apiRouter);

    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      // Send two concurrent POST delete requests from the same authenticated owner session
      const [res1, res2] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/api/jobs/${job.id}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': session.id,
            'x-csrf-token': session.csrfToken
          },
          body: JSON.stringify({ confirmed: true })
        }),
        fetch(`http://127.0.0.1:${port}/api/jobs/${job.id}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': session.id,
            'x-csrf-token': session.csrfToken
          },
          body: JSON.stringify({ confirmed: true })
        })
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [200, 409], 'Exactly one request must succeed (200) and the competitor must receive 409');

      const body200 = res1.status === 200 ? await res1.json() : await res2.json();
      const body409 = res1.status === 409 ? await res1.json() : await res2.json();

      assert.strictEqual(body200.success, true);
      assert.strictEqual(body409.code, 'EXECUTION_CONFLICT');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  await test('foreign session cannot clear cancellation token or mutate job status', async () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const job = JobService.createJob(
      'session-owner',
      'guild-1',
      'Guild 1',
      '987654321000000001',
      'User',
      'User',
      '',
      [{ id: '101', name: 'general' }],
      filter
    );

    JobService.updateJobStatus(job.id, 'READY');
    DeletionService.cancelJob(job.id);

    let threw = false;
    try {
      await DeletionService.executeDeletion(job.id, 'session-foreign', null, true);
    } catch (err: any) {
      threw = true;
      assert.ok(err.message.includes('unauthorized') || err.message.includes('not found'));
    }

    assert.strictEqual(threw, true);
    assert.strictEqual(DeletionService.isCancelled(job.id), true, 'Cancellation token must remain set');
    DeletionService.clearCancellation(job.id);
  });

  await test('foreign session cannot cancel job or access report exports', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const job = JobService.createJob(
      'session-user-1',
      'guild-reports',
      'Guild Reports',
      '987654321000000001',
      'Target',
      'Target',
      '',
      [{ id: '101', name: 'general' }],
      filter
    );

    assert.strictEqual(JobService.cancelJobForSession(job.id, 'session-user-2'), false);
    assert.strictEqual(HistoryService.getJobReportForSession(job.id, 'session-user-2'), null);

    assert.throws(() => {
      HistoryService.exportReportAsJSONForSession(job.id, 'session-user-2');
    }, /unauthorized|not found/);

    assert.throws(() => {
      HistoryService.exportReportAsCSVForSession(job.id, 'session-user-2');
    }, /unauthorized|not found/);
  });

  console.log('\n--- Atomic Deletion Concurrency ---');

  await test('simultaneous deletion executions: exactly one acquires lock, competitor rejected', async () => {
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

  console.log('\n--- Authentication ---');

  await test('constant-time password verification handles all input types safely', () => {
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

  console.log('\n--- Discord Channel Permissions ---');

  await test('administrator permission bypasses channel-level denies', () => {
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

  await test('everyone role deny removes permission when not granted elsewhere', () => {
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

  await test('role allow overrides conflicting role deny across member roles', () => {
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

  await test('member specific overwrite takes precedence over role overwrite', () => {
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

  await test('denying VIEW_CHANNEL denies dependent message permissions', () => {
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
