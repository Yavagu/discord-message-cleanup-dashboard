import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { initDatabase, db } from './db/database';
import { apiRouter } from './routes/api.routes';
import { logger } from './utils/logger';
import { JobService } from './services/job.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for local client
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Session-ID']
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize SQLite schema
initDatabase();

// Seed realistic initial history if DB has zero jobs
function seedInitialData() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM cleanup_jobs').get() as any;
  if (countRow && countRow.count === 0) {
    logger.info('Seeding initial sample cleanup jobs for history showcase...');
    try {
      // Seed sample completed job
      const job1 = JobService.createJob(
        'system-seed',
        '112233445566778899',
        'Elysium Gaming Community',
        '987654321000000001',
        'SpammySam',
        'Sam (Muted)',
        'https://cdn.discordapp.com/embed/avatars/1.png',
        [{ id: '101', name: 'general-chat' }, { id: '103', name: 'game-clips-and-media' }],
        {
          targetUserId: '987654321000000001',
          targetUsername: 'SpammySam',
          channelIds: ['101', '103'],
          timezone: 'Asia/Kolkata',
          dateMode: 'LAST_7_DAYS',
          timeMode: 'AFTER_TIME',
          startTime: '17:00'
        }
      );

      db.prepare(`
        UPDATE cleanup_jobs
        SET status = 'COMPLETED', scanned_count = 523, matched_count = 523, selected_count = 523, deleted_count = 497, failed_count = 26, duration_ms = 4320,
            started_at = '2026-08-28T18:00:00.000Z', completed_at = '2026-08-28T18:00:04.320Z'
        WHERE id = ?
      `).run(job1.id);

      // Seed failure records for job 1
      const insertFail = db.prepare(`
        INSERT INTO job_failures (job_id, message_id, channel_id, channel_name, author_id, timestamp_utc, error_code, failure_reason, suggestions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 1; i <= 26; i++) {
        insertFail.run(
          job1.id,
          `9990001112223330${i}`,
          '106',
          'vip-lounge',
          '987654321000000001',
          '2026-08-28T17:35:00.000Z',
          '50013',
          'Missing Permissions: Bot lacks MANAGE_MESSAGES permission in #vip-lounge',
          'Grant the bot MANAGE_MESSAGES permission in the channel settings.'
        );
      }

      // Seed sample 2
      const job2 = JobService.createJob(
        'system-seed',
        '223344556677889900',
        'Developer Forge & Modding',
        '987654321000000004',
        'CryptoPromoBot',
        'Crypto Daily Alerts [BOT]',
        'https://cdn.discordapp.com/embed/avatars/5.png',
        [{ id: '201', name: 'welcome-and-rules' }, { id: '202', name: 'dev-general' }],
        {
          targetUserId: '987654321000000004',
          targetUsername: 'CryptoPromoBot',
          channelIds: ['all'],
          timezone: 'America/New_York',
          dateMode: 'ALL_TIME',
          timeMode: 'ANY_TIME'
        }
      );

      db.prepare(`
        UPDATE cleanup_jobs
        SET status = 'COMPLETED', scanned_count = 1240, matched_count = 186, selected_count = 186, deleted_count = 186, failed_count = 0, duration_ms = 2810,
            started_at = '2026-08-29T14:10:00.000Z', completed_at = '2026-08-29T14:10:02.810Z'
        WHERE id = ?
      `).run(job2.id);

      logger.info('Sample cleanup history successfully seeded.');
    } catch (e) {
      logger.error('Failed to seed sample history', e);
    }
  }
}

seedInitialData();

// Register API router
app.use('/api', apiRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Discord Cleanup Backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  logger.info(`🚀 Discord Cleanup Backend running on http://localhost:${PORT}`);
});
