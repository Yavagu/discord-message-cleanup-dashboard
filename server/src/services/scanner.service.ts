import { db } from '../db/database';
import { FilterConfig, ScannedMessage, DiscordChannel } from '../types';
import { FilterService } from './filter.service';
import { getMockMessagesForGuild } from './mock.service';
import { ChannelService } from './channel.service';
import { logger } from '../utils/logger';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const BULK_DELETE_AGE_LIMIT_DAYS = 13.9; // Safe margin below 14 days

export class ScannerService {
  /**
   * Scan messages matching the filter criteria across specified channels
   */
  public static async scanMessages(
    jobId: string,
    guildId: string,
    channels: DiscordChannel[],
    filter: FilterConfig,
    isDemo: boolean,
    botToken?: string
  ): Promise<{
    scannedCount: number;
    matchedCount: number;
    messages: ScannedMessage[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    let totalScanned = 0;
    const matchingMessages: ScannedMessage[] = [];

    // Filter target channels
    const targetChannels = filter.channelIds.length === 0 || filter.channelIds.includes('all')
      ? channels
      : channels.filter(c => filter.channelIds.includes(c.id));

    logger.info(`Starting message scan for job ${jobId} across ${targetChannels.length} channels (targetUser: ${filter.targetUserId})`);

    if (isDemo) {
      // Demo Mode Scanning
      const allMockMessages = getMockMessagesForGuild(guildId);
      const targetChannelIds = new Set(targetChannels.map(c => c.id));
      const channelNameMap = new Map(targetChannels.map(c => [c.id, c.name]));

      for (const msg of allMockMessages) {
        if (!targetChannelIds.has(msg.channelId)) continue;
        totalScanned++;

        if (FilterService.matchesFilter({ authorId: msg.authorId, timestampUtc: msg.timestampUtc }, filter)) {
          const ageDays = FilterService.calculateAgeDays(msg.timestampUtc);
          const isBulkDeletable = ageDays <= BULK_DELETE_AGE_LIMIT_DAYS;
          const formattedLocal = FilterService.formatLocalTimestamp(msg.timestampUtc, filter.timezone);

          matchingMessages.push({
            id: msg.id,
            channelId: msg.channelId,
            channelName: channelNameMap.get(msg.channelId) || msg.channelId,
            authorId: msg.authorId,
            authorUsername: msg.authorUsername,
            authorDisplayName: msg.authorDisplayName,
            authorAvatarUrl: msg.authorAvatarUrl,
            content: msg.content,
            timestampUtc: msg.timestampUtc,
            timestampLocalFormatted: formattedLocal,
            hasAttachments: msg.hasAttachments,
            attachmentCount: msg.attachmentCount,
            hasEmbeds: msg.hasEmbeds,
            embedCount: msg.embedCount,
            isBulkDeletable,
            ageDays
          });
        }
      }
    } else {
      // Real Discord API Scanning
      if (!botToken) {
        throw new Error('Bot token is required to scan messages');
      }

      const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');

      for (const channel of targetChannels) {
        let lastMessageId: string | null = null;
        let keepScanningChannel = true;
        let channelScanCount = 0;
        const MAX_MESSAGES_PER_CHANNEL = 1000; // safety ceiling per channel

        while (keepScanningChannel && channelScanCount < MAX_MESSAGES_PER_CHANNEL) {
          try {
            const url: string = lastMessageId
              ? `${DISCORD_API_BASE}/channels/${channel.id}/messages?limit=100&before=${lastMessageId}`
              : `${DISCORD_API_BASE}/channels/${channel.id}/messages?limit=100`;

            const res = await fetch(url, {
              headers: {
                Authorization: `Bot ${cleanToken}`,
                'User-Agent': 'DiscordCleanupDashboard/1.0'
              }
            });

            if (!res.ok) {
              logger.warn(`Failed to fetch messages for channel #${channel.name} (${channel.id}): HTTP ${res.status}`);
              break;
            }

            const rawMessages = await res.json() as any[];
            if (!rawMessages || rawMessages.length === 0) {
              break;
            }

            for (const m of rawMessages) {
              totalScanned++;
              channelScanCount++;
              lastMessageId = m.id;

              const author = m.author || {};
              const authorId = author.id;
              const authorUsername = author.username || 'Unknown';
              const authorDisplayName = author.global_name || author.username || 'Unknown';
              const authorAvatarUrl = author.avatar
                ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${Number(author.discriminator || 0) % 5}.png`;

              const timestampUtc = m.timestamp;

              if (FilterService.matchesFilter({ authorId, timestampUtc }, filter)) {
                const ageDays = FilterService.calculateAgeDays(timestampUtc);
                const isBulkDeletable = ageDays <= BULK_DELETE_AGE_LIMIT_DAYS;
                const formattedLocal = FilterService.formatLocalTimestamp(timestampUtc, filter.timezone);

                matchingMessages.push({
                  id: m.id,
                  channelId: channel.id,
                  channelName: channel.name,
                  authorId,
                  authorUsername,
                  authorDisplayName,
                  authorAvatarUrl,
                  content: m.content || '',
                  timestampUtc,
                  timestampLocalFormatted: formattedLocal,
                  hasAttachments: Boolean(m.attachments && m.attachments.length > 0),
                  attachmentCount: m.attachments ? m.attachments.length : 0,
                  hasEmbeds: Boolean(m.embeds && m.embeds.length > 0),
                  embedCount: m.embeds ? m.embeds.length : 0,
                  isBulkDeletable,
                  ageDays
                });
              }
            }

            if (rawMessages.length < 100) {
              keepScanningChannel = false;
            }

            // Pacing delay to avoid aggressive rate limits
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (err) {
            logger.error(`Error scanning channel ${channel.id}`, err);
            break;
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Persist scanned messages into SQLite within a transaction
    const insertStmt = db.prepare(`
      INSERT INTO job_scanned_messages (
        job_id, message_id, channel_id, channel_name, author_id,
        author_username, author_display_name, author_avatar_url, content,
        timestamp_utc, timestamp_local_formatted, has_attachments,
        attachment_count, has_embeds, embed_count, is_bulk_deletable, age_days, is_selected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      // Clear any prior scanned messages for this job
      db.prepare('DELETE FROM job_scanned_messages WHERE job_id = ?').run(jobId);

      for (const msg of matchingMessages) {
        insertStmt.run(
          jobId,
          msg.id,
          msg.channelId,
          msg.channelName,
          msg.authorId,
          msg.authorUsername,
          msg.authorDisplayName,
          msg.authorAvatarUrl,
          msg.content,
          msg.timestampUtc,
          msg.timestampLocalFormatted,
          msg.hasAttachments ? 1 : 0,
          msg.attachmentCount,
          msg.hasEmbeds ? 1 : 0,
          msg.embedCount,
          msg.isBulkDeletable ? 1 : 0,
          msg.ageDays
        );
      }

      // Update job state
      db.prepare(`
        UPDATE cleanup_jobs
        SET status = 'READY', scanned_count = ?, matched_count = ?, selected_count = ?, duration_ms = ?
        WHERE id = ?
      `).run(totalScanned, matchingMessages.length, matchingMessages.length, durationMs, jobId);

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      logger.error('Failed to persist scanned messages', err);
      throw err;
    }

    logger.info(`Scan complete for job ${jobId}: ${totalScanned} scanned, ${matchingMessages.length} matched in ${durationMs}ms`);

    return {
      scannedCount: totalScanned,
      matchedCount: matchingMessages.length,
      messages: matchingMessages,
      durationMs
    };
  }
}
