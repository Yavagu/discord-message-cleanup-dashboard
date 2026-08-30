import { GuildMember } from '../types';
import { MOCK_MEMBERS } from './mock.service';
import { DiscordApiService, DiscordApiError } from './discord-api.service';
import { logger } from '../utils/logger';

export class MemberService {
  /**
   * Search members within a guild by query (username, display name, or exact Snowflake User ID)
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

    // 1. If query is a direct Discord Snowflake User ID (17-20 digits), resolve directly
    if (/^\d{17,20}$/.test(trimmedQuery)) {
      try {
        const { data: m } = await DiscordApiService.request<any>(
          `/guilds/${guildId}/members/${trimmedQuery}`,
          botToken
        );

        if (m && m.user) {
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
      } catch (err) {
        // Fallback: try fetching global user if not found in guild
        try {
          const { data: u } = await DiscordApiService.request<any>(
            `/users/${trimmedQuery}`,
            botToken
          );

          if (u && u.id) {
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
        } catch {
          logger.warn(`Could not resolve user ID ${trimmedQuery}`);
        }
      }
    }

    // 2. Search guild members via members/search endpoint
    try {
      const searchEndpoint = `/guilds/${guildId}/members/search?query=${encodeURIComponent(trimmedQuery || 'a')}&limit=50`;
      const { data: rawMembers } = await DiscordApiService.request<any[]>(
        searchEndpoint,
        botToken
      );

      if (!Array.isArray(rawMembers)) {
        return { members: [], intentAvailable: true };
      }

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
      if (err instanceof DiscordApiError && err.statusCode === 403) {
        return {
          members: [],
          intentAvailable: false,
          warning: 'Server Member List Search requires the "Server Members Intent" (GUILD_MEMBERS) in the Discord Developer Portal. You can still enter a Discord User ID directly.'
        };
      }

      logger.error('Failed to search members', err);
      return {
        members: [],
        intentAvailable: false,
        warning: err.message || 'Error searching members'
      };
    }
  }
}
