import { db } from '../db/database';
import {
  CleanupFailure,
  CleanupJobRow,
  JobProgressUpdate,
  JobStatus,
  ScannedMessageRow
} from '../types';
import { SettingsService } from './settings.service';
import { FilterService } from './filter.service';
import { DiscordApiService, DiscordApiError } from './discord-api.service';
import { deleteMockMessage } from './mock.service';
import {
  DISCORD_BULK_DELETE_MAX_BATCH_SIZE,
  DISCORD_BULK_DELETE_MIN_BATCH_SIZE
} from '../constants/discord.constants';
import { logger } from '../utils/logger';

function getDiscordErrorDetail(code: number | string, customMessage?: string): { reason: string; suggestion?: string } {
  switch (Number(code)) {
    case 50013:
      return {
        reason: 'Missing Permissions: The bot lacks MANAGE_MESSAGES permission in this channel or role hierarchy forbids deleting this message.',
        suggestion: 'Grant the bot Manage Messages permission and ensure its highest role is placed above target user roles.'
      };
    case 10008:
      return {
        reason: 'Unknown Message: The message was already deleted or does not exist.',
        suggestion: 'No action needed; message was already removed.'
      };
    case 50034:
      return {
        reason: 'Invalid Bulk Delete: Messages older than 14 days cannot be deleted in bulk.',
        suggestion: 'Older messages are automatically routed to individual deletion.'
      };
    case 50001:
      return {
        reason: 'Missing Access: The bot cannot view or access this channel.',
        suggestion: 'Ensure the bot has View Channel permission for this channel.'
      };
    case 429:
      return {
        reason: 'Rate Limited: Discord rate limit exceeded.',
        suggestion: 'Increase pacing delay in dashboard settings.'
      };
    default:
      return {
        reason: customMessage || `Discord API error (${code})`,
        suggestion: 'Check bot permissions and channel settings.'
      };
  }
}

export class DeletionService {
  private static cancellationTokens = new Set<string>();

  public static cancelJob(jobId: string): void {
    this.cancellationTokens.add(jobId);
  }

  public static isCancelled(jobId: string): boolean {
    return this.cancellationTokens.has(jobId);
  }

  public static clearCancellation(jobId: string): void {
    this.cancellationTokens.delete(jobId);
  }

  /**
   * Atomically validates session ownership and transitions job status from READY to DELETING.
   * Returns success = true and targetRows if lock was acquired, or success = false with error reason.
   */
  public static reserveExecution(
    jobId: string,
    sessionId: string,
    selectedMessageIds: string[] | null
  ): { success: boolean; targetRows?: ScannedMessageRow[]; error?: string; code?: string } {
    // 1. Authorize session ownership and validate job state
    const job = db.prepare(`
      SELECT * FROM cleanup_jobs WHERE id = ? AND session_id = ?
    `).get(jobId, sessionId) as unknown as CleanupJobRow | undefined;

    if (!job) {
      return { success: false, error: `Job ${jobId} not found or unauthorized for this session`, code: 'NOT_FOUND' };
    }

    if (job.status !== 'READY') {
      return {
        success: false,
        error: `Conflict: Cleanup job is currently in ${job.status} state (expected READY)`,
        code: 'CONFLICT'
      };
    }

    const scannedRows = db.prepare(`
      SELECT * FROM job_scanned_messages WHERE job_id = ?
    `).all(jobId) as unknown as ScannedMessageRow[];

    if (scannedRows.length === 0) {
      return { success: false, error: 'No scanned messages found for this cleanup job', code: 'NO_MESSAGES' };
    }

    const scannedMap = new Map<string, ScannedMessageRow>(scannedRows.map(r => [r.message_id, r]));

    // 2. Revalidate selected message IDs belong to the scanned results of this job
    let targetRows: ScannedMessageRow[] = [];
    if (!selectedMessageIds || selectedMessageIds.length === 0) {
      targetRows = scannedRows;
    } else {
      const uniqueIds = Array.from(new Set(selectedMessageIds));
      for (const msgId of uniqueIds) {
        const item = scannedMap.get(msgId);
        if (!item) {
          return { success: false, error: `Security rejection: Message ID ${msgId} was not part of the scanned results for job ${jobId}`, code: 'INVALID_MESSAGES' };
        }
        targetRows.push(item);
      }
    }

    // 3. Atomically transition status from READY to DELETING
    const lockResult = db.prepare(`
      UPDATE cleanup_jobs
      SET status = 'DELETING', started_at = ?, selected_count = ?
      WHERE id = ? AND session_id = ? AND status = 'READY'
    `).run(new Date().toISOString(), targetRows.length, jobId, sessionId);

    if (lockResult.changes === 0) {
      return { success: false, error: 'Conflict: Cleanup job is already being processed or is not in READY state', code: 'CONFLICT' };
    }

    // 4. Execution lock acquired: clear cancellation token for this execution run
    this.clearCancellation(jobId);

    return { success: true, targetRows };
  }

