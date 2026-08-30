import { db } from '../db/database';
import { CleanupFailure, JobProgressUpdate, JobStatus } from '../types';
import { deleteMockMessage } from './mock.service';
import { DiscordApiService, DiscordApiError } from './discord-api.service';
import { SettingsService } from './settings.service';
import { FilterService } from './filter.service';
import {
  DISCORD_BULK_DELETE_MAX_BATCH_SIZE,
  DISCORD_BULK_DELETE_MIN_BATCH_SIZE,
  getDiscordErrorDetail
} from '../constants/discord.constants';
import { logger } from '../utils/logger';

export interface DeletionProgressCallback {
  (update: JobProgressUpdate): void;
}

export class DeletionService {
  private static cancellationTokens = new Set<string>();

  public static cancelJob(jobId: string): boolean {
    logger.info(`Requested cancellation for job ${jobId}`);
    this.cancellationTokens.add(jobId);
    return true;
  }

  public static isCancelled(jobId: string): boolean {
    return this.cancellationTokens.has(jobId);
  }

  public static clearCancellation(jobId: string): void {
    this.cancellationTokens.delete(jobId);
  }

  /**
   * Revalidates deletion payload against SQLite job records and executes deletion
   * with live age re-evaluation against runtime bulk cutoff snapshot.
   */
  public static async executeDeletion(
    jobId: string,
    sessionId: string,
    selectedMessageIds: string[] | null,
    isDemo: boolean,
    botToken?: string,
    onProgress?: DeletionProgressCallback
  ): Promise<{
    status: JobStatus;
    totalSelected: number;
    deletedCount: number;
    failedCount: number;
    failures: CleanupFailure[];
    durationMs: number;
  }> {
    this.clearCancellation(jobId);
    const startTime = Date.now();

    // Snapshot runtime settings for the duration of this execution
    const pacingMs = SettingsService.getPacingMs();
    const bulkCutoffDays = SettingsService.getBulkCutoffDays();

    // Verify session authorization and expected state before locking
    const job = db.prepare(`
      SELECT * FROM cleanup_jobs WHERE id = ? AND session_id = ?
    `).get(jobId, sessionId) as any;

    if (!job) {
      throw new Error(`Job ${jobId} not found or unauthorized for this session`);
    }

    if (job.status !== 'READY') {
      throw new Error(`Job cannot be executed: current status is ${job.status} (expected READY)`);
    }

    const scannedRows = db.prepare(`
      SELECT * FROM job_scanned_messages WHERE job_id = ?
    `).all(jobId) as any[];

    if (scannedRows.length === 0) {
      throw new Error('No scanned messages found for this cleanup job');
    }

    const scannedMap = new Map<string, any>(scannedRows.map(r => [r.message_id, r]));

    // Revalidate that all selected message IDs belong to the current scanned job
    let targetRows: any[] = [];
    if (!selectedMessageIds || selectedMessageIds.length === 0) {
      targetRows = scannedRows;
    } else {
      const uniqueIds = Array.from(new Set(selectedMessageIds));
      for (const msgId of uniqueIds) {
        const item = scannedMap.get(msgId);
        if (!item) {
          throw new Error(`Security rejection: Message ID ${msgId} was not part of the scanned results for job ${jobId}`);
        }
        targetRows.push(item);
      }
    }

    // Atomically transition status from READY to DELETING to prevent concurrent executions
    const lockResult = db.prepare(`
      UPDATE cleanup_jobs
      SET status = 'DELETING', started_at = ?, selected_count = ?
      WHERE id = ? AND status = 'READY'
    `).run(new Date().toISOString(), targetRows.length, jobId);

    if (lockResult.changes === 0) {
      throw new Error('Conflict: Cleanup job is already being processed or is not in READY state');
    }

    logger.info(`Job ${jobId} locked and transitioning to DELETING (${targetRows.length} messages, pacing: ${pacingMs}ms, cutoff: ${bulkCutoffDays.toFixed(2)}d)`);

    const totalSelected = targetRows.length;
    let deletedCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failures: CleanupFailure[] = [];

    const channelMap = new Map<string, any[]>();
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

    for (const [channelId, msgs] of channelMap.entries()) {
      if (this.isCancelled(jobId)) {
        logger.info(`Job ${jobId} cancelled before channel ${channelId}`);
        break;
      }

      const channelName = msgs[0]?.channel_name || channelId;

      // Recalculate message age against live time because jobs may sit in READY long enough to cross the cutoff
      const bulkEligible: any[] = [];
      const individualOnly: any[] = [];

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
            deleteMockMessage(job.guild_id, b.message_id);
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
          } catch (err: any) {
            const discordCode = err instanceof DiscordApiError ? err.discordCode : undefined;

            // If Discord rejects bulk delete due to age (50034), fall back to individual paced deletion
            if (discordCode === 50034) {
              logger.warn(`Bulk delete rejected by Discord with 50034 on channel ${channelId}. Falling back to individual deletion.`);
              individualOnly.push(...batch);
            } else {
              const errorDetail = getDiscordErrorDetail(discordCode || err.statusCode || 'BULK_ERROR', err.message);

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
                  errorCode: String(discordCode || err.statusCode || 'BULK_ERROR'),
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
            deleteMockMessage(job.guild_id, m.message_id);
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
          } catch (err: any) {
            const discordCode = err instanceof DiscordApiError ? err.discordCode : undefined;

            if (discordCode === 10008) {
              failedCount++;
              processedCount++;
              const errorDetail = getDiscordErrorDetail(10008);
              failures.push({
                jobId,
                messageId: m.message_id,
                channelId,
                channelName,
                authorId: m.author_id,
                timestampUtc: m.timestamp_utc,
                errorCode: '10008',
                failureReason: errorDetail.reason,
                suggestions: errorDetail.suggestion
              });
            } else {
              const errorDetail = getDiscordErrorDetail(discordCode || err.statusCode || 'SINGLE_ERROR', err.message);

              failedCount++;
              processedCount++;
              failures.push({
                jobId,
                messageId: m.message_id,
                channelId,
                channelName,
                authorId: m.author_id,
                timestampUtc: m.timestamp_utc,
                errorCode: String(discordCode || err.statusCode || 'SINGLE_ERROR'),
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
    this.clearCancellation(jobId);

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
  }
}
