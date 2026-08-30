import { db } from '../db/database';
import { AppSettings } from '../types';
import {
  DISCORD_BULK_DELETE_DEFAULT_SAFETY_HOURS,
  DISCORD_DEFAULT_PACING_MS
} from '../constants/discord.constants';
import { logger } from '../utils/logger';

const DEFAULT_SETTINGS: AppSettings = {
  pacingMs: DISCORD_DEFAULT_PACING_MS,
  bulkCutoffHours: DISCORD_BULK_DELETE_DEFAULT_SAFETY_HOURS,
  requireDoubleConfirm: true,
  defaultTimezone: 'UTC',
  maxMessagesPerChannel: 1000
};

export class SettingsService {
  private static cachedSettings: AppSettings | null = null;

  /**
   * Retrieves current application settings from SQLite, initializing defaults if needed.
   */
  public static getSettings(): AppSettings {
    if (this.cachedSettings) {
      return { ...this.cachedSettings };
    }

    try {
      const rows = db.prepare('SELECT key, value, updated_at FROM app_settings').all() as Array<{
        key: string;
        value: string;
        updated_at: string;
      }>;

      if (rows.length === 0) {
        // Initialize default settings in SQLite
        this.saveSettingsToDb(DEFAULT_SETTINGS);
        this.cachedSettings = { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS };
      }

      const map = new Map(rows.map(r => [r.key, r.value]));
      const latestUpdate = rows.reduce((latest, r) => (r.updated_at > latest ? r.updated_at : latest), '');

      const settings: AppSettings = {
        pacingMs: map.has('pacingMs') ? Math.max(25, Math.min(2000, Number(map.get('pacingMs')))) : DEFAULT_SETTINGS.pacingMs,
        bulkCutoffHours: map.has('bulkCutoffHours') ? Math.max(24, Math.min(336, Number(map.get('bulkCutoffHours')))) : DEFAULT_SETTINGS.bulkCutoffHours,
        requireDoubleConfirm: map.has('requireDoubleConfirm') ? map.get('requireDoubleConfirm') === 'true' : DEFAULT_SETTINGS.requireDoubleConfirm,
        defaultTimezone: map.get('defaultTimezone') || DEFAULT_SETTINGS.defaultTimezone,
        maxMessagesPerChannel: map.has('maxMessagesPerChannel') ? Math.max(100, Math.min(10000, Number(map.get('maxMessagesPerChannel')))) : DEFAULT_SETTINGS.maxMessagesPerChannel,
        updatedAt: latestUpdate || new Date().toISOString()
      };

      this.cachedSettings = settings;
      return { ...settings };
    } catch (err) {
      logger.error('Failed to read settings from DB, using fallback defaults', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Updates application settings with validation and persists to SQLite.
   */
  public static updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated: AppSettings = {
      pacingMs: partial.pacingMs !== undefined
        ? Math.max(25, Math.min(2000, Math.round(Number(partial.pacingMs))))
        : current.pacingMs,
      bulkCutoffHours: partial.bulkCutoffHours !== undefined
        ? Math.max(24, Math.min(336, Number(partial.bulkCutoffHours)))
        : current.bulkCutoffHours,
      requireDoubleConfirm: partial.requireDoubleConfirm !== undefined
        ? Boolean(partial.requireDoubleConfirm)
        : current.requireDoubleConfirm,
      defaultTimezone: partial.defaultTimezone ? String(partial.defaultTimezone).trim() : current.defaultTimezone,
      maxMessagesPerChannel: partial.maxMessagesPerChannel !== undefined
        ? Math.max(100, Math.min(10000, Math.round(Number(partial.maxMessagesPerChannel))))
        : current.maxMessagesPerChannel,
      updatedAt: new Date().toISOString()
    };

    this.saveSettingsToDb(updated);
    this.cachedSettings = updated;
    logger.info('Application settings updated and persisted to SQLite', updated);
    return { ...updated };
  }

  /**
   * Helper to get bulk cutoff converted to days (e.g. 332 hours -> 13.833 days)
   */
  public static getBulkCutoffDays(): number {
    const settings = this.getSettings();
    return settings.bulkCutoffHours / 24;
  }

  /**
   * Helper to get pacing delay in milliseconds
   */
  public static getPacingMs(): number {
    return this.getSettings().pacingMs;
  }

  private static saveSettingsToDb(settings: AppSettings): void {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      stmt.run('pacingMs', String(settings.pacingMs), now);
      stmt.run('bulkCutoffHours', String(settings.bulkCutoffHours), now);
      stmt.run('requireDoubleConfirm', String(settings.requireDoubleConfirm), now);
      stmt.run('defaultTimezone', settings.defaultTimezone, now);
      stmt.run('maxMessagesPerChannel', String(settings.maxMessagesPerChannel), now);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      logger.error('Failed to persist settings into SQLite', err);
      throw err;
    }
  }
}