  /**
   * Executes deletion for a scanned job.
   * Execution lifecycle:
   * 1. Authenticate session ownership and validate that the job is in READY state.
   * 2. Revalidate selected messages belong to this job.
   * 3. Atomically acquire lock and transition job status from READY to DELETING.
   * 4. Clear cancellation token.
   * 5. Route messages younger than 14 days to bulk deletion batches, and older messages to paced individual delete.
   * 6. Dynamically handle Discord 50034 errors by falling back to paced individual deletion.
   * 7. Persist failures and transition to terminal status (COMPLETED / PARTIALLY_COMPLETED / FAILED / CANCELLED).
   */
  public static async executeDeletion(
    jobId: string,
    sessionId: string,
    selectedMessageIds: string[] | null,
    isDemo = false,
    botToken?: string,
    onProgress?: (update: JobProgressUpdate) => void,
    preReservedRows?: ScannedMessageRow[]
  ): Promise<{
    status: JobStatus;
    totalSelected: number;
    deletedCount: number;
    failedCount: number;
    failures: CleanupFailure[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    const pacingMs = SettingsService.getPacingMs();
    const bulkCutoffDays = SettingsService.getBulkCutoffDays();

    let targetRows = preReservedRows;
    if (!targetRows) {
      const reservation = this.reserveExecution(jobId, sessionId, selectedMessageIds);
      if (!reservation.success) {
        throw new Error(reservation.error || 'Failed to acquire execution lock');
      }
      targetRows = reservation.targetRows!;
    }

    logger.info(`Job ${jobId} locked and transitioning to DELETING (${targetRows.length} messages, pacing: ${pacingMs}ms, cutoff: ${bulkCutoffDays.toFixed(2)}d)`);

    const totalSelected = targetRows.length;
    let deletedCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failures: CleanupFailure[] = [];

    const channelMap = new Map<string, ScannedMessageRow[]>();
    for (const msg of targetRows) {
      if (!channelMap.has(msg.channel_id)) {
        channelMap.set(msg.channel_id, []);
      }
      channelMap.get(msg.channel_id)!.push(msg);
    }

    const emitProgress = (channelName?: string, currentMsgId?: string) => {
      const remaining = totalSelected - processedCount;
      const percent = totalSelected > 0 ? Math.round((processedCount / totalSelected) * 100) : 100;
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = processedCount > 0 && elapsedSec > 0 ? processedCount / elapsedSec : 1;
      const etaSeconds = Math.round(remaining / rate);

      if (onProgress) {
        onProgress({
          jobId,
          status: 'DELETING',
          totalSelected,
          processed: processedCount,
          deleted: deletedCount,
          failed: failedCount,
          remaining,
          percent,
          currentChannelName: channelName,
          currentMessageId: currentMsgId,
          rateLimitPacingMs: pacingMs,
          etaSeconds
        });
      }
    };

    emitProgress();

    try {
      for (const [channelId, msgs] of channelMap.entries()) {
        if (this.isCancelled(jobId)) {
          logger.info(`Job ${jobId} cancelled before channel ${channelId}`);
          break;
        }

        const channelName = msgs[0]?.channel_name || channelId;

        // Recalculate message age against live time because jobs may sit in READY long enough to cross the cutoff
        const bulkEligible: ScannedMessageRow[] = [];
        const individualOnly: ScannedMessageRow[] = [];

        for (const m of msgs) {
          const liveAgeDays = FilterService.calculateAgeDays(m.timestamp_utc);
          if (liveAgeDays < bulkCutoffDays) {
            bulkEligible.push(m);
          } else {
            individualOnly.push(m);
          }
        }

        // Process bulk deletions in chunks of 2 to 100
        while (bulkEligible.length > 0) {
          if (this.isCancelled(jobId)) break;

          // Discord bulk delete endpoint requires at least 2 messages; single leftovers fall back to individual delete
          if (bulkEligible.length < DISCORD_BULK_DELETE_MIN_BATCH_SIZE) {
            individualOnly.push(bulkEligible.pop()!);
            break;
          }

          const batch = bulkEligible.splice(0, Math.min(DISCORD_BULK_DELETE_MAX_BATCH_SIZE, bulkEligible.length));
          const batchIds = batch.map(b => b.message_id);

          if (isDemo) {
            await new Promise(r => setTimeout(r, Math.max(50, pacingMs)));
            for (const b of batch) {
              deleteMockMessage('demo-guild', b.message_id);
              deletedCount++;
              processedCount++;
            }
            emitProgress(channelName, batchIds[0]);
          } else {
            try {
              await DiscordApiService.request(
                `/channels/${channelId}/messages/bulk-delete`,
                botToken!,
                {
                  method: 'POST',
                  body: { messages: batchIds }
                }
              );

              deletedCount += batch.length;
              processedCount += batch.length;
            } catch (err: unknown) {
              const discordCode = err instanceof DiscordApiError ? err.discordCode : undefined;
              const statusCode = err instanceof DiscordApiError ? err.statusCode : 0;
              const errMessage = err instanceof Error ? err.message : String(err);

              // If Discord rejects bulk delete due to age (50034), fall back to individual paced deletion
              if (discordCode === 50034) {
                logger.warn(`Bulk delete rejected by Discord with 50034 on channel ${channelId}. Falling back to individual deletion.`);
                individualOnly.push(...batch);
              } else {
                const errorDetail = getDiscordErrorDetail(discordCode || statusCode || 'BULK_ERROR', errMessage);

                for (const b of batch) {
                  failedCount++;
                  processedCount++;
                  failures.push({
                    jobId,
                    messageId: b.message_id,
                    channelId,
                    channelName,
                    authorId: b.author_id,
                    timestampUtc: b.timestamp_utc,
                    errorCode: String(discordCode || statusCode || 'BULK_ERROR'),
                    failureReason: errorDetail.reason,
                    suggestions: errorDetail.suggestion
                  });
                }
              }
            }
            emitProgress(channelName, batchIds[0]);
          }
        }

        // Process older messages, single leftovers, or bulk fallbacks
        for (const m of individualOnly) {
          if (this.isCancelled(jobId)) break;

          if (isDemo) {
            await new Promise(r => setTimeout(r, Math.max(30, Math.round(pacingMs * 0.6))));
            if (m.channel_id === '106') {
              failedCount++;
              processedCount++;
              const errorDetail = getDiscordErrorDetail(50013);
              failures.push({
                jobId,
                messageId: m.message_id,
                channelId: m.channel_id,
                channelName: m.channel_name,
                authorId: m.author_id,
                timestampUtc: m.timestamp_utc,
                errorCode: '50013',
                failureReason: errorDetail.reason,
                suggestions: errorDetail.suggestion
              });
            } else {
              deleteMockMessage('demo-guild', m.message_id);
              deletedCount++;
              processedCount++;
            }
            emitProgress(channelName, m.message_id);
          } else {
            try {
              await DiscordApiService.request(
                `/channels/${channelId}/messages/${m.message_id}`,
                botToken!,
                { method: 'DELETE' }
              );

              deletedCount++;
              processedCount++;
            } catch (err: unknown) {
              const discordCode = err instanceof DiscordApiError ? err.discordCode : undefined;
              const statusCode = err instanceof DiscordApiError ? err.statusCode : 0;
              const errMessage = err instanceof Error ? err.message : String(err);

              if (discordCode === 10008) {
                failedCount++;
                processedCount++;
                const errorDetail = getDiscordErrorDetail(10008);
                failures.push({
                  jobId,
                  messageId: m.message_id,
                  channelId: m.channel_id,
                  channelName: m.channel_name,
                  authorId: m.author_id,
                  timestampUtc: m.timestamp_utc,
                  errorCode: '10008',
                  failureReason: errorDetail.reason,
                  suggestions: errorDetail.suggestion
                });
              } else {
                const errorDetail = getDiscordErrorDetail(discordCode || statusCode || 'SINGLE_ERROR', errMessage);

                failedCount++;
                processedCount++;
                failures.push({
                  jobId,
                  messageId: m.message_id,
                  channelId: m.channel_id,
                  channelName: m.channel_name,
                  authorId: m.author_id,
                  timestampUtc: m.timestamp_utc,
                  errorCode: String(discordCode || statusCode || 'SINGLE_ERROR'),
                  failureReason: errorDetail.reason,
                  suggestions: errorDetail.suggestion
                });
              }
            }

            if (pacingMs > 0 && !this.isCancelled(jobId)) {
              await new Promise(r => setTimeout(r, pacingMs));
            }
            emitProgress(channelName, m.message_id);
          }
        }
      }

      const durationMs = Date.now() - startTime;
      const isJobCancelled = this.isCancelled(jobId);

      let finalStatus: JobStatus = 'COMPLETED';
      if (isJobCancelled) {
        finalStatus = 'CANCELLED';
      } else if (failedCount > 0 && deletedCount > 0) {
        finalStatus = 'PARTIALLY_COMPLETED';
      } else if (failedCount > 0 && deletedCount === 0) {
        finalStatus = 'FAILED';
      }

      const insertFailStmt = db.prepare(`
        INSERT INTO job_failures (job_id, message_id, channel_id, channel_name, author_id, timestamp_utc, error_code, failure_reason, suggestions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.exec('BEGIN TRANSACTION;');
      try {
        for (const f of failures) {
          insertFailStmt.run(
            jobId,
            f.messageId,
            f.channelId,
            f.channelName,
            f.authorId,
            f.timestampUtc,
            f.errorCode,
            f.failureReason,
            f.suggestions || ''
          );
        }

        db.prepare(`
          UPDATE cleanup_jobs
          SET status = ?, deleted_count = ?, failed_count = ?, duration_ms = ?, completed_at = ?
          WHERE id = ?
        `).run(finalStatus, deletedCount, failedCount, durationMs, new Date().toISOString(), jobId);

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        logger.error('Failed to update job completion in DB', err);
      }

      logger.info(`Cleanup finished for job ${jobId}: ${deletedCount} deleted, ${failedCount} failed (${finalStatus}) in ${durationMs}ms`);

      if (onProgress) {
        onProgress({
          jobId,
          status: finalStatus,
          totalSelected,
          processed: processedCount,
          deleted: deletedCount,
          failed: failedCount,
          remaining: 0,
          percent: 100,
          rateLimitPacingMs: pacingMs,
          etaSeconds: 0
        });
      }

      return {
        status: finalStatus,
        totalSelected,
        deletedCount,
        failedCount,
        failures,
        durationMs
      };
    } finally {
      this.clearCancellation(jobId);
    }
  }
}
