import {
  DISCORD_API_BASE,
  DISCORD_USER_AGENT,
  DiscordPermissions,
  getDiscordErrorDetail
} from '../constants/discord.constants';
import { ChannelPermissionOverwrite, DiscordChannel } from '../types';
import { logger } from '../utils/logger';

export class DiscordApiError extends Error {
  public statusCode: number;
  public discordCode?: number;
  public retryAfter?: number;
  public details?: any;

  constructor(message: string, statusCode: number, discordCode?: number, retryAfter?: number, details?: any) {
    super(message);
    this.name = 'DiscordApiError';
    this.statusCode = statusCode;
    this.discordCode = discordCode;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

export class DiscordApiService {
  /**
   * Sanitizes a bot token string by stripping any leading 'Bot ' prefix and trimming whitespace.
   */
  public static sanitizeToken(token: string): string {
    if (!token) return '';
    return token.trim().replace(/^Bot\s+/i, '');
  }

  /**
   * Centralized HTTP client with rate-limit backoff (429) and transient 5xx retries.
   */
  public static async request<T = any>(
    endpoint: string,
    token: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
      body?: any;
      maxRetries?: number;
    } = {}
  ): Promise<{ status: number; data: T }> {
    const { method = 'GET', body, maxRetries = 3 } = options;
    const cleanToken = this.sanitizeToken(token);

    if (!cleanToken) {
      throw new DiscordApiError('Discord Bot Token is required', 401);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${DISCORD_API_BASE}${endpoint}`;
    let attempt = 0;

    const headers: Record<string, string> = {
      Authorization: `Bot ${cleanToken}`,
      'User-Agent': DISCORD_USER_AGENT
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    while (attempt < maxRetries) {
      attempt++;
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined
        });

        // 1. Handle Rate Limits (HTTP 429)
        if (res.status === 429) {
          let waitMs = 1000;
          const retryAfterHeader = res.headers.get('Retry-After');

          if (retryAfterHeader) {
            waitMs = Math.ceil(parseFloat(retryAfterHeader) * 1000);
          } else {
            try {
              const resBody = await res.clone().json() as any;
              if (resBody.retry_after) {
                waitMs = Math.ceil(resBody.retry_after * 1000);
              }
            } catch {
              // fallback
            }
          }

          logger.warn(`[DiscordApiService] 429 Rate Limit on ${method} ${endpoint}. Backing off ${waitMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitMs + 50));
          continue;
        }

        // 2. Handle Transient Server Errors (HTTP 5xx)
        if (res.status >= 500 && attempt < maxRetries) {
          const jitter = Math.random() * 100;
          const backoff = Math.min(2000, 200 * Math.pow(2, attempt) + jitter);
          logger.warn(`[DiscordApiService] 5xx Server Error (${res.status}) on ${method} ${endpoint}. Retrying in ${Math.round(backoff)}ms`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }

        // 3. Handle 204 No Content
        if (res.status === 204) {
          return { status: 204, data: null as any };
        }

        // 4. Parse Response Body
        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const data = isJson ? await res.json() : await res.text();

        if (!res.ok) {
          const discordCode = typeof data === 'object' && data ? data.code : undefined;
          const errorMsg = typeof data === 'object' && data ? data.message || `HTTP ${res.status}` : String(data);
          const errorDetail = getDiscordErrorDetail(discordCode || res.status, errorMsg);

          throw new DiscordApiError(
            errorDetail.reason,
            res.status,
            discordCode,
            undefined,
            data
          );
        }

        return { status: res.status, data: data as T };
      } catch (err: any) {
        if (err instanceof DiscordApiError) {
          throw err;
        }
        if (attempt >= maxRetries) {
          logger.error(`[DiscordApiService] Network failure after ${maxRetries} attempts on ${method} ${url}`, err);
          throw new DiscordApiError(err.message || 'Network error communicating with Discord API', 0);
        }
        const backoff = Math.min(2000, 200 * Math.pow(2, attempt) + Math.random() * 100);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw new DiscordApiError(`Max retries (${maxRetries}) exceeded calling Discord API`, 504);
  }

  /**
   * Computes effective permissions for a channel based on base guild permissions and overwrites.
   */
  public static computeChannelPermissions(
    guildBasePermissionsBigInt: bigint,
    overwrites: ChannelPermissionOverwrite[] = [],
    guildId?: string
  ): {
    canView: boolean;
    canReadHistory: boolean;
    canManageMessages: boolean;
  } {
    // Administrator grants all channel permissions unconditionally
    if ((guildBasePermissionsBigInt & DiscordPermissions.ADMINISTRATOR) === DiscordPermissions.ADMINISTRATOR) {
      return {
        canView: true,
        canReadHistory: true,
        canManageMessages: true
      };
    }

    let permissions = guildBasePermissionsBigInt;

    // Apply @everyone role overwrite if present
    if (guildId && overwrites.length > 0) {
      const everyoneOverwrite = overwrites.find(o => o.id === guildId && o.type === 0);
      if (everyoneOverwrite) {
        const allow = BigInt(everyoneOverwrite.allow || '0');
        const deny = BigInt(everyoneOverwrite.deny || '0');
        permissions = (permissions & ~deny) | allow;
      }
    }

    const canView = (permissions & DiscordPermissions.VIEW_CHANNEL) === DiscordPermissions.VIEW_CHANNEL;
    const canReadHistory = (permissions & DiscordPermissions.READ_MESSAGE_HISTORY) === DiscordPermissions.READ_MESSAGE_HISTORY;
    const canManageMessages = (permissions & DiscordPermissions.MANAGE_MESSAGES) === DiscordPermissions.MANAGE_MESSAGES;

    return { canView, canReadHistory, canManageMessages };
  }
}
