import { DiscordChannel } from '../types';
import { MOCK_CHANNELS } from './mock.service';
import { logger } from '../utils/logger';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

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

    const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');
    const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
      headers: {
        Authorization: `Bot ${cleanToken}`,
        'User-Agent': 'DiscordCleanupDashboard/1.0'
      }
    });

    if (!res.ok) {
      logger.error(`Discord API error fetching channels for guild ${guildId}: ${res.status}`);
      throw new Error(`Failed to fetch channels from Discord API (${res.status})`);
    }

    const rawChannels = await res.json() as any[];

    // Map parent category names for better UX
    const categoryMap = new Map<string, string>();
    for (const c of rawChannels) {
      if (c.type === 4) { // Category
        categoryMap.set(c.id, c.name);
      }
    }

    // Filter channels with message histories: 0 (GUILD_TEXT), 2 (GUILD_VOICE), 5 (GUILD_ANNOUNCEMENT), 13 (GUILD_STAGE_VOICE), 15 (GUILD_FORUM)
    const accessibleChannels = rawChannels
      .filter(c => [0, 2, 5, 13, 15].includes(c.type))
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parent_id || null,
        parentName: c.parent_id ? categoryMap.get(c.parent_id) || null : null,
        position: c.position || 0,
        canView: true,
        canReadHistory: true,
        canManageMessages: true
      }))
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    return accessibleChannels;
  }
}
