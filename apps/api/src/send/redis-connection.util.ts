import type { ConnectionOptions } from 'bullmq';

/**
 * Builds a BullMQ connection options object from a redis:// URL without
 * depending on our own `ioredis` install — BullMQ constructs its client
 * from these options using its own bundled ioredis, so passing an instance
 * we constructed ourselves would risk a duplicate-package type/version clash.
 */
export function parseRedisConnectionOptions(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db:
      parsed.pathname && parsed.pathname !== '/'
        ? Number(parsed.pathname.slice(1))
        : undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
