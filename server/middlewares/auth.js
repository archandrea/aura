import jwt from 'jsonwebtoken'
import { cacheGet } from '../utils/redis.js'

export const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: 'Unauthorized request'
    })
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({
        code: 401,
        message: err.message || 'Unauthorized request'
      })
    }
    const blacklisted = await cacheGet(`jwt:blacklist:${decoded.jti}`)
    if (blacklisted) {
      return res.status(401).json({ code: 401, message: 'token invalidated' })
    }
    req.user = decoded
    next()
  })
}