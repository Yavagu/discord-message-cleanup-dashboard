import {
  DISCORD_API_BASE,
  DISCORD_USER_AGENT,
  DiscordPermissions
} from '../constants/discord.constants';
import {
  ChannelPermissionOverwrite,
  DiscordErrorResponse,
  DiscordRateLimitResponse
} from '../types';
import { logger } from '../utils/logger';

export interface DiscordRequestOptions extends Omit<RequestInit, 'body'> {
  maxRetries?: number;
  body?: unknown;
}

export class DiscordApiError extends Error {
  public statusCode: number;
  public discordCode?: number;
  public rawBody?: unknown;

  constructor(message: string, statusCode: number, discordCode?: number, rawBody?: unknown) {
    super(message);
    this.name = 'DiscordApiError';
    this.statusCode = statusCode;
    this.discordCode = discordCode;
    this.rawBody = rawBody;
  }
}

class RateLimitBucket {
  public readonly key: string;
  public remaining = 1;
  public resetTimestamp = 0;
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  constructor(key: string) {
    this.key = key;
  }

  /**
   * Enqueues a dispatch task onto this bucket's FIFO execution queue.
   */
  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.processNext();
    });
  }

  /**
   * Migrates queued tasks from an unresolved temporary bucket into this canonical bucket.
   */
  public mergeFrom(other: RateLimitBucket): void {
    if (other.queue.length > 0) {
      this.queue.push(...other.queue);
      other.queue = [];
    }
    this.processNext();
  }

  private processNext(): void {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const nextTask = this.queue.shift()!;
    (async () => {
      try {
        await nextTask();
      } finally {
        this.isProcessing = false;
        this.processNext();
      }
    })();
  }
}

export class DiscordApiService {
  private static globalResetTimestamp = 0;
  private static buckets = new Map<string, RateLimitBucket>();
  private static routeToBucketIdentity = new Map<string, string>();

  private static getOrCreateBucket(key: string): RateLimitBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new RateLimitBucket(key);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /**
   * Extracts the Discord major resource parameter (channel_id, guild_id) and normalized route pattern.
   * Discord rate limits are scoped to (bucket_hash, major_parameter).
   */
  public static parseRouteInfo(method: string, path: string): { routeKey: string; majorParam: string } {
    const cleanPath = path.split('?')[0];

    // Channel routes: /channels/:id, /channels/:id/messages, /channels/:id/messages/bulk-delete, etc.
    const channelMatch = cleanPath.match(/^\/channels\/(\d+)(.*)$/);
    if (channelMatch) {
      const channelId = channelMatch[1];
      const subPath = channelMatch[2];
      const majorParam = `channel:${channelId}`;

      let routePattern = `${method}:/channels/:id`;
      if (subPath.startsWith('/messages/bulk-delete')) {
        routePattern = `${method}:/channels/:id/messages/bulk-delete`;
      } else if (subPath.match(/^\/messages\/\d+$/)) {
        routePattern = `${method}:/channels/:id/messages/:id`;
      } else if (subPath.startsWith('/messages')) {
        routePattern = `${method}:/channels/:id/messages`;
      }
      return { routeKey: `${routePattern}:${majorParam}`, majorParam };
    }

    // Guild routes: /guilds/:id, /guilds/:id/channels, /guilds/:id/members, /guilds/:id/members/search, etc.
    const guildMatch = cleanPath.match(/^\/guilds\/(\d+)(.*)$/);
    if (guildMatch) {
      const guildId = guildMatch[1];
      const subPath = guildMatch[2];
      const majorParam = `guild:${guildId}`;

      let routePattern = `${method}:/guilds/:id`;
      if (subPath.startsWith('/channels')) {
        routePattern = `${method}:/guilds/:id/channels`;
      } else if (subPath.startsWith('/members/search')) {
        routePattern = `${method}:/guilds/:id/members/search`;
      } else if (subPath.match(/^\/members\/\d+$/)) {
        routePattern = `${method}:/guilds/:id/members/:id`;
      } else if (subPath.startsWith('/members')) {
        routePattern = `${method}:/guilds/:id/members`;
      }
      return { routeKey: `${routePattern}:${majorParam}`, majorParam };
    }

    // Top-level routes: /users/@me, /users/@me/guilds
    return { routeKey: `${method}:${cleanPath}`, majorParam: 'top_level' };
  }

