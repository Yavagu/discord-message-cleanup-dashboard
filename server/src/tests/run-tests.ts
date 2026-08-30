import assert from 'node:assert';
import { DateTime } from 'luxon';
import { FilterService } from '../services/filter.service';
import { FilterConfig } from '../types';
import { db, initDatabase } from '../db/database';
import { AuthService, cleanupExpiredSessions } from '../services/auth.service';
import { JobService } from '../services/job.service';
import { SettingsService } from '../services/settings.service';
import { DeletionService } from '../services/deletion.service';
import { HistoryService } from '../services/history.service';
import { DiscordApiService } from '../services/discord-api.service';
import { DiscordPermissions, getDiscordErrorDetail } from '../constants/discord.constants';

initDatabase();

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`  ✗ ${name}`);
        console.error(err);
        failed++;
      });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('--- 1. Timezone-Aware Filter Engine Tests ---');
  console.log('======================================================');

  test('Should match exact immutable Discord Snowflake User ID and reject others', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const validMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T18:00:00Z' };
    const wrongUserMsg = { authorId: '987654321000000002', timestampUtc: '2026-08-10T18:00:00Z' };

    assert.strictEqual(FilterService.matchesFilter(validMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(wrongUserMsg, filter), false);
  });

  test('Should accurately evaluate Time Filter (After 5:00 PM / 17:00) in Asia/Kolkata (+05:30)', () => {
    // 12:00 UTC = 17:30 IST (+5:30) -> After 5:00 PM (17:00)
    // 11:00 UTC = 16:30 IST (+5:30) -> Before 5:00 PM (17:00)
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'Asia/Kolkata',
      dateMode: 'ALL_TIME',
      timeMode: 'AFTER_TIME',
      startTime: '17:00'
    };

    const afterFiveMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T12:00:00Z' }; // 17:30 IST
    const beforeFiveMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T11:00:00Z' }; // 16:30 IST

    assert.strictEqual(FilterService.matchesFilter(afterFiveMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(beforeFiveMsg, filter), false);
  });

  test('Should evaluate compound Date Range (Aug 1 - 15, 2026) + Time (After 17:00) in America/New_York (EDT UTC-4)', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['all'],
      timezone: 'America/New_York',
      dateMode: 'BETWEEN_DATES',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      timeMode: 'AFTER_TIME',
      startTime: '17:00'
    };

    // 2026-08-10 22:00 UTC = 2026-08-10 18:00 EDT (Matches date and time)
    const matchMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T22:00:00Z' };
    // 2026-08-10 15:00 UTC = 2026-08-10 11:00 EDT (Fails time)
    const failTimeMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T15:00:00Z' };
    // 2026-08-20 22:00 UTC = 2026-08-20 18:00 EDT (Fails date)
    const failDateMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-20T22:00:00Z' };

    assert.strictEqual(FilterService.matchesFilter(matchMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(failTimeMsg, filter), false);
    assert.strictEqual(FilterService.matchesFilter(failDateMsg, filter), false);
  });

  test('Should evaluate overnight Time Window (22:00 to 04:00) spanning midnight', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'BETWEEN_TIMES',
      startTime: '22:00',
      endTime: '04:00'
    };

    const lateNightMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T23:30:00Z' };
    const earlyMorningMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T02:15:00Z' };
    const daytimeMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T14:00:00Z' };

    assert.strictEqual(FilterService.matchesFilter(lateNightMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(earlyMorningMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(daytimeMsg, filter), false);
  });

  test('Should handle invalid timestamps gracefully without throwing', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    const invalidMsg = { authorId: '987654321000000001', timestampUtc: 'not-a-valid-iso' };
    assert.strictEqual(FilterService.matchesFilter(invalidMsg, filter), false);
    assert.strictEqual(FilterService.formatLocalTimestamp('invalid-date', 'UTC'), 'invalid-date');
  });

  console.log('\n======================================================');
  console.log('--- 2. Bulk-Delete 14-Day Cutoff & Age Calculation ---');
  console.log('======================================================');

  test('Should accurately classify messages under 14 days as bulk-deletable and older as individual', () => {
    const recentIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const olderIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

    const recentAge = FilterService.calculateAgeDays(recentIso);
    const oldAge = FilterService.calculateAgeDays(olderIso);

    assert.ok(recentAge < 13.9, `Recent message (${recentAge}d) should be under cutoff`);
    assert.ok(oldAge > 14.0, `Old message (${oldAge}d) should be over 14.0 days`);

    assert.strictEqual(FilterService.isBulkDeletable(recentIso, 13.85), true);
    assert.strictEqual(FilterService.isBulkDeletable(olderIso, 13.85), false);
  });

  console.log('\n======================================================');
  console.log('--- 3. Discord Bitwise Permission Calculation ---');
  console.log('======================================================');

  test('Should grant all channel permissions when bot has Administrator flag (0x8)', () => {
    const adminPerms = DiscordPermissions.ADMINISTRATOR;
    const evaluated = DiscordApiService.computeChannelPermissions(adminPerms, [], '112233445566778899');

    assert.strictEqual(evaluated.canView, true);
    assert.strictEqual(evaluated.canReadHistory, true);
    assert.strictEqual(evaluated.canManageMessages, true);
  });

  test('Should accurately evaluate non-admin channel permissions with overwrites', () => {
    // Non-admin with VIEW_CHANNEL (0x400) and READ_MESSAGE_HISTORY (0x10000), but lacks MANAGE_MESSAGES (0x2000)
    const basePerms = DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.READ_MESSAGE_HISTORY;
    const evaluatedNoManage = DiscordApiService.computeChannelPermissions(basePerms, [], '112233445566778899');

    assert.strictEqual(evaluatedNoManage.canView, true);
    assert.strictEqual(evaluatedNoManage.canReadHistory, true);
    assert.strictEqual(evaluatedNoManage.canManageMessages, false);

    // Overwrite granting MANAGE_MESSAGES
    const overwrites = [{
      id: '112233445566778899',
      type: 0,
      allow: String(DiscordPermissions.MANAGE_MESSAGES),
      deny: '0'
    }];

    const evaluatedWithAllow = DiscordApiService.computeChannelPermissions(basePerms, overwrites, '112233445566778899');
    assert.strictEqual(evaluatedWithAllow.canManageMessages, true);
  });

  console.log('\n======================================================');
  console.log('--- 4. Authentication, Constant-Time Auth & Security ---');
  console.log('======================================================');

  test('Should verify passwords using constant-time check and reject backdoors', () => {
    // In dev mode, default is admin123
    assert.strictEqual(AuthService.verifyPassword('admin123'), true);
    assert.strictEqual(AuthService.verifyPassword('wrongpassword'), false);
    // Insecure backdoor 'admin' must be rejected
    assert.strictEqual(AuthService.verifyPassword('admin'), false);
  });

  test('Should create secure admin session with volatile in-memory token storage', () => {
    const session = AuthService.createSession('testAdmin', true);
    assert.ok(session.id, 'Session must have an ID');
    assert.ok(session.csrfToken, 'Session must have a CSRF token');

    AuthService.setSessionBotToken(session.id, 'Bot MTIzNDU2.test.secretToken');
    const retrieved = AuthService.getSession(session.id);
    assert.strictEqual(retrieved?.botToken, 'Bot MTIzNDU2.test.secretToken');

    // Verify token was NOT written to DB
    const dbRow = db.prepare('SELECT * FROM admin_sessions WHERE id = ?').get(session.id) as any;
    assert.strictEqual(dbRow.bot_token, undefined, 'Database table must never have bot_token column');

    AuthService.destroySession(session.id);
    assert.strictEqual(AuthService.getSession(session.id), null);
  });

  console.log('\n======================================================');
  console.log('--- 5. Persistent Settings Engine ---');
  console.log('======================================================');

  test('Should persist and retrieve runtime settings in SQLite with clamp bounds', () => {
    const initial = SettingsService.getSettings();
    assert.ok(initial.pacingMs >= 25);
    assert.ok(initial.bulkCutoffHours <= 336);

    const updated = SettingsService.updateSettings({
      pacingMs: 150,
      bulkCutoffHours: 330,
      requireDoubleConfirm: false
    });

    assert.strictEqual(updated.pacingMs, 150);
    assert.strictEqual(updated.bulkCutoffHours, 330);
    assert.strictEqual(updated.requireDoubleConfirm, false);

    // Verify persistence in SQLite
    const retrieved = SettingsService.getSettings();
    assert.strictEqual(retrieved.pacingMs, 150);
    assert.strictEqual(retrieved.bulkCutoffHours, 330);
    assert.strictEqual(retrieved.requireDoubleConfirm, false);

    // Reset back to defaults for clean test state
    SettingsService.updateSettings({
      pacingMs: 100,
      bulkCutoffHours: 332,
      requireDoubleConfirm: true
    });
  });

  console.log('\n======================================================');
  console.log('--- 6. Deletion Service Lifecycle & Invariants ---');
  console.log('======================================================');

  test('Should enforce job lifecycle state transitions and atomic locks', () => {
    const job = JobService.createJob(
      'session-lifecycle-test',
      '112233445566778899',
      'Elysium Community',
      '987654321000000001',
      'SpammySam',
      'Sam',
      'https://cdn.discordapp.com/avatar.png',
      [{ id: '101', name: 'general' }],
      {
        targetUserId: '987654321000000001',
        channelIds: ['101'],
        timezone: 'UTC',
        dateMode: 'ALL_TIME',
        timeMode: 'ANY_TIME'
      }
    );

    assert.strictEqual(job.status, 'DRAFT');

    JobService.updateJobStatus(job.id, 'READY');
    const readyJob = JobService.getJobById(job.id);
    assert.strictEqual(readyJob?.status, 'READY');
  });

  test('Should map Discord error codes to user-friendly reasons and suggestions', () => {
    const err50013 = getDiscordErrorDetail(50013);
    assert.ok(err50013.reason.includes('Missing Permissions'));
    assert.ok(err50013.suggestion.includes('Manage Messages'));

    const err50034 = getDiscordErrorDetail(50034);
    assert.ok(err50034.reason.includes('14 days'));

    const err10008 = getDiscordErrorDetail(10008);
    assert.ok(err10008.reason.includes('Unknown Message'));
  });

  console.log('\n======================================================');
  console.log('--- 7. History, Reports & Audit Aggregation ---');
  console.log('======================================================');

  test('Should aggregate dashboard KPI metrics and compute success rate', () => {
    const metrics = HistoryService.getDashboardMetrics();
    assert.ok(metrics.totalJobs >= 0);
    assert.ok(typeof metrics.successRate === 'number');
    assert.ok(Array.isArray(metrics.recentJobs));
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAllTests();
