/**
 * Canonical Discord API constants, limits, bitwise permissions, and error mappings.
 * Acts as the authoritative source of truth across all backend services.
 */

export const DISCORD_API_BASE = 'https://discord.com/api/v10';
export const DISCORD_USER_AGENT = 'DiscordCleanupDashboard/1.0 (Moderation Suite)';

// 14 days in hours = 336 hours. Discord forbids bulk deletion >= 14 days old (triggers code 50034).
export const DISCORD_BULK_DELETE_MAX_AGE_DAYS = 14;
export const DISCORD_BULK_DELETE_MAX_AGE_HOURS = 336;

// Conservative default safety threshold: 332 hours (~13.83 days) to account for clock skew
export const DISCORD_BULK_DELETE_DEFAULT_SAFETY_HOURS = 332;

export const DISCORD_BULK_DELETE_MIN_BATCH_SIZE = 2;
export const DISCORD_BULK_DELETE_MAX_BATCH_SIZE = 100;

export const DISCORD_DEFAULT_PACING_MS = 100;
export const DISCORD_DEFAULT_SCAN_PACING_MS = 50;

/**
 * Discord Permissions Bitflags
 * @see https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
 */
export const DiscordPermissions = {
  ADMINISTRATOR: 0x8n,
  MANAGE_GUILD: 0x20n,
  VIEW_CHANNEL: 0x400n,
  READ_MESSAGE_HISTORY: 0x10000n,
  MANAGE_MESSAGES: 0x2000n
} as const;

/**
 * Discord Channel Types
 * @see https://discord.com/developers/docs/resources/channel#channel-object-channel-types
 */
export enum DiscordChannelType {
  GUILD_TEXT = 0,
  DM = 1,
  GUILD_VOICE = 2,
  GROUP_DM = 3,
  GUILD_CATEGORY = 4,
  GUILD_ANNOUNCEMENT = 5,
  ANNOUNCEMENT_THREAD = 10,
  PUBLIC_THREAD = 11,
  PRIVATE_THREAD = 12,
  GUILD_STAGE_VOICE = 13,
  GUILD_DIRECTORY = 14,
  GUILD_FORUM = 15,
  GUILD_MEDIA = 16
}

export const TEXT_BASED_CHANNEL_TYPES: number[] = [
  DiscordChannelType.GUILD_TEXT,
  DiscordChannelType.GUILD_VOICE,
  DiscordChannelType.GUILD_ANNOUNCEMENT,
  DiscordChannelType.GUILD_STAGE_VOICE,
  DiscordChannelType.GUILD_FORUM
];

export interface DiscordErrorDetail {
  code: number | string;
  reason: string;
  suggestion: string;
}

export const DISCORD_ERROR_DESCRIPTIONS: Record<number, { reason: string; suggestion: string }> = {
  50013: {
    reason: 'Missing Permissions: Bot lacks MANAGE_MESSAGES in this channel.',
    suggestion: 'Verify the bot role has "Manage Messages" in channel permissions and is placed above targets in the server role hierarchy.'
  },
  10008: {
    reason: 'Unknown Message: The message does not exist or was already deleted.',
    suggestion: 'The message was likely deleted manually or by another moderator prior to this cleanup run.'
  },
  50034: {
    reason: 'Invalid Bulk Delete: Messages older than 14 days cannot be bulk-deleted.',
    suggestion: 'Older messages must be deleted individually with rate-limit pacing.'
  },
  50001: {
    reason: 'Missing Access: Bot cannot view or access this channel.',
    suggestion: 'Ensure the bot has "View Channel" and "Read Message History" permissions in channel overrides.'
  },
  429: {
    reason: 'Rate Limit Exceeded: Discord throttled requests temporarily.',
    suggestion: 'Pacing delays will automatically wait for the rate limit window to expire.'
  },
  401: {
    reason: 'Authentication Failed: Invalid or revoked bot token.',
    suggestion: 'Reconnect with an active Discord Bot token from the Developer Portal.'
  }
};

export function getDiscordErrorDetail(code: number | string, fallbackMsg?: string): DiscordErrorDetail {
  const numCode = Number(code);
  const known = DISCORD_ERROR_DESCRIPTIONS[numCode];
  if (known) {
    return {
      code,
      reason: known.reason,
      suggestion: known.suggestion
    };
  }
  return {
    code,
    reason: fallbackMsg || `Discord API Error (Code ${code})`,
    suggestion: 'Review Discord server audit logs and bot role permissions.'
  };
}
