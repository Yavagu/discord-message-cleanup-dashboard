import { DiscordGuild } from '../types';
import { MOCK_GUILDS } from './mock.service';
import { logger } from '../utils/logger';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class GuildService {
  public static async getGuilds(isDemo: boolean, botToken?: string): Promise<DiscordGuild[]> {
    if (isDemo) {
      return MOCK_GUILDS;
    }

    if (!botToken) {
      throw new Error('Bot token is required to fetch guilds');
    }

    const cleanToken = botToken.trim().replace(/^Bot\s+/i, '');
    const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds?limit=200`, {
      headers: {
        Authorization: `Bot ${cleanToken}`,
        'User-Agent': 'DiscordCleanupDashboard/1.0'
      }
    });

    if (!res.ok) {
      logger.error(`Discord API error fetching guilds: ${res.status}`);
      throw new Error(`Failed to fetch guilds from Discord API (${res.status})`);
    }

    const guilds = await res.json() as any[];

    return guilds.map(g => {
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
        : null;

      // Check Administrator (0x8) or Manage Messages (0x2000)
      const permissionsBigInt = BigInt(g.permissions || '0');
      const isAdmin = (permissionsBigInt & 0x8n) === 0x8n;
      const hasManage = (permissionsBigInt & 0x2000n) === 0x2000n;

      return {
        id: g.id,
        name: g.name,
        icon: iconUrl,
        owner: g.owner,
        permissions: g.permissions,
        memberCount: g.approximate_member_count || undefined,
        hasManageMessagesPermission: isAdmin || hasManage
      };
    });
  }
}
