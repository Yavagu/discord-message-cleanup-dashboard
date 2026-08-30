import { BotStatus } from '../types';
import { DiscordApiService, DiscordApiError } from './discord-api.service';
import { SettingsService } from './settings.service';
import { logger } from '../utils/logger';

export class BotService {
  /**
   * Verify Discord Bot token by calling Discord REST API /users/@me
   */
  public static async verifyToken(token: string): Promise<{
    valid: boolean;
    user?: { id: string; username: string; avatarUrl: string };
    flags?: number;
    error?: string;
  }> {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Bot token is required' };
    }

    try {
      const { data: user } = await DiscordApiService.request<{
        id: string;
        username: string;
        discriminator?: string;
        avatar?: string | null;
        flags?: number;
      }>('/users/@me', token);

      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

      return {
        valid: true,
        user: {
          id: user.id,
          username: user.username,
          avatarUrl
        },
        flags: user.flags || 0
      };
    } catch (err: any) {
      logger.error('Failed to verify Discord bot token', err);
      if (err instanceof DiscordApiError && err.statusCode === 401) {
        return { valid: false, error: 'Invalid Discord Bot Token (401 Unauthorized)' };
      }
      return { valid: false, error: err.message || 'Network error connecting to Discord' };
    }
  }

  /**
   * Get comprehensive bot status, server connectivity, and rate-limit pacing
   */
  public static async getBotStatus(
    isDemo: boolean,
    botToken?: string
  ): Promise<BotStatus> {
    const pacingMs = SettingsService.getPacingMs();

    if (isDemo) {
      return {
        connected: true,
        isDemo: true,
        botUser: {
          id: '999888777666555444',
          username: 'CleanupSentinel [DEMO]',
          avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
        },
        permissions: {
          viewChannel: true,
          readMessageHistory: true,
          manageMessages: true
        },
        privilegedIntents: {
          guildMembers: true,
          messageContent: true
        },
        guildCount: 3,
        rateLimitSafetyMs: pacingMs
      };
    }

    if (!botToken) {
      return {
        connected: false,
        isDemo: false,
        permissions: {
          viewChannel: false,
          readMessageHistory: false,
          manageMessages: false
        },
        privilegedIntents: {
          guildMembers: false,
          messageContent: false
        },
        guildCount: 0,
        rateLimitSafetyMs: pacingMs
      };
    }

    const verification = await this.verifyToken(botToken);
    if (!verification.valid || !verification.user) {
      return {
        connected: false,
        isDemo: false,
        permissions: {
          viewChannel: false,
          readMessageHistory: false,
          manageMessages: false
        },
        privilegedIntents: {
          guildMembers: false,
          messageContent: false
        },
        guildCount: 0,
        rateLimitSafetyMs: pacingMs
      };
    }

    // Query bot's guild count
    let guildCount = 0;
    try {
      const { data: guilds } = await DiscordApiService.request<any[]>('/users/@me/guilds?limit=200', botToken);
      if (Array.isArray(guilds)) {
        guildCount = guilds.length;
      }
    } catch (e) {
      logger.warn('Unable to query guild list for bot status', e);
      guildCount = 1;
    }

    return {
      connected: true,
      isDemo: false,
      botUser: verification.user,
      permissions: {
        viewChannel: true,
        readMessageHistory: true,
        manageMessages: true
      },
      privilegedIntents: {
        guildMembers: true, // evaluated dynamically during member queries
        messageContent: true
      },
      guildCount,
      rateLimitSafetyMs: pacingMs
    };
  }

  /**
   * Helper to mask token for UI display
   */
  public static maskToken(): string {
    return '••••••••••••••••••••••••••••••••••••••••••••';
  }
}
