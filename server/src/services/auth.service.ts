import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AdminSession } from '../types';
import { logger } from '../utils/logger';

// In-memory token cache keyed by session ID (NEVER persisted to disk or database)
const inMemorySessionTokens = new Map<string, string>();

/**
 * Clean up expired sessions on startup and during authentication checks.
 */
export function cleanupExpiredSessions() {
  const now = Date.now();
  try {
    const expired = db.prepare('SELECT id FROM admin_sessions WHERE expires_at < ?').all(now) as { id: string }[];
    for (const exp of expired) {
      inMemorySessionTokens.delete(exp.id);
    }
    db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now);
  } catch (err) {
    logger.error('Failed to clean up expired sessions', err);
  }
}

export class AuthService {
  private static SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Verify password using constant-time comparison to prevent timing attacks.
   */
  public static verifyPassword(inputPassword: string): boolean {
    if (!inputPassword || typeof inputPassword !== 'string') {
      return false;
    }

    const expectedPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');

    if (!expectedPassword) {
      logger.error('CRITICAL: ADMIN_PASSWORD environment variable is not configured in production mode.');
      return false;
    }

    try {
      const inputBuffer = Buffer.from(inputPassword, 'utf8');
      const expectedBuffer = Buffer.from(expectedPassword, 'utf8');

      if (inputBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  public static createSession(adminUser: string, isDemo: boolean = false): AdminSession {
    cleanupExpiredSessions();
    const sessionId = uuidv4();
    const csrfToken = uuidv4().replace(/-/g, '');
    const now = Date.now();
    const expiresAt = now + this.SESSION_DURATION_MS;

    const stmt = db.prepare(`
      INSERT INTO admin_sessions (id, admin_user, csrf_token, is_demo, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(sessionId, adminUser, csrfToken, isDemo ? 1 : 0, now, expiresAt);

    logger.info(`Created admin session for user: ${adminUser} (isDemo: ${isDemo})`);

    return {
      id: sessionId,
      adminUser,
      csrfToken,
      isDemo,
      createdAt: now,
      expiresAt
    };
  }

  public static getSession(sessionId: string): AdminSession | null {
    if (!sessionId) return null;
    const now = Date.now();

    const row = db.prepare(`
      SELECT id, admin_user as adminUser, csrf_token as csrfToken, is_demo as isDemo, created_at as createdAt, expires_at as expiresAt
      FROM admin_sessions
      WHERE id = ? AND expires_at > ?
    `).get(sessionId, now) as any;

    if (!row) return null;

    const botToken = inMemorySessionTokens.get(sessionId);

    return {
      id: row.id,
      adminUser: row.adminUser,
      csrfToken: row.csrfToken,
      isDemo: Boolean(row.isDemo),
      botToken,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt
    };
  }

  public static setSessionBotToken(sessionId: string, token: string) {
    inMemorySessionTokens.set(sessionId, token);
    logger.info(`Attached bot token to active session ${sessionId.substring(0, 8)}...`);
  }

  public static clearSessionBotToken(sessionId: string) {
    inMemorySessionTokens.delete(sessionId);
    logger.info(`Cleared bot token for session ${sessionId.substring(0, 8)}...`);
  }

  public static destroySession(sessionId: string) {
    inMemorySessionTokens.delete(sessionId);
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sessionId);
    logger.info(`Destroyed admin session ${sessionId.substring(0, 8)}...`);
  }
}
