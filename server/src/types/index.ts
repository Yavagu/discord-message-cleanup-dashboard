export type JobStatus =
  | 'DRAFT'
  | 'SCANNING'
  | 'READY'
  | 'DELETING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type DateFilterMode =
  | 'ALL_TIME'
  | 'SPECIFIC_DATE'
  | 'BEFORE_DATE'
  | 'AFTER_DATE'
  | 'BETWEEN_DATES'
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'CUSTOM_RANGE';

export type TimeFilterMode =
  | 'ANY_TIME'
  | 'AFTER_TIME'
  | 'BEFORE_TIME'
  | 'BETWEEN_TIMES';

export interface FilterConfig {
  targetUserId: string;
  targetUsername?: string;
  targetDisplayName?: string;
  targetAvatar?: string;
  targetAvatarUrl?: string;
  channelIds: string[]; // empty or ['all'] means all accessible channels
  timezone: string; // IANA timezone e.g. "Asia/Kolkata", "America/New_York", "UTC"
  dateMode: DateFilterMode;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  timeMode: TimeFilterMode;
  startTime?: string; // HH:mm (24h) e.g. "17:00"
  endTime?: string; // HH:mm (24h) e.g. "23:59"
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  globalName?: string | null;
  avatar?: string | null;
  bot?: boolean;
}

export interface GuildMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  roles: string[];
  joinedAt?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  memberCount?: number;
  hasManageMessagesPermission?: boolean;
}

export interface ChannelPermissionOverwrite {
  id: string;
  type: number; // 0 = role, 1 = member
  allow: string;
  deny: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
  parentName?: string | null;
  position?: number;
  canView?: boolean;
  canReadHistory?: boolean;
  canManageMessages?: boolean;
  permissionOverwrites?: ChannelPermissionOverwrite[];
}

export interface ScannedMessage {
  id: string;
  channelId: string;
  channelName: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string;
  content: string;
  timestampUtc: string; // ISO 8601 UTC
  timestampLocalFormatted: string; // in job timezone
  hasAttachments: boolean;
  attachmentCount: number;
  hasEmbeds: boolean;
  embedCount: number;
  isBulkDeletable: boolean; // evaluated against configured safety cutoff
  ageDays: number;
}

export interface CleanupFailure {
  id?: number;
  jobId: string;
  messageId: string;
  channelId: string;
  channelName: string;
  authorId: string;
  timestampUtc: string;
  errorCode: string | number;
  failureReason: string;
  suggestions?: string;
}

export interface CleanupJob {
  id: string;
  sessionId: string;
  status: JobStatus;
  guildId: string;
  guildName: string;
  targetUserId: string;
  targetUsername: string;
  targetDisplayName: string;
  targetAvatarUrl: string;
  channelsJson: string; // JSON array of channel IDs and names
  filterConfig: FilterConfig;
  timezone: string;
  scannedCount: number;
  matchedCount: number;
  selectedCount: number;
  deletedCount: number;
  failedCount: number;
  durationMs: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  error?: string;
}

export interface JobProgressUpdate {
  jobId: string;
  status: JobStatus;
  totalSelected: number;
  processed: number;
  deleted: number;
  failed: number;
  remaining: number;
  percent: number;
  currentChannelName?: string;
  currentMessageId?: string;
  rateLimitPacingMs?: number;
  etaSeconds?: number;
  error?: string;
}

export interface BotStatus {
  connected: boolean;
  isDemo: boolean;
  botUser?: {
    id: string;
    username: string;
    avatarUrl: string;
  };
  permissions: {
    viewChannel: boolean;
    readMessageHistory: boolean;
    manageMessages: boolean;
  };
  privilegedIntents: {
    guildMembers: boolean;
    messageContent: boolean;
  };
  guildCount: number;
  rateLimitSafetyMs: number;
}

export interface AdminSession {
  id: string;
  adminUser: string;
  csrfToken: string;
  isDemo: boolean;
  botToken?: string; // in-memory session only
  createdAt: string;
  expiresAt: string;
}

export interface AppSettings {
  pacingMs: number;
  bulkCutoffHours: number;
  requireDoubleConfirm: boolean;
  defaultTimezone: string;
  maxMessagesPerChannel: number;
  updatedAt?: string;
}

export interface DashboardMetrics {
  totalScanned: number;
  totalDeleted: number;
  totalFailed: number;
  totalJobs: number;
  successRate: number;
  recentJobs: CleanupJob[];
}

export interface DetailedCleanupReport {
  job: CleanupJob;
  successRatePercent: number;
  channelsSearched: Array<{ id: string; name: string }>;
  channelBreakdown: Array<{
    channelId: string;
    channelName: string;
    matched: number;
    deleted: number;
    failed: number;
  }>;
  failures: CleanupFailure[];
  scannedSample: ScannedMessage[];
}
