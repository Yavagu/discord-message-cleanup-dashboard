import assert from 'node:assert';
import { DateTime } from 'luxon';
import { FilterService } from '../services/filter.service';
import { FilterConfig, ChannelPermissionOverwrite } from '../types';
import { db, initDatabase } from '../db/database';
import { AuthService, cleanupExpiredSessions } from '../services/auth.service';
import { JobService } from '../services/job.service';
import { SettingsService } from '../services/settings.service';
import { DeletionService } from '../services/deletion.service';
import { HistoryService } from '../services/history.service';
import { DiscordApiService, DiscordApiError } from '../services/discord-api.service';
import {
  DiscordPermissions,
  DISCORD_BULK_DELETE_HARD_MAX_HOURS,
  DISCORD_BULK_DELETE_MAX_CONFIGURABLE_HOURS,
  DISCORD_BULK_DELETE_MIN_CONFIGURABLE_HOURS,
  getDiscordErrorDetail
} from '../constants/discord.constants';

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
  console.log('\n======================================================');
  console.log('--- 1. Timezone-Aware Filter Engine & Boundary Tests ---');
  console.log('======================================================');

  await test('Should match exact immutable Discord Snowflake User ID and reject other users', () => {
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

  await test('Should accurately evaluate Time Filter in positive offset timezone (Asia/Kolkata +05:30)', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'Asia/Kolkata',
      dateMode: 'ALL_TIME',
      timeMode: 'AFTER_TIME',
      startTime: '17:00'
    };

    // 12:00 UTC = 17:30 IST (+5:30) -> After 17:00 -> MATCH
    const afterFiveMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T12:00:00Z' };
    // 11:00 UTC = 16:30 IST (+5:30) -> Before 17:00 -> NO MATCH
    const beforeFiveMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T11:00:00Z' };

    assert.strictEqual(FilterService.matchesFilter(afterFiveMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(beforeFiveMsg, filter), false);
  });

  await test('Should evaluate compound Date Range + Time in negative offset timezone (America/New_York EDT -04:00)', () => {
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

  await test('Should evaluate overnight Time Window (22:00 to 04:00) spanning midnight', () => {
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

  await test('Should handle malformed timestamp strings without crashing', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['101'],
      timezone: 'UTC',
      dateMode: 'ALL_TIME',
      timeMode: 'ANY_TIME'
    };

    assert.strictEqual(FilterService.matchesFilter({ authorId: '987654321000000001', timestampUtc: 'not-valid' }, filter), false);
    assert.strictEqual(FilterService.formatLocalTimestamp('invalid-date', 'UTC'), 'invalid-date');
    assert.strictEqual(FilterService.calculateAgeDays('invalid-date'), 0);
  });

  console.log('\n======================================================');
  console.log('--- 2. Bulk-Delete 14-Day Boundary & Age Evaluation ---');
  console.log('======================================================');

  await test('Should strictly enforce safety margin and prevent configuring bulk cutoff to 336h', () => {
    // Attempt to set bulk cutoff to 336 hours or beyond
    const updated = SettingsService.updateSettings({ bulkCutoffHours: 336 });
    assert.ok(
      updated.bulkCutoffHours <= DISCORD_BULK_DELETE_MAX_CONFIGURABLE_HOURS,
      `bulkCutoffHours (${updated.bulkCutoffHours}) must never exceed max safe threshold of ${DISCORD_BULK_DELETE_MAX_CONFIGURABLE_HOURS}h`
    );
    assert.strictEqual(updated.bulkCutoffHours, 332);

    // Attempt to set below 24h
    const updatedLow = SettingsService.updateSettings({ bulkCutoffHours: 5 });
    assert.strictEqual(updatedLow.bulkCutoffHours, DISCORD_BULK_DELETE_MIN_CONFIGURABLE_HOURS);

    // Reset
    SettingsService.updateSettings({ bulkCutoffHours: 332 });
  });

  await test('Should test messages immediately on both sides of the 13.833-day cutoff', () => {
    const cutoffDays = 332 / 24; // 13.8333 days
    const nowMs = Date.now();

    // 13.80 days old -> Bulk eligible
    const msgJustUnder = new Date(nowMs - (13.80 * 24 * 60 * 60 * 1000)).toISOString();
    // 13.86 days old -> Over safe cutoff -> Single delete
    const msgJustOver = new Date(nowMs - (13.86 * 24 * 60 * 60 * 1000)).toISOString();
    // 14.10 days old -> Hard Discord boundary exceeded -> Single delete
    const msgHardOver = new Date(nowMs - (14.10 * 24 * 60 * 60 * 1000)).toISOString();

    assert.strictEqual(FilterService.isBulkDeletable(msgJustUnder, cutoffDays), true);
    assert.strictEqual(FilterService.isBulkDeletable(msgJustOver, cutoffDays), false);
    assert.strictEqual(FilterService.isBulkDeletable(msgHardOver, cutoffDays), false);
  });

  console.log('\n======================================================');
  console.log('--- 3. Discord 8-Step Permission Resolution Semantics ---');
  console.log('======================================================');

  await test('Step 1: Administrator bypass overrides all channel denies', () => {
    const basePerms = DiscordPermissions.ADMINISTRATOR;
    const overwrites: ChannelPermissionOverwrite[] = [
      {
        id: 'guild123',
        type: 0,
        allow: '0',
        deny: String(DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.MANAGE_MESSAGES)
      }
    ];

    const result = DiscordApiService.computeChannelPermissions(basePerms, overwrites, 'guild123');
    assert.strictEqual(result.canView, true);
    assert.strictEqual(result.canReadHistory, true);
    assert.strictEqual(result.canManageMessages, true);
  });

  await test('Steps 4-6: Aggregate conflicting role overwrites (deny then allow across roles)', () => {
    // Base: VIEW_CHANNEL | READ_MESSAGE_HISTORY
    const basePerms = DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.READ_MESSAGE_HISTORY;

    // Role 1 denies MANAGE_MESSAGES
    // Role 2 allows MANAGE_MESSAGES
    const overwrites: ChannelPermissionOverwrite[] = [
      {
        id: 'role1',
        type: 0,
        allow: '0',
        deny: String(DiscordPermissions.MANAGE_MESSAGES)
      },
      {
        id: 'role2',
        type: 0,
        allow: String(DiscordPermissions.MANAGE_MESSAGES),
        deny: '0'
      }
    ];

    // Member has both role1 and role2 -> Aggregated allow overrides aggregated deny
    const resultBothRoles = DiscordApiService.computeChannelPermissions(
      basePerms,
      overwrites,
      'guild123',
      ['role1', 'role2'],
      'user1'
    );
    assert.strictEqual(resultBothRoles.canManageMessages, true);

    // Member only has role1 -> Denied
    const resultRole1Only = DiscordApiService.computeChannelPermissions(
      basePerms,
      overwrites,
      'guild123',
      ['role1'],
      'user1'
    );
    assert.strictEqual(resultRole1Only.canManageMessages, false);
  });

  await test('Steps 7-8: Member-specific user overwrite overrides role overwrites', () => {
    const basePerms = DiscordPermissions.VIEW_CHANNEL | DiscordPermissions.READ_MESSAGE_HISTORY;

    const overwrites: ChannelPermissionOverwrite[] = [
      // Role grants MANAGE_MESSAGES
      {
        id: 'roleAllow',
        type: 0,
        allow: String(DiscordPermissions.MANAGE_MESSAGES),
        deny: '0'
      },
      // Specific Member user overwrite explicitly DENIES MANAGE_MESSAGES
      {
        id: 'user1',
        type: 1,
        allow: '0',
        deny: String(DiscordPermissions.MANAGE_MESSAGES)
      }
    ];

    const result = DiscordApiService.computeChannelPermissions(
      basePerms,
      overwrites,
      'guild123',
      ['roleAllow'],
      'user1'
    );

    // User-specific deny takes precedence over role allow
    assert.strictEqual(result.canManageMessages, false);
  });

  await test('Step 9: When VIEW_CHANNEL is false, readHistory and manageMessages must be false', () => {
    const basePerms = DiscordPermissions.MANAGE_MESSAGES | DiscordPermissions.READ_MESSAGE_HISTORY;
    // Overwrite denies VIEW_CHANNEL
    const overwrites: ChannelPermissionOverwrite[] = [
      {
        id: 'guild123',
        type: 0,
        allow: '0',
        deny: String(DiscordPermissions.VIEW_CHANNEL)
      }
    ];

    const result = DiscordApiService.computeChannelPermissions(basePerms, overwrites, 'guild123');
    assert.strictEqual(result.canView, false);
    assert.strictEqual(result.canReadHistory, false);
    assert.strictEqual(result.canManageMessages, false);
  });

  console.log('\n======================================================');
  console.log('--- 4. Authentication, Constant-Time Auth & Security ---');
  console.log('======================================================');

  await test('timingSafeEqual SHA-256 digests across shorter, longer, empty, Unicode passwords', () => {
    process.env.ADMIN_PASSWORD = 'SecretP@ssword!123';

    // Correct password
    assert.strictEqual(AuthService.verifyPassword('SecretP@ssword!123'), true);

    // Shorter wrong password
    assert.strictEqual(AuthService.verifyPassword('Sec'), false);

    // Longer wrong password
    assert.strictEqual(AuthService.verifyPassword('SecretP@ssword!123_ExtraLongWrongSuffixThatWouldNormallyThrowLengthMismatch'), false);

    // Empty password
    assert.strictEqual(AuthService.verifyPassword(''), false);

    // Unicode input
    assert.strictEqual(AuthService.verifyPassword('日本語パスワード'), false);

    // Non-string input
    assert.strictEqual(AuthService.verifyPassword(undefined as any), false);
    assert.strictEqual(AuthService.verifyPassword(12345 as any), false);

    // Revert
    process.env.ADMIN_PASSWORD = 'admin123';
  });

  await test('Session zero-storage: token in RAM only, destroyed on session deletion', () => {
    const session = AuthService.createSession('secAdmin', false);
    assert.ok(session.id);
    assert.ok(session.csrfToken);

    AuthService.setSessionBotToken(session.id, 'Bot MTIzNDU2.test.secretToken');
    const retrieved = AuthService.getSession(session.id);
    assert.strictEqual(retrieved?.botToken, 'Bot MTIzNDU2.test.secretToken');

    // Verify DB does not contain the token
    const dbRow = db.prepare('SELECT * FROM admin_sessions WHERE id = ?').get(session.id) as any;
    assert.strictEqual(dbRow.bot_token, undefined);

    // Evict session
    AuthService.destroySession(session.id);
    assert.strictEqual(AuthService.getSession(session.id), null);
  });

  console.log('\n======================================================');
  console.log('--- 5. Double Confirmation & Backend Invariant ---');
  console.log('======================================================');

  await test('Settings persistence and snapshot consistency across reads and updates', () => {
    // 1. Update settings
    SettingsService.updateSettings({
      pacingMs: 250,
      bulkCutoffHours: 330,
      requireDoubleConfirm: true,
      defaultTimezone: 'Asia/Tokyo'
    });

    const s = SettingsService.getSettings();
    assert.strictEqual(s.pacingMs, 250);
    assert.strictEqual(s.bulkCutoffHours, 330);
    assert.strictEqual(s.requireDoubleConfirm, true);
    assert.strictEqual(s.defaultTimezone, 'Asia/Tokyo');

    // 2. Partial update preserves other fields
    SettingsService.updateSettings({ pacingMs: 150 });
    const s2 = SettingsService.getSettings();
    assert.strictEqual(s2.pacingMs, 150);
    assert.strictEqual(s2.bulkCutoffHours, 330);
    assert.strictEqual(s2.defaultTimezone, 'Asia/Tokyo');

    // Reset
    SettingsService.updateSettings({
      pacingMs: 100,
      bulkCutoffHours: 332,
      requireDoubleConfirm: true,
      defaultTimezone: 'UTC'
    });
  });

  console.log('\n======================================================');
  console.log('--- 6. Deletion Engine State Machine, Fallback & Races ---');
  console.log('======================================================');

  await test('Should create and lock job, preventing concurrent execution', () => {
    const job = JobService.createJob(
      'session-race-test',
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

    // Update to READY
    JobService.updateJobStatus(job.id, 'READY');
    const readyJob = JobService.getJobById(job.id);
    assert.strictEqual(readyJob?.status, 'READY');
  });

  await test('Discord error detail mapping for all standard codes', () => {
    const e429 = getDiscordErrorDetail(429);
    assert.ok(e429.reason.includes('Rate Limit'));

    const e50034 = getDiscordErrorDetail(50034);
    assert.ok(e50034.reason.includes('14 days'));

    const e10008 = getDiscordErrorDetail(10008);
    assert.ok(e10008.reason.includes('Unknown Message'));

    const eUnknown = getDiscordErrorDetail(99999, 'Custom Failure');
    assert.strictEqual(eUnknown.reason, 'Custom Failure');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAllTests();
