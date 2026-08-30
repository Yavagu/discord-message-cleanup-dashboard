import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { CleanupJob, FilterConfig, JobProgressUpdate, JobStatus } from '../types';
import { DeletionService } from './deletion.service';
import { logger } from '../utils/logger';

export class JobService {
  private static sseListeners = new Map<string, Set<Response>>();

  public static createJob(
    sessionId: string,
    guildId: string,
    guildName: string,
    targetUserId: string,
    targetUsername: string,
    targetDisplayName: string,
    targetAvatarUrl: string,
    channels: Array<{ id: string; name: string }>,
    filter: FilterConfig
  ): CleanupJob {
    const id = uuidv4();
    const now = new Date().toISOString();
    const channelsJson = JSON.stringify(channels);
    const filterJson = JSON.stringify(filter);

    const stmt = db.prepare(`
      INSERT INTO cleanup_jobs (
        id, session_id, status, guild_id, guild_name, target_user_id,
        target_username, target_display_name, target_avatar_url,
        channels_json, filter_config_json, timezone, created_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      sessionId,
      guildId,
      guildName,
      targetUserId,
      targetUsername,
      targetDisplayName,
      targetAvatarUrl,
      channelsJson,
      filterJson,
      filter.timezone,
      now
    );

    logger.info(`Created cleanup job ${id} for target user ${targetUserId} in guild ${guildName}`);

    return this.getJobForSession(id, sessionId)!;
  }

  /**
   * Retrieves a job ensuring strict session ownership.
   */
  public static getJobForSession(jobId: string, sessionId: string): CleanupJob | null {
    const row = db.prepare('SELECT * FROM cleanup_jobs WHERE id = ? AND session_id = ?').get(jobId, sessionId) as any;
    if (!row) return null;

    let filterConfig: FilterConfig;
    try {
      filterConfig = JSON.parse(row.filter_config_json);
    } catch {
      filterConfig = {
        targetUserId: row.target_user_id,
        channelIds: [],
        timezone: row.timezone,
        dateMode: 'ALL_TIME',
        timeMode: 'ANY_TIME'
      };
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      status: row.status as JobStatus,
      guildId: row.guild_id,
      guildName: row.guild_name,
      targetUserId: row.target_user_id,
      targetUsername: row.target_username,
      targetDisplayName: row.target_display_name,
      targetAvatarUrl: row.target_avatar_url,
      channelsJson: row.channels_json,
      filterConfig,
      timezone: row.timezone,
      scannedCount: row.scanned_count || 0,
      matchedCount: row.matched_count || 0,
      selectedCount: row.selected_count || 0,
      deletedCount: row.deleted_count || 0,
      failedCount: row.failed_count || 0,
      durationMs: row.duration_ms || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      error: row.error_message
    };
  }

  public static getJobByIdInternal(jobId: string): CleanupJob | null {
    const row = db.prepare('SELECT * FROM cleanup_jobs WHERE id = ?').get(jobId) as any;
    if (!row) return null;

    let filterConfig: FilterConfig;
    try {
      filterConfig = JSON.parse(row.filter_config_json);
    } catch {
      filterConfig = {
        targetUserId: row.target_user_id,
        channelIds: [],
        timezone: row.timezone,
        dateMode: 'ALL_TIME',
        timeMode: 'ANY_TIME'
      };
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      status: row.status as JobStatus,
      guildId: row.guild_id,
      guildName: row.guild_name,
      targetUserId: row.target_user_id,
      targetUsername: row.target_username,
      targetDisplayName: row.target_display_name,
      targetAvatarUrl: row.target_avatar_url,
      channelsJson: row.channels_json,
      filterConfig,
      timezone: row.timezone,
      scannedCount: row.scanned_count || 0,
      matchedCount: row.matched_count || 0,
      selectedCount: row.selected_count || 0,
      deletedCount: row.deleted_count || 0,
      failedCount: row.failed_count || 0,
      durationMs: row.duration_ms || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      error: row.error_message
    };
  }

  public static updateJobStatus(jobId: string, status: JobStatus, error?: string): void {
    db.prepare(`
      UPDATE cleanup_jobs
      SET status = ?, error_message = ?
      WHERE id = ?
    `).run(status, error || null, jobId);
  }

  public static registerSSEClientForSession(jobId: string, sessionId: string, res: Response): boolean {
    const job = this.getJobForSession(jobId, sessionId);
    if (!job) {
      return false;
    }

    if (!this.sseListeners.has(jobId)) {
      this.sseListeners.set(jobId, new Set());
    }
    this.sseListeners.get(jobId)!.add(res);

    res.on('close', () => {
      const set = this.sseListeners.get(jobId);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          this.sseListeners.delete(jobId);
        }
      }
    });

    return true;
  }

  public static broadcastProgress(update: JobProgressUpdate): void {
    const clients = this.sseListeners.get(update.jobId);
    if (clients && clients.size > 0) {
      const payload = `data: ${JSON.stringify(update)}\n\n`;
      for (const client of clients) {
        try {
          client.write(payload);
        } catch {
          clients.delete(client);
        }
      }
    }
  }

  public static cancelJobForSession(jobId: string, sessionId: string): boolean {
    const job = this.getJobForSession(jobId, sessionId);
    if (!job) return false;

    DeletionService.cancelJob(jobId);
    if (job.status === 'DELETING' || job.status === 'READY' || job.status === 'SCANNING') {
      this.updateJobStatus(jobId, 'CANCELLED');
    }
    return true;
  }
}
