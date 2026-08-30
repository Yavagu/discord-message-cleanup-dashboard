import { DiscordGuild } from '../types';
import { MOCK_GUILDS } from './mock.service';
import { DiscordApiService } from './discord-api.service';
import { DiscordPermissions } from '../constants/discord.constants';
import { logger } from '../utils/logger';

export class GuildService {
  public static async getGuilds(isDemo: boolean, botToken?: string): Promise<DiscordGuild[]> {
    if (isDemo) {
      return MOCK_GUILDS;
    }

    if (!botToken) {
      throw new Error('Bot token is required to fetch guilds');
    }

    try {
      const { data: rawGuilds } = await DiscordApiService.request<any[]>('/users/@me/guilds?limit=200', botToken);

      if (!Array.isArray(rawGuilds)) {
        return [];
      }

      return rawGuilds.map(g => {
        const iconUrl = g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
          : null;

        // Check Administrator (0x8) or Manage Messages (0x2000) bitflags
        const permissionsBigInt = BigInt(g.permissions || '0');
        const isAdmin = (permissionsBigInt & DiscordPermissions.ADMINISTRATOR) === DiscordPermissions.ADMINISTRATOR;
        const hasManage = (permissionsBigInt & DiscordPermissions.MANAGE_MESSAGES) === DiscordPermissions.MANAGE_MESSAGES;

        return {
          id: g.id,
          name: g.name,
          icon: iconUrl,
          owner: Boolean(g.owner),
          permissions: g.permissions,
          memberCount: g.approximate_member_count || undefined,
          hasManageMessagesPermission: isAdmin || hasManage
        };
      });
    } catch (err: any) {
      logger.error('Failed to fetch guilds from Discord API', err);
      throw err;
    }
  }
}
