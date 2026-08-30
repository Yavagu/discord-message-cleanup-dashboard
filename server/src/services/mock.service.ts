import { DiscordGuild, DiscordChannel, GuildMember, ScannedMessage } from '../types';
import { DateTime } from 'luxon';

export interface MockGuildData {
  guild: DiscordGuild;
  channels: DiscordChannel[];
  members: GuildMember[];
  messages: Array<{
    id: string;
    channelId: string;
    authorId: string;
    authorUsername: string;
    authorDisplayName: string;
    authorAvatarUrl: string;
    content: string;
    timestampUtc: string;
    hasAttachments: boolean;
    attachmentCount: number;
    hasEmbeds: boolean;
    embedCount: number;
  }>;
}

const MOCK_AVATARS = {
  admin: 'https://cdn.discordapp.com/embed/avatars/0.png',
  user1: 'https://cdn.discordapp.com/embed/avatars/1.png',
  user2: 'https://cdn.discordapp.com/embed/avatars/2.png',
  user3: 'https://cdn.discordapp.com/embed/avatars/3.png',
  user4: 'https://cdn.discordapp.com/embed/avatars/4.png',
  bot: 'https://cdn.discordapp.com/embed/avatars/5.png'
};

export const MOCK_GUILDS: DiscordGuild[] = [
  {
    id: '112233445566778899',
    name: 'Elysium Gaming Community',
    icon: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&h=128&fit=crop&crop=face',
    owner: true,
    permissions: '8', // Administrator
    memberCount: 1420,
    hasManageMessagesPermission: true
  },
  {
    id: '223344556677889900',
    name: 'Developer Forge & Modding',
    icon: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=128&h=128&fit=crop&crop=face',
    owner: false,
    permissions: '1099511627775',
    memberCount: 890,
    hasManageMessagesPermission: true
  },
  {
    id: '334455667788990011',
    name: 'CyberOps SecOps Hub',
    icon: null,
    owner: false,
    permissions: '8',
    memberCount: 312,
    hasManageMessagesPermission: true
  }
];

export const MOCK_CHANNELS: Record<string, DiscordChannel[]> = {
  '112233445566778899': [
    { id: '101', name: 'general-chat', type: 0, position: 1, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '102', name: 'announcements', type: 5, position: 2, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '103', name: 'game-clips-and-media', type: 0, position: 3, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '104', name: 'looking-for-group', type: 0, position: 4, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '105', name: 'bot-commands', type: 0, position: 5, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '106', name: 'vip-lounge', type: 0, position: 6, canView: true, canReadHistory: true, canManageMessages: false }, // permission test channel
    { id: '107', name: 'Lobby Voice Chat', type: 2, position: 7, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '108', name: 'Squad 1 (VC Chat)', type: 2, position: 8, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '109', name: 'Townhall Stage', type: 13, position: 9, canView: true, canReadHistory: true, canManageMessages: true }
  ],
  '223344556677889900': [
    { id: '201', name: 'welcome-and-rules', type: 0, position: 1, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '202', name: 'dev-general', type: 0, position: 2, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '203', name: 'code-reviews', type: 0, position: 3, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '204', name: 'releases', type: 5, position: 4, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '205', name: 'Dev Standup VC', type: 2, position: 5, canView: true, canReadHistory: true, canManageMessages: true }
  ],
  '334455667788990011': [
    { id: '301', name: 'incident-response', type: 0, position: 1, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '302', name: 'threat-intelligence', type: 0, position: 2, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '303', name: 'automated-alerts', type: 0, position: 3, canView: true, canReadHistory: true, canManageMessages: true },
    { id: '304', name: 'War Room VC', type: 2, position: 4, canView: true, canReadHistory: true, canManageMessages: true }
  ]
};

export const MOCK_MEMBERS: Record<string, GuildMember[]> = {
  '112233445566778899': [
    {
      id: '987654321000000001',
      username: 'SpammySam',
      displayName: 'Sam (Muted)',
      avatarUrl: MOCK_AVATARS.user1,
      roles: ['Member', 'Muted'],
      joinedAt: '2026-07-15T10:00:00Z'
    },
    {
      id: '987654321000000002',
      username: 'Alex_Mod',
      displayName: 'Alex | Senior Mod',
      avatarUrl: MOCK_AVATARS.user2,
      roles: ['Moderator', 'VIP'],
      joinedAt: '2025-01-10T14:30:00Z'
    },
    {
      id: '987654321000000003',
      username: 'DevSarah',
      displayName: 'Sarah // Systems Eng',
      avatarUrl: MOCK_AVATARS.user3,
      roles: ['Developer', 'Staff'],
      joinedAt: '2025-05-20T08:15:00Z'
    },
    {
      id: '987654321000000004',
      username: 'CryptoPromoBot',
      displayName: 'Crypto Daily Alerts [BOT]',
      avatarUrl: MOCK_AVATARS.bot,
      roles: ['Bot', 'Unverified'],
      joinedAt: '2026-08-01T12:00:00Z'
    }
  ],
  '223344556677889900': [
    {
      id: '987654321000000001',
      username: 'SpammySam',
      displayName: 'Sam (Muted)',
      avatarUrl: MOCK_AVATARS.user1,
      roles: ['Contributor'],
      joinedAt: '2026-07-20T10:00:00Z'
    },
    {
      id: '987654321000000003',
      username: 'DevSarah',
      displayName: 'Sarah // Systems Eng',
      avatarUrl: MOCK_AVATARS.user3,
      roles: ['Maintainer'],
      joinedAt: '2025-03-10T08:15:00Z'
    }
  ],
  '334455667788990011': [
    {
      id: '987654321000000001',
      username: 'SpammySam',
      displayName: 'Sam',
      avatarUrl: MOCK_AVATARS.user1,
      roles: ['Analyst'],
      joinedAt: '2026-08-02T10:00:00Z'
    }
  ]
};

