import assert from 'node:assert';
import { FilterService } from '../services/filter.service';
import { FilterConfig } from '../types';
import { db, initDatabase } from '../db/database';
import { AuthService } from '../services/auth.service';
import { JobService } from '../services/job.service';

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
  console.log('\n--- 1. Testing Timezone-Aware Filter Engine ---');

  test('Should match exact immutable Discord User ID and reject others', () => {
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

  test('Should accurately evaluate Time Filter (After 5:00 PM / 17:00) in Asia/Kolkata', () => {
    // 12:00 UTC = 17:30 IST (+5:30) -> After 5:00 PM
    // 11:00 UTC = 16:30 IST (+5:30) -> Before 5:00 PM
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

  test('Should accurately evaluate Compound Date Range (Aug 1 - 15, 2026) + Time (After 5:00 PM)', () => {
    const filter: FilterConfig = {
      targetUserId: '987654321000000001',
      channelIds: ['all'],
      timezone: 'America/New_York', // EDT is UTC-4
      dateMode: 'BETWEEN_DATES',
      startDate: '2026-08-01',
      endDate: '2026-08-15',
      timeMode: 'AFTER_TIME',
      startTime: '17:00'
    };

    // 2026-08-10 22:00 UTC = 2026-08-10 18:00 EDT (Match date and time)
    const matchMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T22:00:00Z' };
    // 2026-08-10 15:00 UTC = 2026-08-10 11:00 EDT (Fails time)
    const failTimeMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-10T15:00:00Z' };
    // 2026-08-20 22:00 UTC = 2026-08-20 18:00 EDT (Fails date)
    const failDateMsg = { authorId: '987654321000000001', timestampUtc: '2026-08-20T22:00:00Z' };

    assert.strictEqual(FilterService.matchesFilter(matchMsg, filter), true);
    assert.strictEqual(FilterService.matchesFilter(failTimeMsg, filter), false);
    assert.strictEqual(FilterService.matchesFilter(failDateMsg, filter), false);
  });

  console.log('\n--- 2. Testing Bulk-Delete 14-day Cutoff Calculation ---');

  test('Should classify messages under 14 days as bulk-deletable and older as individual', () => {
    const recentIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

    const recentAge = FilterService.calculateAgeDays(recentIso);
    const oldAge = FilterService.calculateAgeDays(oldIso);

    assert.ok(recentAge < 13.9, 'Recent message should be under 13.9 days');
    assert.ok(oldAge > 14.0, 'Old message should be over 14.0 days');
  });

  console.log('\n--- 3. Testing Authentication & Session Management ---');

  test('Should create secure admin session and attach bot token in memory only', () => {
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

  console.log('\n--- 4. Testing SQLite Persistence & Job Lifecycle ---');

  test('Should create and persist job record in SQLite with transactions', () => {
    const job = JobService.createJob(
      'session-test',
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
    assert.strictEqual(job.targetUserId, '987654321000000001');

    JobService.updateJobStatus(job.id, 'READY');
    const updated = JobService.getJobById(job.id);
    assert.strictEqual(updated?.status, 'READY');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAllTests();
