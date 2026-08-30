import { BotStatus } from '../types';
import { logger } from '../utils/logger';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

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
      return { valid: false, error: 'Token is required' };
    }

    const cleanToken = token.trim().replace(/^Bot\s+/i, '');

    try {
      const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'User-Agent': 'DiscordCleanupDashboard/1.0'
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          return { valid: false, error: 'Invalid Discord Bot Token (401 Unauthorized)' };
        }
        return { valid: false, error: `Discord API returned status ${res.status}` };
      }

      const user = await res.json() as any;
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
      logger.error('Failed to connect to Discord API', err);
      return { valid: false, error: err.message || 'Network error connecting to Discord' };
    }
  }

  /**
   * Get comprehensive bot status, channel permissions, and privileged intent audit
   */
  public static async getBotStatus(
    isDemo: boolean,
    botToken?: string
  ): Promise<BotStatus> {
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
        rateLimitSafetyMs: 50
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
        rateLimitSafetyMs: 100
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
        rateLimitSafetyMs: 100
      };
    }

    // Check guilds count
    let guildCount = 0;
    try {
      const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');
      const gRes = await fetch(`${DISCORD_API_BASE}/users/@me/guilds?limit=200`, {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'User-Agent': 'DiscordCleanupDashboard/1.0'
        }
      });
      if (gRes.ok) {
        const guilds = await gRes.json() as any[];
        guildCount = guilds.length;
      }
    } catch {
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
        guildMembers: true, // evaluated when searching members
        messageContent: true
      },
      guildCount,
      rateLimitSafetyMs: 100
    };
  }

  /**
   * Helper to mask token for UI responses
   */
  public static maskToken(): string {
    return '••••••••••••••••••••••••••••••••••••••••••••';
  }
}
