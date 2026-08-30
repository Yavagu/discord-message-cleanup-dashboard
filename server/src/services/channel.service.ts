import { DiscordChannel } from '../types';
import { MOCK_CHANNELS } from './mock.service';
import { DiscordApiService } from './discord-api.service';
import {
  DiscordChannelType,
  DiscordPermissions,
  TEXT_BASED_CHANNEL_TYPES
} from '../constants/discord.constants';
import { logger } from '../utils/logger';

export class ChannelService {
  public static async getGuildChannels(
    guildId: string,
    isDemo: boolean,
    botToken?: string
  ): Promise<DiscordChannel[]> {
    if (isDemo) {
      return MOCK_CHANNELS[guildId] || [];
    }

    if (!botToken) {
      throw new Error('Bot token is required to fetch channels');
    }

    try {
      // 1. Fetch guild channels
      const { data: rawChannels } = await DiscordApiService.request<any[]>(
        `/guilds/${guildId}/channels`,
        botToken
      );

      if (!Array.isArray(rawChannels)) {
        return [];
      }

      // Map parent category names for structured UX display
      const categoryMap = new Map<string, string>();
      for (const c of rawChannels) {
        if (c.type === DiscordChannelType.GUILD_CATEGORY) {
          categoryMap.set(c.id, c.name);
        }
      }

      // 2. Fetch bot's guild permissions to accurately evaluate channel permissions
      let guildBasePermissions: bigint = DiscordPermissions.ADMINISTRATOR; // fallback assumption if admin
      try {
        const { data: userGuilds } = await DiscordApiService.request<any[]>('/users/@me/guilds?limit=200', botToken);
        const thisGuild = userGuilds.find((g: any) => g.id === guildId);
        if (thisGuild && thisGuild.permissions) {
          guildBasePermissions = BigInt(thisGuild.permissions);
        }
      } catch (err) {
        logger.warn(`Could not verify guild base permissions for guild ${guildId}`, err);
      }

      // 3. Filter channels supporting message histories and compute real permissions
      const accessibleChannels: DiscordChannel[] = rawChannels
        .filter(c => TEXT_BASED_CHANNEL_TYPES.includes(c.type))
        .map(c => {
          const overwrites = Array.isArray(c.permission_overwrites) ? c.permission_overwrites : [];
          const evaluated = DiscordApiService.computeChannelPermissions(
            guildBasePermissions,
            overwrites,
            guildId
          );

          return {
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parent_id || null,
            parentName: c.parent_id ? categoryMap.get(c.parent_id) || null : null,
            position: c.position || 0,
            canView: evaluated.canView,
            canReadHistory: evaluated.canReadHistory,
            canManageMessages: evaluated.canManageMessages,
            permissionOverwrites: overwrites
          };
        })
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      return accessibleChannels;
    } catch (err: any) {
      logger.error(`Failed to fetch channels for guild ${guildId}`, err);
      throw err;
    }
  }
}
