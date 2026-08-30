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
  resetTimestamp: number;
  queue: Promise<void>;
}

export class DiscordApiService {
  private static globalResetTimestamp = 0;
  private static buckets = new Map<string, BucketState>();
  private static routeToBucketIdentity = new Map<string, string>();

  /**
   * Extracts the Discord major resource parameter (channel_id, guild_id) and route pattern.
   * In Discord's rate-limit architecture, rate-limit buckets are scoped to (bucket_hash, major_parameter).
   */
  private static parseRouteInfo(method: string, path: string): { routeKey: string; majorParam: string } {
    const cleanPath = path.split('?')[0];

    const channelMatch = cleanPath.match(/\/channels\/(\d+)/);
    if (channelMatch) {
      const channelId = channelMatch[1];
      const majorParam = `channel:${channelId}`;
      const routePattern = cleanPath.endsWith('/bulk-delete')
        ? `${method}:/channels/:id/messages/bulk-delete`
        : `${method}:/channels/:id/messages`;
      return { routeKey: `${routePattern}:${majorParam}`, majorParam };
    }

    const guildMatch = cleanPath.match(/\/guilds\/(\d+)/);
    if (guildMatch) {
      const guildId = guildMatch[1];
      const majorParam = `guild:${guildId}`;
      let routePattern = `${method}:/guilds/:id`;
      if (cleanPath.includes('/members')) {
        routePattern = `${method}:/guilds/:id/members`;
      } else if (cleanPath.includes('/channels')) {
        routePattern = `${method}:/guilds/:id/channels`;
      }
      return { routeKey: `${routePattern}:${majorParam}`, majorParam };
    }

    return { routeKey: `${method}:${cleanPath}`, majorParam: 'top_level' };
  }