  /**
   * Executes an HTTP request to the Discord API with rate-limit bucket scheduling
   * scoped to (bucketHash, majorResource), proactive rate limit delay, global 429 locks,
   * and exponential backoff on 5xx.
   *
   * To prevent alias-convergence races where a route learns an already-existing canonical bucket,
   * any queued requests from the temporary bucket are merged directly into the canonical bucket queue.
   */
  public static async request<T = any>(
    path: string,
    botToken: string,
    options: DiscordRequestOptions = {}
  ): Promise<{ data: T; headers: Headers }> {
    const url = path.startsWith('http') ? path : `${DISCORD_API_BASE}${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const { routeKey, majorParam } = this.parseRouteInfo(method, path);

    // Look up canonical bucket identity or temporary route bucket
    const effectiveBucketKey = this.routeToBucketIdentity.get(routeKey) || routeKey;
    const bucket = this.getOrCreateBucket(effectiveBucketKey);

    return bucket.enqueue(async () => {
      return this.executeWithRetry<T>(url, path, botToken, options, routeKey, majorParam);
    });
  }

  private static async executeWithRetry<T>(
    url: string,
    path: string,
    botToken: string,
    options: DiscordRequestOptions,
    routeKey: string,
    majorParam: string
  ): Promise<{ data: T; headers: Headers }> {
    const maxRetries = options.maxRetries ?? 5;
    let attempt = 0;
    const sanitizedToken = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken.trim()}`;

    while (attempt <= maxRetries) {
      attempt++;

      // Wait if a global rate limit is active
      const now = Date.now();
      if (this.globalResetTimestamp > now) {
        const waitMs = this.globalResetTimestamp - now;
        logger.info(`Discord API global rate limit active: waiting ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      // Check active bucket capacity and delay if quota is exhausted
      const activeBucketKey = this.routeToBucketIdentity.get(routeKey) || routeKey;
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
        body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body as BodyInit
      };

      try {
        const res = await fetch(url, fetchOptions);

        const bucketHeader = res.headers.get('X-RateLimit-Bucket');
        const remainingHeader = res.headers.get('X-RateLimit-Remaining');
        const resetAfterHeader = res.headers.get('X-RateLimit-Reset-After');
        const isGlobalHeader = res.headers.get('X-RateLimit-Global') === 'true';

        // When Discord returns a bucket hash, associate route and migrate queued work to the canonical bucket
        if (bucketHeader) {
          const learnedBucketIdentity = `${bucketHeader}:${majorParam}`;
          const currentActiveKey = this.routeToBucketIdentity.get(routeKey) || routeKey;

          if (learnedBucketIdentity !== currentActiveKey) {
            this.routeToBucketIdentity.set(routeKey, learnedBucketIdentity);

            const canonicalBucket = this.getOrCreateBucket(learnedBucketIdentity);
            const temporaryBucket = this.buckets.get(routeKey);

            if (temporaryBucket && temporaryBucket !== canonicalBucket) {
              canonicalBucket.mergeFrom(temporaryBucket);
              this.buckets.delete(routeKey);
            }
          }

          const targetBucket = this.getOrCreateBucket(learnedBucketIdentity);
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
            const rawBody = (await res.json()) as DiscordRateLimitResponse;
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
            const currentActiveKey = this.routeToBucketIdentity.get(routeKey) || routeKey;
            const targetBucket = this.getOrCreateBucket(currentActiveKey);
            targetBucket.remaining = 0;
            targetBucket.resetTimestamp = Date.now() + retryAfterMs;
            logger.warn(`Discord API 429 route rate limit on ${path}: waiting ${retryAfterMs}ms (attempt ${attempt}/${maxRetries})`);
          }

          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
            continue;
          }
          throw new DiscordApiError(`Rate limit exceeded after ${maxRetries} retries`, 429, 429);
        }

        // Handle 5xx Server Errors
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
          let rawBody: unknown = null;
          let discordCode: number | undefined;
          let message = `Discord API returned HTTP ${res.status}`;

          try {
            const parsedBody = (await res.json()) as DiscordErrorResponse;
            if (parsedBody) {
              rawBody = parsedBody;
              discordCode = parsedBody.code;
              message = parsedBody.message || message;
            }
          } catch {
            // Body was not JSON
          }

          throw new DiscordApiError(message, res.status, discordCode, rawBody);
        }

        if (res.status === 204) {
          return { data: null as T, headers: res.headers };
        }

        const data = (await res.json()) as T;
        return { data, headers: res.headers };
      } catch (err: unknown) {
        if (err instanceof DiscordApiError) {
          throw err;
        }

        const errorMessage = err instanceof Error ? err.message : String(err);

        if (attempt <= maxRetries) {
          const backoffMs = 500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
          logger.warn(`Network error requesting ${path}: ${errorMessage}. Retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        throw new DiscordApiError(`Network failure communicating with Discord API: ${errorMessage}`, 0);
      }
    }

    throw new DiscordApiError(`Request failed after ${maxRetries} attempts`, 0);
  }

  /**
   * Evaluates channel permissions following Discord's permission resolution hierarchy:
   * 1. Administrator override grants all permissions unconditionally.
   * 2. Base guild permissions from @everyone and member roles.
   * 3. @everyone channel overwrite.
   * 4. Member role overwrites: role denies apply, then role allows apply.
   * 5. Member-specific user overwrite (deny, then allow).
   * 6. If VIEW_CHANNEL is denied, dependent read history and manage messages capabilities are denied.
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
   * Resets internal rate limit state (used in test fixtures).
   */
  public static resetRateLimits(): void {
    this.globalResetTimestamp = 0;
    this.buckets.clear();
    this.routeToBucketIdentity.clear();
  }
}
