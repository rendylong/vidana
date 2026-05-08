import Redis, { type RedisOptions } from 'ioredis'

let redis: Redis | null = null
let blockingRedis: Redis | null = null

export type RedisClientMode = 'default' | 'blocking'

export function redisUrl(): string {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379'
}

export function redisOptionsForMode(mode: RedisClientMode): RedisOptions {
  if (mode === 'blocking') {
    return {
      maxRetriesPerRequest: null,
      connectTimeout: 10_000,
      retryStrategy: attempts => Math.min(attempts * 500, 5_000),
    }
  }

  return {
    maxRetriesPerRequest: 1,
    commandTimeout: 5_000,
    connectTimeout: 5_000,
    retryStrategy: attempts => (attempts > 2 ? null : Math.min(attempts * 200, 1_000)),
  }
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisUrl(), redisOptionsForMode('default'))
  }
  return redis
}

export function getBlockingRedis(): Redis {
  if (!blockingRedis) {
    blockingRedis = new Redis(redisUrl(), redisOptionsForMode('blocking'))
  }
  return blockingRedis
}
