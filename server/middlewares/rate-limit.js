import redis from '../utils/redis.js'
import { logger } from '../utils/logger.js'

/**
 * 固定窗口限流。
 * 挂在 authMiddleware 之后按用户限流；挂在登录等未认证端点时自动退化为按 IP 限流
 * （反代后需 app.set('trust proxy', ...) 才能拿到真实客户端 IP）。
 * @param {object} opts
 * @param {string} opts.prefix   计数 key 的业务前缀，如 'chat'、'login'
 * @param {number} opts.windowSeconds 窗口长度（秒）
 * @param {number} opts.max      窗口内最大次数
 */
const rateLimit = ({ prefix, windowSeconds, max }) => {
  return async (req, res, next) => {
    if (!redis) return next()

    const scope = req.user?.id != null ? 'user' : 'ip'
    const identity = scope === 'user' ? req.user.id : req.ip
    const key = `limit:${prefix}:${scope}:${identity}`
    try {
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, windowSeconds)
      } else if (await redis.ttl(key) === -1) {
        await redis.expire(key, windowSeconds)
      }
      if (count > max) {
        const retryAfter = await redis.ttl(key)
        res.set('Retry-After', String(Math.max(retryAfter, 1)))
        return res.status(429).json({
          code: 429,
          message: `rate limit exceeded, retry after ${retryAfter}s`,
        })
      }
      next()
    } catch (err) {
      logger.warn(`[rate-limit] redis unavailable, request allowed: ${err.message}`)
      next()
    }
  }
}

export default rateLimit