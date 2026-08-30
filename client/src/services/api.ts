import {
  AppSettings,
  BotStatus,
  CleanupJob,
  DashboardMetrics,
  DetailedCleanupReport,
  DiscordChannel,
  DiscordGuild,
  GuildMember,
  ScannedMessage
} from '../types';

let currentCsrfToken = '';

export function setCsrfToken(token: string) {
  currentCsrfToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (currentCsrfToken) {
    headers['X-CSRF-Token'] = currentCsrfToken;
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const errorMsg = errorBody.error || errorBody.message || `Request failed with status ${res.status}`;
    const err = new Error(errorMsg) as any;
    err.status = res.status;
    err.code = errorBody.code;
    throw err;
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (password: string) => request<{ success: boolean; session: any }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  }),

  demoLogin: () => request<{ success: boolean; session: any }>('/api/auth/demo-login', {
    method: 'POST'
  }),

  getSession: () => request<{ authenticated: boolean; session?: any }>('/api/auth/session'),

  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Bot
  connectBot: (token: string, isDemo = false) => request<{ success: boolean; isDemo: boolean; status: BotStatus; maskedToken?: string }>('/api/bot/connect', {
    method: 'POST',
    body: JSON.stringify({ token, isDemo })
  }),

  disconnectBot: () => request<{ success: boolean }>('/api/bot/disconnect', { method: 'POST' }),

  getBotStatus: () => request<BotStatus>('/api/bot/status'),

  // Guilds & Channels & Members
  getGuilds: () => request<DiscordGuild[]>('/api/guilds'),

  getChannels: (guildId: string) => request<DiscordChannel[]>(`/api/guilds/${guildId}/channels`),

  searchMembers: (guildId: string, query: string) =>
    request<{ members: GuildMember[]; intentAvailable: boolean; warning?: string }>(
      `/api/guilds/${guildId}/members?query=${encodeURIComponent(query)}`
    ),

  // Scanning & Jobs
  scanMessages: (payload: any) => request<{
    success: boolean;
    jobId: string;
    scannedCount: number;
    matchedCount: number;
    channelsCount: number;
    durationMs: number;
    timezone: string;
    messages: ScannedMessage[];
  }>('/api/jobs/scan', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  getJobDetails: (jobId: string, params: { search?: string; channelId?: string; sort?: string; page?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.channelId) query.set('channelId', params.channelId);
    if (params.sort) query.set('sort', params.sort);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    return request<{
      job: CleanupJob;
      pagination: { page: number; limit: number; total: number; totalPages: number };
      messages: ScannedMessage[];
    }>(`/api/jobs/${jobId}?${query.toString()}`);
  },

  deleteJobMessages: (jobId: string, selectedMessageIds?: string[], confirmed = true) =>
    request<{ success: boolean; message: string; jobId: string }>(`/api/jobs/${jobId}/delete`, {
      method: 'POST',
      body: JSON.stringify({ selectedMessageIds, confirmed })
    }),

  cancelJob: (jobId: string) => request<{ success: boolean }>(`/api/jobs/${jobId}/cancel`, {
    method: 'POST'
  }),

  // History & Reports
  getHistory: (params: { status?: string; search?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    return request<{ jobs: CleanupJob[]; total: number }>(`/api/history?${query.toString()}`);
  },

  getJobReport: (jobId: string) => request<DetailedCleanupReport>(`/api/reports/${jobId}`),

  getDashboardMetrics: () => request<DashboardMetrics>('/api/dashboard/stats'),

  // Settings
  getSettings: () => request<AppSettings>('/api/settings'),

  updateSettings: (settings: Partial<AppSettings>) => request<{ success: boolean; settings: AppSettings }>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  }),

  // Export URLs
  getJsonExportUrl: (jobId: string) => `/api/reports/${jobId}/export/json`,
  getCsvExportUrl: (jobId: string) => `/api/reports/${jobId}/export/csv`
};
