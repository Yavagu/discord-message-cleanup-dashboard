import { GuildMember } from '../types';
import { MOCK_MEMBERS } from './mock.service';
import { logger } from '../utils/logger';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class MemberService {
  /**
   * Search members within a guild by query (username, display name, or ID)
   */
  public static async searchMembers(
    guildId: string,
    query: string,
    isDemo: boolean,
    botToken?: string
  ): Promise<{
    members: GuildMember[];
    intentAvailable: boolean;
    warning?: string;
  }> {
    const trimmedQuery = query.trim();

    if (isDemo) {
      const all = MOCK_MEMBERS[guildId] || [];
      if (!trimmedQuery) {
        return { members: all, intentAvailable: true };
      }
      const lower = trimmedQuery.toLowerCase();
      const filtered = all.filter(m =>
        m.id.includes(lower) ||
        m.username.toLowerCase().includes(lower) ||
        m.displayName.toLowerCase().includes(lower)
      );
      return { members: filtered, intentAvailable: true };
    }

    if (!botToken) {
      throw new Error('Bot token is required to search members');
    }

    const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');

    // 1. If query looks like a snowflake User ID (17-20 digits), fetch directly
    if (/^\d{17,20}$/.test(trimmedQuery)) {
      try {
        const memberRes = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${trimmedQuery}`, {
          headers: {
            Authorization: `Bot ${cleanToken}`,
            'User-Agent': 'DiscordCleanupDashboard/1.0'
          }
        });

        if (memberRes.ok) {
          const m = await memberRes.json() as any;
          const u = m.user;
          const avatarUrl = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${Number(u.discriminator || 0) % 5}.png`;

          return {
            members: [{
              id: u.id,
              username: u.username,
              displayName: m.nick || u.global_name || u.username,
              avatarUrl,
              roles: m.roles || [],
              joinedAt: m.joined_at
            }],
            intentAvailable: true
          };
        }

        // Fallback to fetch global user
        const userRes = await fetch(`${DISCORD_API_BASE}/users/${trimmedQuery}`, {
          headers: {
            Authorization: `Bot ${cleanToken}`,
            'User-Agent': 'DiscordCleanupDashboard/1.0'
          }
        });

        if (userRes.ok) {
          const u = await userRes.json() as any;
          const avatarUrl = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${Number(u.discriminator || 0) % 5}.png`;

          return {
            members: [{
              id: u.id,
              username: u.username,
              displayName: u.global_name || u.username,
              avatarUrl,
              roles: []
            }],
            intentAvailable: true
          };
        }
      } catch (err) {
        logger.error(`Error looking up user ID ${trimmedQuery}`, err);
      }
    }

    // 2. Search guild members via search endpoint
    try {
      const searchUrl = `${DISCORD_API_BASE}/guilds/${guildId}/members/search?query=${encodeURIComponent(trimmedQuery || 'a')}&limit=50`;
      const res = await fetch(searchUrl, {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'User-Agent': 'DiscordCleanupDashboard/1.0'
        }
      });

      if (!res.ok) {
        // If 403 Forbidden / missing Privileged Intent
        if (res.status === 403) {
          return {
            members: [],
            intentAvailable: false,
            warning: 'Server Member List Search requires the "Server Members Intent" (GUILD_MEMBERS) in the Discord Developer Portal. You can still enter a Discord User ID directly.'
          };
        }
        return { members: [], intentAvailable: true };
      }

      const rawMembers = await res.json() as any[];
      const members: GuildMember[] = rawMembers.map(m => {
        const u = m.user;
        const avatarUrl = u.avatar
          ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${Number(u.discriminator || 0) % 5}.png`;

        return {
          id: u.id,
          username: u.username,
          displayName: m.nick || u.global_name || u.username,
          avatarUrl,
          roles: m.roles || [],
          joinedAt: m.joined_at
        };
      });

      return { members, intentAvailable: true };
    } catch (err: any) {
      logger.error('Failed to search members', err);
      return {
        members: [],
        intentAvailable: false,
        warning: err.message || 'Error searching members'
      };
    }
  }
}
