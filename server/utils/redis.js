import Redis from 'ioredis'
import { logger } from './logger.js'

const enabled = process.env.REDIS_ENABLED !== 'false'

const redis = enabled
  ? new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    // lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 2000), // 断线后自动重连，间隔递增，最长 2 秒
    keyPrefix: 'aura:',
  })
  : null

redis?.on('error', (err) => {
  logger.warn(`[redis] connection error: ${err.message}`)
})

export async function cacheGet(key) {
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    return raw && JSON.parse(raw)
  } catch (err) {
    logger.warn(`[redis] GET ${key} failed: ${err.message}`)
    return null
  }
}

export async function cacheSet(key, value, ttl) {
  if (!redis) return null
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl)
  } catch (err) {
    logger.warn(`[redis] SET ${key} failed: ${err.message}`)
  }
}

export async function cacheDel(...keys) {
  if (!redis || keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch (err) {
    logger.warn(`[redis] DEL ${keys.join(',')} failed: ${err.message}`)
  }
}

export default redis