  /**
   * Executes an HTTP request to the Discord API with rate-limit bucket scheduling
   * scoped to (bucketHash, majorResource), proactive rate limit delay, global 429 locks,
   * and exponential backoff on 5xx.
   */
  public static async request<T = any>(
    path: string,
    botToken: string,
    options: DiscordRequestOptions = {}
  ): Promise<{ data: T; headers: Headers }> {
    const url = path.startsWith('http') ? path : `${DISCORD_API_BASE}${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const { routeKey, majorParam } = this.parseRouteInfo(method, path);

    // Derive effective bucket key combining learned bucket hash and major parameter
    const effectiveBucketKey = this.routeToBucketIdentity.get(routeKey) || routeKey;

    let bucket = this.buckets.get(effectiveBucketKey);
    if (!bucket) {
      bucket = {
        remaining: 1,
        resetTimestamp: 0,
        queue: Promise.resolve()
      };
      this.buckets.set(effectiveBucketKey, bucket);
    }

    // Chain execution to serialize requests on the same rate limit bucket
    const currentExecution = bucket.queue.then(async () => {
      return this.executeWithRetry<T>(url, path, botToken, options, routeKey, majorParam, effectiveBucketKey);
    });

    // Update queue head without causing unhandled rejections in the chain
    bucket.queue = currentExecution.then(() => {}, () => {});

    return currentExecution;
  }

  private static async executeWithRetry<T>(
    url: string,
    path: string,
    botToken: string,
    options: DiscordRequestOptions,
    routeKey: string,
    majorParam: string,
    initialBucketKey: string
  ): Promise<{ data: T; headers: Headers }> {
    const maxRetries = options.maxRetries ?? 5;
    let attempt = 0;
    const sanitizedToken = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken.trim()}`;

    while (attempt <= maxRetries) {
      attempt++;

      // Wait if a global rate limit is currently active
      const now = Date.now();
      if (this.globalResetTimestamp > now) {
        const waitMs = this.globalResetTimestamp - now;
        logger.info(`Discord API global rate limit active: waiting ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      // Check per-bucket quota and delay if remaining capacity is exhausted
      const activeBucketKey = this.routeToBucketIdentity.get(routeKey) || initialBucketKey;
      const bucket = this.buckets.get(activeBucketKey);
      if (bucket && bucket.remaining <= 0 && bucket.resetTimestamp > Date.now()) {
        const waitMs = Math.max(0, bucket.resetTimestamp - Date.now()) + 25;
        logger.info(`Discord rate limit bucket ${activeBucketKey} exhausted: waiting ${waitMs}ms`);
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

        // Update bucket metadata from response headers
        const bucketHeader = res.headers.get('X-RateLimit-Bucket');
        const remainingHeader = res.headers.get('X-RateLimit-Remaining');
        const resetAfterHeader = res.headers.get('X-RateLimit-Reset-After');
        const isGlobalHeader = res.headers.get('X-RateLimit-Global') === 'true';

        if (bucketHeader) {
          // Scope bucket identity to (bucketHeader, majorParam)
          const learnedBucketIdentity = `${bucketHeader}:${majorParam}`;
          this.routeToBucketIdentity.set(routeKey, learnedBucketIdentity);

          let targetBucket = this.buckets.get(learnedBucketIdentity);
          if (!targetBucket) {
            targetBucket = {
              remaining: 1,
              resetTimestamp: 0,
              queue: Promise.resolve()
            };
            this.buckets.set(learnedBucketIdentity, targetBucket);
          }
          if (remainingHeader !== null) {
            const parsedRemaining = parseInt(remainingHeader, 10);
            if (!isNaN(parsedRemaining)) {
              targetBucket.remaining = parsedRemaining;
            }
          }
          if (resetAfterHeader !== null) {
            const parsedResetAfter = parseFloat(resetAfterHeader);
            if (!isNaN(parsedResetAfter)) {
              targetBucket.resetTimestamp = Date.now() + Math.ceil(parsedResetAfter * 1000);
            }
          }
        }

        // Handle 429 Rate Limits
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
              const parsed = parseFloat(headerRetry);
              if (!isNaN(parsed)) {
                retryAfterMs = Math.ceil(parsed * 1000);
              }
            }
          }

          retryAfterMs += 25;

          if (isGlobal429) {
            this.globalResetTimestamp = Date.now() + retryAfterMs;
            logger.warn(`Discord API 429 global rate limit: pausing all requests for ${retryAfterMs}ms`);
          } else {
            const currentActiveKey = this.routeToBucketIdentity.get(routeKey) || initialBucketKey;
            const targetBucket = this.buckets.get(currentActiveKey);
            if (targetBucket) {
              targetBucket.remaining = 0;
              targetBucket.resetTimestamp = Date.now() + retryAfterMs;
            }
            logger.warn(`Discord API 429 route rate limit on ${path}: waiting ${retryAfterMs}ms (attempt ${attempt}/${maxRetries})`);
          }

          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
            continue;
          }
          throw new DiscordApiError(`Rate limit exceeded after ${maxRetries} retries`, 429, 429);
        }

        // Handle 5xx Server Errors with bounded exponential backoff and jitter
        if (res.status >= 500 && res.status < 600) {
          if (attempt <= maxRetries) {
            const backoffMs = Math.min(8000, 500 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 200);
            logger.warn(`Discord API 5xx error (${res.status}) on ${path}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          throw new DiscordApiError(`Discord API 5xx Server Error (${res.status}) after ${maxRetries} retries`, res.status);
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

        if (res.status === 204) {
          return { data: null as any, headers: res.headers };
        }

        const data = await res.json();
        return { data, headers: res.headers };
      } catch (err: any) {
        if (err instanceof DiscordApiError) {
          throw err;
        }

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
   * Evaluates effective channel permissions following Discord's permission resolution hierarchy:
   * 1. Administrator override grants all permissions unconditionally.
   * 2. Base permissions derive from @everyone and member roles.
   * 3. @everyone channel overwrite applies first.
   * 4. Member role overwrites aggregate: role denies apply, then role allows apply.
   * 5. Member-specific overwrite applies last (deny, then allow).
   * 6. Visibility dependency: if VIEW_CHANNEL is denied, reading history and managing messages are denied.
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
    if ((baseGuildPermissions & DiscordPermissions.ADMINISTRATOR) === DiscordPermissions.ADMINISTRATOR) {
      return {
        canView: true,
        canReadHistory: true,
        canManageMessages: true,
        rawPermissions: baseGuildPermissions
      };
    }

    let permissions = baseGuildPermissions;

    if (guildId && overwrites.length > 0) {
      const everyoneOverwrite = overwrites.find(o => o.id === guildId && o.type === 0);
      if (everyoneOverwrite) {
        const allow = BigInt(everyoneOverwrite.allow || '0');
        const deny = BigInt(everyoneOverwrite.deny || '0');
        permissions = (permissions & ~deny) | allow;
      }
    }

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

    permissions &= ~roleDenies;
    permissions |= roleAllows;

    if (memberUserId && overwrites.length > 0) {
      const memberOverwrite = overwrites.find(o => o.id === memberUserId && o.type === 1);
      if (memberOverwrite) {
        const memberDeny = BigInt(memberOverwrite.deny || '0');
        const memberAllow = BigInt(memberOverwrite.allow || '0');
        permissions &= ~memberDeny;
        permissions |= memberAllow;
      }
    }

    const canView = (permissions & DiscordPermissions.VIEW_CHANNEL) === DiscordPermissions.VIEW_CHANNEL;

    if (!canView) {
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

  /**
   * Resets internal rate limit state (primarily used in test fixtures).
   */
  public static resetRateLimits(): void {
    this.globalResetTimestamp = 0;
    this.buckets.clear();
    this.routeToBucketIdentity.clear();
  }
}
