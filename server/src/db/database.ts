import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cleanup_dashboard.db');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for high concurrency & data integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  logger.info(`Initializing SQLite database at ${dbPath}`);

  // 1. Sessions table (Admin auth sessions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      admin_user TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      is_demo INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);
  `);

  // 2. Application Settings table (Persistent runtime configuration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 3. Cleanup Jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cleanup_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      target_display_name TEXT NOT NULL,
      target_avatar_url TEXT NOT NULL,
      channels_json TEXT NOT NULL,
      filter_config_json TEXT NOT NULL,
      timezone TEXT NOT NULL,
      scanned_count INTEGER DEFAULT 0,
      matched_count INTEGER DEFAULT 0,
      selected_count INTEGER DEFAULT 0,
      deleted_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_created ON cleanup_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cleanup_jobs_status ON cleanup_jobs(status);
  `);

  // 4. Scanned Messages table (stores messages found during scan for revalidation & preview)
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_scanned_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      author_display_name TEXT NOT NULL,
      author_avatar_url TEXT NOT NULL,
      content TEXT,
      timestamp_utc TEXT NOT NULL,
      timestamp_local_formatted TEXT NOT NULL,
      has_attachments INTEGER DEFAULT 0,
      attachment_count INTEGER DEFAULT 0,
      has_embeds INTEGER DEFAULT 0,
      embed_count INTEGER DEFAULT 0,
      is_bulk_deletable INTEGER DEFAULT 1,
      age_days REAL DEFAULT 0,
      is_selected INTEGER DEFAULT 1,
      FOREIGN KEY(job_id) REFERENCES cleanup_jobs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_scanned_job_msg ON job_scanned_messages(job_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_scanned_job_channel ON job_scanned_messages(job_id, channel_id);
  `);

  // 5. Job Failures table (records detailed failure reasons for reporting)
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      author_id TEXT NOT NULL,
      timestamp_utc TEXT NOT NULL,
      error_code TEXT NOT NULL,
      failure_reason TEXT NOT NULL,
      suggestions TEXT,
      FOREIGN KEY(job_id) REFERENCES cleanup_jobs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_failures_job ON job_failures(job_id);
  `);

  // 6. Audit logs table (admin action trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      action TEXT NOT NULL,
      details_json TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
  `);

  logger.info('Database tables verified and ready.');
}
