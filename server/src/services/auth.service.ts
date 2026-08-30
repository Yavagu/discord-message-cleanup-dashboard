import crypto from 'crypto';
import { db } from '../db/database';
import { AdminSession } from '../types';
import { logger } from '../utils/logger';

// In-Memory volatile token cache: Map<sessionId, botToken>
// Discord Bot Tokens are strictly held in RAM and are NEVER written to SQLite, cookies, logs, or disk.
const sessionBotTokens = new Map<string, string>();

export class AuthService {
  /**
   * Constant-time password verification using SHA-256 digests.
   * Compares 32-byte cryptographic hashes via crypto.timingSafeEqual to guarantee
   * that different password lengths, empty strings, and Unicode inputs never throw or leak length.
   */
  public static verifyPassword(inputPassword: string): boolean {
    const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (typeof inputPassword !== 'string') {
      return false;
    }

    try {
      const inputHash = crypto.createHash('sha256').update(inputPassword, 'utf8').digest();
      const expectedHash = crypto.createHash('sha256').update(expectedPassword, 'utf8').digest();

      return crypto.timingSafeEqual(inputHash, expectedHash);
    } catch {
      return false;
    }
  }

  /**
   * Creates a new administrative session with a cryptographically secure CSRF token.
   */
  public static createSession(adminUser = 'admin', isDemo = false): AdminSession {
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    db.prepare(`
      INSERT INTO admin_sessions (id, admin_user, csrf_token, is_demo, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, adminUser, csrfToken, isDemo ? 1 : 0, now.toISOString(), expiresAt.toISOString());

    logger.info(`Created admin session for user: ${adminUser} (isDemo: ${isDemo})`);

    return {
      id: sessionId,
      adminUser,
      csrfToken,
      isDemo,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Retrieves and validates an active session from SQLite and in-memory token store.
   */
  public static getSession(sessionId?: string): AdminSession | null {
    if (!sessionId) return null;

    const row = db.prepare(`
      SELECT id, admin_user, csrf_token, is_demo, created_at, expires_at
      FROM admin_sessions
      WHERE id = ? AND expires_at > ?
    `).get(sessionId, new Date().toISOString()) as any;

    if (!row) return null;

    const botToken = sessionBotTokens.get(sessionId);

    return {
      id: row.id,
      adminUser: row.admin_user,
      csrfToken: row.csrf_token,
      isDemo: Boolean(row.is_demo),
      botToken,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }

  /**
   * Associates a Discord bot token in volatile in-memory cache for this session.
   */
  public static setSessionBotToken(sessionId: string, token: string): void {
    sessionBotTokens.set(sessionId, token);
    logger.info(`Attached bot token to active session ${sessionId.substring(0, 8)}...`);
  }

  /**
   * Removes bot token from volatile in-memory cache.
   */
  public static clearSessionBotToken(sessionId: string): void {
    sessionBotTokens.delete(sessionId);
    logger.info(`Cleared bot token for session ${sessionId.substring(0, 8)}...`);
  }

  /**
   * Destroys an active administrative session.
   */
  public static destroySession(sessionId: string): void {
    sessionBotTokens.delete(sessionId);
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sessionId);
    logger.info(`Destroyed admin session ${sessionId.substring(0, 8)}...`);
  }
}

/**
 * Periodically purge expired sessions from SQLite and volatile token memory.
 */
export function cleanupExpiredSessions(): void {
  try {
    const expiredRows = db.prepare(`
      SELECT id FROM admin_sessions WHERE expires_at <= ?
    `).all(new Date().toISOString()) as Array<{ id: string }>;

    for (const r of expiredRows) {
      sessionBotTokens.delete(r.id);
    }

    db.prepare(`
      DELETE FROM admin_sessions WHERE expires_at <= ?
    `).run(new Date().toISOString());
  } catch (err) {
    logger.error('Failed to cleanup expired sessions', err);
  }
}

// Run cleanup every 30 minutes (unref allows process to exit gracefully)
setInterval(cleanupExpiredSessions, 30 * 60 * 1000).unref();
