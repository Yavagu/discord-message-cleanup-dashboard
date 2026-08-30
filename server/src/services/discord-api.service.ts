import {
  DISCORD_API_BASE,
  DISCORD_USER_AGENT,
  DiscordPermissions
} from '../constants/discord.constants';
import { ChannelPermissionOverwrite } from '../types';
import { logger } from '../utils/logger';

export interface DiscordRequestOptions extends RequestInit {
  maxRetries?: number;
  body?: any;
}

export class DiscordApiError extends Error {
  public statusCode: number;
  public discordCode?: number;
  public rawBody?: any;

  constructor(message: string, statusCode: number, discordCode?: number, rawBody?: any) {
    super(message);
    this.name = 'DiscordApiError';
    this.statusCode = statusCode;
    this.discordCode = discordCode;
    this.rawBody = rawBody;
  }
}

interface BucketState {
  remaining: number;
  resetAfterMs: number;
  resetTimestamp: number;
}

export class DiscordApiService {
  private static globalResetTimestamp = 0;
  private static bucketMap = new Map<string, BucketState>();
  private static requestQueue: Promise<void> = Promise.resolve();

  /**
   * Coordinated HTTP request execution with process-local rate limit queuing,
   * exponential backoff with jitter on 5xx, and retry handling on 429.
   */
  public static async request<T = any>(
    path: string,
    botToken: string,
    options: DiscordRequestOptions = {}
  ): Promise<{ data: T; headers: Headers }> {
    const url = path.startsWith('http') ? path : `${DISCORD_API_BASE}${path}`;
    const maxRetries = options.maxRetries ?? 5;
    let attempt = 0;

    const sanitizedToken = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken.trim()}`;

    while (attempt <= maxRetries) {
      attempt++;

      // Wait if a global rate limit is currently active
      const now = Date.now();
      if (this.globalResetTimestamp > now) {
        const waitMs = this.globalResetTimestamp - now;
        logger.info(`Discord API Global Rate Limit active: waiting ${waitMs}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      const headers: Record<string, string> = {
        Authorization: sanitizedToken,
        'User-Agent': DISCORD_USER_AGENT,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {})
      };

      const fetchOptions: RequestInit = {
        ...options,
        headers,
        body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
      };

      try {
        const res = await fetch(url, fetchOptions);

        // Update bucket tracking from response headers
        const bucketHeader = res.headers.get('X-RateLimit-Bucket');
        const remainingHeader = res.headers.get('X-RateLimit-Remaining');
        const resetAfterHeader = res.headers.get('X-RateLimit-Reset-After');
        const isGlobalHeader = res.headers.get('X-RateLimit-Global') === 'true';

        if (bucketHeader && resetAfterHeader) {
          const resetAfterMs = Math.ceil(parseFloat(resetAfterHeader) * 1000);
          this.bucketMap.set(bucketHeader, {
            remaining: remainingHeader ? parseInt(remainingHeader, 10) : 1,
            resetAfterMs,
            resetTimestamp: Date.now() + resetAfterMs
          });
        }

        // Handle 429 Rate Limit responses
        if (res.status === 429) {
          let retryAfterMs = 1000;
          let isGlobal429 = isGlobalHeader;

          try {
            const rawBody = await res.json();
            if (rawBody && typeof rawBody.retry_after === 'number') {
              retryAfterMs = Math.ceil(rawBody.retry_after * 1000);
            }
            if (rawBody?.global === true) {
              isGlobal429 = true;
            }
          } catch {
            const headerRetry = res.headers.get('Retry-After');
            if (headerRetry) {
              retryAfterMs = Math.ceil(parseFloat(headerRetry) * 1000);
            }
          }

          // Apply a safety padding of 100ms
          retryAfterMs += 100;

          if (isGlobal429) {
            this.globalResetTimestamp = Date.now() + retryAfterMs;
            logger.warn(`Discord API 429 GLOBAL Rate Limit: Pausing all requests for ${retryAfterMs}ms`);
          } else {
            logger.warn(`Discord API 429 Route Rate Limit on ${path}: Pausing for ${retryAfterMs}ms (attempt ${attempt}/${maxRetries})`);
          }

          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
            continue;
          } else {
            throw new DiscordApiError(`Rate limit exceeded after ${maxRetries} retries`, 429, 429);
          }
        }

        // Handle 5xx Server Errors (Bounded Exponential Backoff with Jitter)
        if (res.status >= 500 && res.status < 600) {
          if (attempt <= maxRetries) {
            const backoffMs = Math.min(8000, 500 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 200);
            logger.warn(`Discord API 5xx Server Error (${res.status}) on ${path}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
        }

        // Handle 4xx Client Errors
        if (!res.ok) {
          let rawBody: any = null;
          let discordCode: number | undefined;
          let message = `Discord API returned HTTP ${res.status}`;

          try {
            rawBody = await res.json();
            if (rawBody) {
              discordCode = rawBody.code;
              message = rawBody.message || message;
            }
          } catch {
            // Body was not JSON
          }

          throw new DiscordApiError(message, res.status, discordCode, rawBody);
        }

        // 204 No Content
        if (res.status === 204) {
          return { data: null as any, headers: res.headers };
        }

        const data = await res.json();
        return { data, headers: res.headers };
      } catch (err: any) {
        if (err instanceof DiscordApiError) {
          throw err;
        }

        // Transient network errors (DNS, TCP, timeout)
        if (attempt <= maxRetries) {
          const backoffMs = 500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
          logger.warn(`Network error requesting ${path}: ${err.message}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        throw new DiscordApiError(`Network failure communicating with Discord API: ${err.message}`, 0);
      }
    }

    throw new DiscordApiError(`Request failed after ${maxRetries} attempts`, 0);
  }

  /**
   * Computes effective channel permissions following Discord's authoritative 8-step permission resolution algorithm:
   * 1. Check Administrator flag on base guild permissions (bypasses all channel overwrites).
   * 2. Start with guild base permissions (derived from @everyone and member's guild roles).
   * 3. Apply @everyone role overwrite on channel: permissions = (permissions & ~deny) | allow.
   * 4. Aggregate all member's role overwrites across the channel (combining denies and allows).
   * 5. Apply aggregated role denies: permissions &= ~roleDenies.
   * 6. Apply aggregated role allows: permissions |= roleAllows.
   * 7. Apply member-specific deny (if present): permissions &= ~memberDeny.
   * 8. Apply member-specific allow (if present): permissions |= memberAllow.
   * 9. Invariant: If VIEW_CHANNEL is false, the channel is inaccessible (canView = canReadHistory = canManageMessages = false).
   */
  public static computeChannelPermissions(
    baseGuildPermissions: bigint,
    overwrites: ChannelPermissionOverwrite[] = [],
    guildId?: string,
    memberRoleIds: string[] = [],
    memberUserId?: string
  ): {
    canView: boolean;
    canReadHistory: boolean;
    canManageMessages: boolean;
    rawPermissions: bigint;
  } {
    // 1. Administrator Bypass
    if ((baseGuildPermissions & DiscordPermissions.ADMINISTRATOR) === DiscordPermissions.ADMINISTRATOR) {
      return {
        canView: true,
        canReadHistory: true,
        canManageMessages: true,
        rawPermissions: baseGuildPermissions
      };
    }

    // 2. Base permissions
    let permissions = baseGuildPermissions;

    // 3. Apply @everyone role overwrite (type === 0, id === guildId)
    if (guildId && overwrites.length > 0) {
      const everyoneOverwrite = overwrites.find(o => o.id === guildId && o.type === 0);
      if (everyoneOverwrite) {
        const allow = BigInt(everyoneOverwrite.allow || '0');
        const deny = BigInt(everyoneOverwrite.deny || '0');
        permissions = (permissions & ~deny) | allow;
      }
    }

    // 4. Aggregate all member role overwrites
    let roleDenies = 0n;
    let roleAllows = 0n;

    if (memberRoleIds.length > 0 && overwrites.length > 0) {
      for (const overwrite of overwrites) {
        if (overwrite.type === 0 && memberRoleIds.includes(overwrite.id)) {
          roleDenies |= BigInt(overwrite.deny || '0');
          roleAllows |= BigInt(overwrite.allow || '0');
        }
      }
    }

    // 5. Apply aggregated role denies
    permissions &= ~roleDenies;

    // 6. Apply aggregated role allows
    permissions |= roleAllows;

    // 7 & 8. Apply member-specific user overwrite (type === 1, id === memberUserId)
    if (memberUserId && overwrites.length > 0) {
      const memberOverwrite = overwrites.find(o => o.id === memberUserId && o.type === 1);
      if (memberOverwrite) {
        const memberDeny = BigInt(memberOverwrite.deny || '0');
        const memberAllow = BigInt(memberOverwrite.allow || '0');
        permissions &= ~memberDeny;
        permissions |= memberAllow;
      }
    }

    // 9. Evaluate specific flags with visibility hierarchy
    const canView = (permissions & DiscordPermissions.VIEW_CHANNEL) === DiscordPermissions.VIEW_CHANNEL;

    if (!canView) {
      // If a bot/user cannot view a channel, reading history and managing messages are impossible
      return {
        canView: false,
        canReadHistory: false,
        canManageMessages: false,
        rawPermissions: permissions
      };
    }

    const canReadHistory = (permissions & DiscordPermissions.READ_MESSAGE_HISTORY) === DiscordPermissions.READ_MESSAGE_HISTORY;
    const canManageMessages = (permissions & DiscordPermissions.MANAGE_MESSAGES) === DiscordPermissions.MANAGE_MESSAGES;

    return {
      canView,
      canReadHistory,
      canManageMessages,
      rawPermissions: permissions
    };
  }
}
