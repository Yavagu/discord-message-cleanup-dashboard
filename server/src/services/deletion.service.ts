import { db } from '../db/database';
import { CleanupFailure, JobProgressUpdate, JobStatus } from '../types';
import { deleteMockMessage } from './mock.service';
import { logger } from '../utils/logger';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BULK_DELETE_CUTOFF_DAYS = 13.85; // Strict safety threshold to never trigger 50034

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
   * Revalidate deletion payload against SQLite job records and execute deletion
   */
  public static async executeDeletion(
    jobId: string,
    sessionId: string,
    selectedMessageIds: string[] | null, // null means all scanned messages in job
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

    // 1. Backend Server-Side Revalidation
    // Verify job exists, belongs to session, and is in READY state
    const job = db.prepare(`
      SELECT * FROM cleanup_jobs WHERE id = ? AND session_id = ?
    `).get(jobId, sessionId) as any;

    if (!job) {
      throw new Error(`Job ${jobId} not found or unauthorized for this session`);
    }

    if (job.status !== 'READY') {
      throw new Error(`Job cannot be executed: current status is ${job.status} (expected READY)`);
    }

    // Fetch all previously scanned messages for this job
    const scannedRows = db.prepare(`
      SELECT * FROM job_scanned_messages WHERE job_id = ?
    `).all(jobId) as any[];

    if (scannedRows.length === 0) {
      throw new Error('No scanned messages found for this cleanup job');
    }

    const scannedMap = new Map<string, any>(scannedRows.map(r => [r.message_id, r]));

    // Determine target messages to delete
    let targetRows: any[] = [];
    if (!selectedMessageIds || selectedMessageIds.length === 0) {
      targetRows = scannedRows;
    } else {
      // Revalidate that EVERY requested message ID was part of the original scan
      for (const msgId of selectedMessageIds) {
        const item = scannedMap.get(msgId);
        if (!item) {
          throw new Error(`Security rejection: Message ID ${msgId} was not part of the scanned results for job ${jobId}`);
        }
        targetRows.push(item);
      }
    }

    // 2. Atomic Job Lock: Transition READY -> DELETING
    const lockResult = db.prepare(`
      UPDATE cleanup_jobs
      SET status = 'DELETING', started_at = ?, selected_count = ?
      WHERE id = ? AND status = 'READY'
    `).run(new Date().toISOString(), targetRows.length, jobId);

    if (lockResult.changes === 0) {
      throw new Error('Conflict: Cleanup job is already being processed or is not in READY state');
    }

    logger.info(`Job ${jobId} locked and transitioning to DELETING (${targetRows.length} messages)`);

    const totalSelected = targetRows.length;
    let deletedCount = 0;
    let failedCount = 0;
    let processedCount = 0;
    const failures: CleanupFailure[] = [];

    // Group target messages by channel
    const channelMap = new Map<string, any[]>();
    for (const msg of targetRows) {
      if (!channelMap.has(msg.channel_id)) {
        channelMap.set(msg.channel_id, []);
      }
      channelMap.get(msg.channel_id)!.push(msg);
    }

    const cleanToken = botToken ? botToken.trim().replace(/^Bot\s+/i, '') : '';

    const emitProgress = (channelName?: string, currentMsgId?: string) => {
      const remaining = totalSelected - processedCount;
      const percent = totalSelected > 0 ? Math.round((processedCount / totalSelected) * 100) : 100;
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = processedCount > 0 ? processedCount / elapsedSec : 1;
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
          etaSeconds
        });
      }
    };

    emitProgress();

    // 3. Process Deletions per channel
    for (const [channelId, msgs] of channelMap.entries()) {
      if (this.isCancelled(jobId)) {
        logger.info(`Job ${jobId} was cancelled by administrator`);
        break;
      }

      const channelName = msgs[0]?.channel_name || channelId;

      // Split messages into:
      // A. Bulk-eligible: age_days <= BULK_DELETE_CUTOFF_DAYS
      // B. Individual only: age_days > BULK_DELETE_CUTOFF_DAYS
      const bulkEligible: any[] = [];
      const individualOnly: any[] = [];

      for (const m of msgs) {
        if (m.age_days <= BULK_DELETE_CUTOFF_DAYS) {
          bulkEligible.push(m);
        } else {
          individualOnly.push(m);
        }
      }

      // --- 3A. Process Bulk Deletions (batches of 2 to 100) ---
      while (bulkEligible.length > 0) {
        if (this.isCancelled(jobId)) break;

        // If only 1 message remains in eligible batch, fall back to individual delete
        if (bulkEligible.length === 1) {
          individualOnly.push(bulkEligible.pop()!);
          break;
        }

        const batch = bulkEligible.splice(0, Math.min(100, bulkEligible.length));
        const batchIds = batch.map(b => b.message_id);

        if (isDemo) {
          // Demo Mode bulk deletion simulation
          await new Promise(r => setTimeout(r, 120)); // realistic API pacing
          for (const b of batch) {
            deleteMockMessage(job.guild_id, b.message_id);
            deletedCount++;
            processedCount++;
          }
          emitProgress(channelName, batchIds[0]);
        } else {
          // Real Discord Bulk Delete
          try {
            const bulkRes = await this.callDiscordWithRetry(
              `${DISCORD_API_BASE}/channels/${channelId}/messages/bulk-delete`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bot ${cleanToken}`,
                  'Content-Type': 'application/json',
                  'User-Agent': 'DiscordCleanupDashboard/1.0'
                },
                body: JSON.stringify({ messages: batchIds })
              }
            );

            if (bulkRes.ok || bulkRes.status === 204) {
              deletedCount += batch.length;
              processedCount += batch.length;
            } else {
              // Parse error
              const errBody = await bulkRes.json().catch(() => ({})) as any;
              const errorCode = errBody.code || bulkRes.status;
              const errorMsg = errBody.message || `HTTP ${bulkRes.status}`;

              // If error was 50034 (bulk delete older than 14d) or 50013 (missing perms), record failure
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
                  errorCode: String(errorCode),
                  failureReason: this.mapErrorCodeToReason(errorCode, errorMsg),
                  suggestions: this.mapErrorCodeToSuggestion(errorCode)
                });
              }
            }
          } catch (err: any) {
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
                errorCode: 'NETWORK_ERROR',
                failureReason: err.message || 'Network error during bulk delete',
                suggestions: 'Check internet connection and Discord status.'
              });
            }
          }
          emitProgress(channelName, batchIds[0]);
        }
      }

      // --- 3B. Process Individual Deletions (Older messages or single leftovers) ---
      for (const m of individualOnly) {
        if (this.isCancelled(jobId)) break;

        if (isDemo) {
          // In demo mode: simulate occasional permission error on channel 106 if tested
          await new Promise(r => setTimeout(r, 60)); // pacing
          if (m.channel_id === '106') {
            failedCount++;
            processedCount++;
            failures.push({
              jobId,
              messageId: m.message_id,
              channelId: m.channel_id,
              channelName: m.channel_name,
              authorId: m.author_id,
              timestampUtc: m.timestamp_utc,
              errorCode: '50013',
              failureReason: 'Missing Permissions: Bot lacks MANAGE_MESSAGES in this channel',
              suggestions: 'Grant the bot MANAGE_MESSAGES permission in the channel settings.'
            });
          } else {
            deleteMockMessage(job.guild_id, m.message_id);
            deletedCount++;
            processedCount++;
          }
          emitProgress(channelName, m.message_id);
        } else {
          // Real Discord Single Delete
          try {
            const delRes = await this.callDiscordWithRetry(
              `${DISCORD_API_BASE}/channels/${channelId}/messages/${m.message_id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bot ${cleanToken}`,
                  'User-Agent': 'DiscordCleanupDashboard/1.0'
                }
              }
            );

            if (delRes.ok || delRes.status === 204) {
              deletedCount++;
              processedCount++;
            } else {
              const errBody = await delRes.json().catch(() => ({})) as any;
              const errorCode = errBody.code || delRes.status;
              const errorMsg = errBody.message || `HTTP ${delRes.status}`;

              failedCount++;
              processedCount++;
              failures.push({
                jobId,
                messageId: m.message_id,
                channelId,
                channelName,
                authorId: m.author_id,
                timestampUtc: m.timestamp_utc,
                errorCode: String(errorCode),
                failureReason: this.mapErrorCodeToReason(errorCode, errorMsg),
                suggestions: this.mapErrorCodeToSuggestion(errorCode)
              });
            }
          } catch (err: any) {
            failedCount++;
            processedCount++;
            failures.push({
              jobId,
              messageId: m.message_id,
              channelId,
              channelName,
              authorId: m.author_id,
              timestampUtc: m.timestamp_utc,
              errorCode: 'NETWORK_ERROR',
              failureReason: err.message || 'Network error during message delete',
              suggestions: 'Check network connectivity.'
            });
          }

          // Respect rate limit pacing between single deletes (100ms)
          await new Promise(r => setTimeout(r, 100));
          emitProgress(channelName, m.message_id);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const isJobCancelled = this.isCancelled(jobId);
    this.clearCancellation(jobId);

    // 4. Determine final job status
    let finalStatus: JobStatus = 'COMPLETED';
    if (isJobCancelled) {
      finalStatus = 'CANCELLED';
    } else if (failedCount > 0 && deletedCount > 0) {
      finalStatus = 'PARTIALLY_COMPLETED';
    } else if (failedCount > 0 && deletedCount === 0) {
      finalStatus = 'FAILED';
    }

    // 5. Persist failures & final job status in SQLite transaction
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

    // Final progress broadcast
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

  /**
   * Safe fetch with rate limit (429) wait & bounded exponential retry + jitter
   */
  private static async callDiscordWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const res = await fetch(url, options);

        // Check for 429 Rate Limit
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('Retry-After');
          let waitMs = 1000;

          if (retryAfterHeader) {
            waitMs = Math.ceil(parseFloat(retryAfterHeader) * 1000);
          } else {
            try {
              const body = await res.clone().json() as any;
              if (body.retry_after) {
                waitMs = Math.ceil(body.retry_after * 1000);
              }
            } catch {}
          }

          logger.warn(`Discord Rate Limit hit (429). Waiting ${waitMs}ms before retry (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitMs + 50));
          continue;
        }

        // Check for transient 5xx server errors
        if (res.status >= 500 && attempt < maxRetries) {
          const jitter = Math.random() * 100;
          const backoff = Math.min(2000, 200 * Math.pow(2, attempt) + jitter);
          logger.warn(`Discord 5xx Server Error (${res.status}). Backing off ${Math.round(backoff)}ms`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }

        return res;
      } catch (err: any) {
        if (attempt >= maxRetries) throw err;
        const jitter = Math.random() * 100;
        const backoff = Math.min(2000, 200 * Math.pow(2, attempt) + jitter);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw new Error(`Max retries (${maxRetries}) exceeded calling Discord API`);
  }

  private static mapErrorCodeToReason(code: string | number, rawMsg: string): string {
    const num = Number(code);
    switch (num) {
      case 50013:
        return 'Missing Permissions: Bot does not have MANAGE_MESSAGES permission in this channel.';
      case 10008:
        return 'Unknown Message: The message has already been deleted or does not exist.';
      case 50034:
        return 'Invalid Bulk Delete: You can only bulk-delete messages that are under 14 days old.';
      case 50001:
        return 'Missing Access: Bot cannot view or access this channel.';
      case 429:
        return 'Rate Limit Exceeded: Discord temporarily throttled requests.';
      case 401:
        return 'Authentication Failed: Invalid or revoked bot token.';
      default:
        return rawMsg || `Discord API Error (${code})`;
    }
  }

  private static mapErrorCodeToSuggestion(code: string | number): string {
    const num = Number(code);
    switch (num) {
      case 50013:
        return 'Verify the bot role has "Manage Messages" in channel/server permissions and is above the target in role hierarchy.';
      case 10008:
        return 'The message was likely deleted manually or by another moderator prior to this cleanup.';
      case 50034:
        return 'Older messages must be deleted individually. The system will handle this automatically on retry.';
      case 50001:
        return 'Ensure the bot has "View Channel" and "Read Message History" permissions.';
      default:
        return 'Review Discord server audit log and bot role permissions.';
    }
  }
}