// Generate realistic mock messages for testing filters (Date, Time, User ID)
export function generateMockMessages(guildId: string): MockGuildData['messages'] {
  const messages: MockGuildData['messages'] = [];
  const channels = MOCK_CHANNELS[guildId] || [];
  const members = MOCK_MEMBERS[guildId] || [];

  if (channels.length === 0 || members.length === 0) return [];

  const spammer = members.find(m => m.id === '987654321000000001') || members[0];
  const devSarah = members.find(m => m.id === '987654321000000003') || members[1];
  const cryptoBot = members.find(m => m.id === '987654321000000004') || members[0];

  const spamPhrases = [
    'Join our free discord server for free nitro: https://dis-gift.io/nitro-claim',
    'Get rich fast with this algorithmic trading bot! 500% APY guaranteed!',
    'Check out my stream! twitch.tv/randomstreamer - follow for follow!',
    'FREE STEAM GIFTCARD CODES: XXXX-YYYY-ZZZZ CLICK HERE',
    'Cheap game keys at keyseller.fake - 90% discount today only!',
    'DM me for promo deals and server partnerships @everyone',
    'Check this video clip out: https://sketchy-link.xyz/watch?v=8812',
    'Earn $500/day working 1 hour from home! Send message now!',
    'Can someone test my new hack script? Download at virus-link.net/dl',
    'Selling rare Discord accounts with early supporter badges! DM for price'
  ];

  const regularPhrases = [
    'Hey everyone! How is the weekend gaming session going?',
    'Has anyone tried the new patch update released this morning?',
    'I pushed the hotfix to staging, please review the PR when you have time.',
    'Server latency seems normal today around 24ms.',
    'Can a mod look at the ticket in #support? Thanks!',
    'Great match last night, let us run it back tonight at 8 PM!'
  ];

  let msgIdCounter = 100000000000000000n;

  // 1. Generate August 2026 messages for Spammer (August 1 to August 28, 2026)
  for (let day = 1; day <= 28; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;

    // Multiple messages per day at different times
    const times = [
      { h: 9, m: 15, afternoon: false },
      { h: 14, m: 30, afternoon: false },
      { h: 17, m: 5, afternoon: true }, // After 5:00 PM
      { h: 18, m: 45, afternoon: true }, // After 5:00 PM
      { h: 20, m: 20, afternoon: true }, // After 5:00 PM
      { h: 22, m: 50, afternoon: true }, // After 5:00 PM
      { h: 23, m: 40, afternoon: true }  // After 5:00 PM
    ];

    for (const t of times) {
      for (const ch of channels) {
        if (ch.id === '106') continue; // skip locked
        msgIdCounter += 17n;
        const hourStr = t.h < 10 ? `0${t.h}` : `${t.h}`;
        const minStr = t.m < 10 ? `0${t.m}` : `${t.m}`;
        const iso = `2026-08-${dayStr}T${hourStr}:${minStr}:00.000Z`;

        const isSpam = (day + t.h) % 2 === 0;
        const author = isSpam ? spammer : devSarah;
        const text = isSpam
          ? spamPhrases[(day + t.h + Number(ch.id)) % spamPhrases.length]
          : regularPhrases[(day + t.h) % regularPhrases.length];

        messages.push({
          id: String(msgIdCounter),
          channelId: ch.id,
          authorId: author.id,
          authorUsername: author.username,
          authorDisplayName: author.displayName,
          authorAvatarUrl: author.avatarUrl,
          content: text,
          timestampUtc: iso,
          hasAttachments: day % 4 === 0,
          attachmentCount: day % 4 === 0 ? 1 : 0,
          hasEmbeds: isSpam && day % 2 === 0,
          embedCount: isSpam && day % 2 === 0 ? 1 : 0
        });
      }
    }
  }

  // 2. Generate older messages (> 14 days and > 30 days old for testing bulk delete age cutoff)
  for (let day = 1; day <= 25; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    for (const ch of channels.slice(0, 3)) {
      msgIdCounter += 23n;
      messages.push({
        id: String(msgIdCounter),
        channelId: ch.id,
        authorId: spammer.id,
        authorUsername: spammer.username,
        authorDisplayName: spammer.displayName,
        authorAvatarUrl: spammer.avatarUrl,
        content: `[Archived Jul 2026] Nitro promo claim link #${day}`,
        timestampUtc: `2026-07-${dayStr}T19:30:00.000Z`,
        hasAttachments: false,
        attachmentCount: 0,
        hasEmbeds: true,
        embedCount: 1
      });
    }
  }

  return messages;
}

// In-memory mock store keyed by guildId
const mockStore = new Map<string, MockGuildData['messages']>();

export function getMockMessagesForGuild(guildId: string): MockGuildData['messages'] {
  if (!mockStore.has(guildId)) {
    mockStore.set(guildId, generateMockMessages(guildId));
  }
  return mockStore.get(guildId) || [];
}

export function deleteMockMessage(guildId: string, messageId: string): boolean {
  const msgs = getMockMessagesForGuild(guildId);
  const index = msgs.findIndex(m => m.id === messageId);
  if (index !== -1) {
    msgs.splice(index, 1);
    mockStore.set(guildId, msgs);
    return true;
  }
  return false;
}
