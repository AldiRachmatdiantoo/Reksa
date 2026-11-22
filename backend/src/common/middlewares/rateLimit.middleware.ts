import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { AppError, TooManyRequestsError } from '../errors/AppError.js';

export type RateLimitOptions = {
  redis: Redis;
  /** Unique name per limiter, e.g. "auth:login". */
  name: string;
  limit: number;
  windowMs: number;
  /** Defaults to the client IP (req.ip, trusted from the single Nginx proxy). */
  key?: (req: Request) => string;
  /** Lewati limiter ini untuk request tertentu (tidak dihitung sama sekali). */
  skip?: (req: Request) => boolean;
};

/**
 * Redis sliding-window log (PRD §9.1). Each request is a member of a sorted set
 * scored by timestamp; entries older than the window are dropped atomically.
 * Rejected requests are counted too, so hammering keeps the client blocked.
 *
 * Fails closed: if Redis is unreachable the request gets 503 instead of
 * silently bypassing the limit on sensitive endpoints such as login.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const keyOf = options.key ?? ((req: Request) => req.ip ?? 'unknown');

  return async (req, res, next) => {
    if (options.skip?.(req)) {
      next();
      return;
    }
    const now = Date.now();
    const redisKey = `rl:${options.name}:${keyOf(req)}`;

    let count: number;
    let oldestScore: number | undefined;
    try {
      const results = await options.redis
        .multi()
        .zremrangebyscore(redisKey, 0, now - options.windowMs)
        .zadd(redisKey, now, `${now}:${randomUUID()}`)
        .zcard(redisKey)
        .zrange(redisKey, 0, 0, 'WITHSCORES')
        .pexpire(redisKey, options.windowMs)
        .exec();
      if (!results) throw new Error('Redis transaction aborted');
      const [, , cardResult, oldestResult] = results;
      if (cardResult?.[0] || oldestResult?.[0]) throw cardResult?.[0] ?? oldestResult?.[0];
      count = Number(cardResult?.[1]);
      const oldest = oldestResult?.[1] as string[] | undefined;
      oldestScore = oldest?.[1] !== undefined ? Number(oldest[1]) : undefined;
    } catch (err) {
      req.log?.error({ err, limiter: options.name }, 'Rate limiter unavailable');
      next(new AppError(503, 'SERVICE_UNAVAILABLE', 'Layanan sedang tidak tersedia, coba lagi nanti'));
      return;
    }

    const remaining = Math.max(0, options.limit - count);
    res.setHeader('RateLimit-Limit', String(options.limit));
    res.setHeader('RateLimit-Remaining', String(remaining));

    if (count > options.limit) {
      const resetMs = oldestScore !== undefined ? oldestScore + options.windowMs - now : options.windowMs;
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(resetMs / 1000))));
      next(new TooManyRequestsError());
      return;
    }
    next();
  };
}
