/**
 * 自定义业务错误类
 * - 区分 HTTP 状态码，替代裸 throw new Error()
 * - 全局错误处理器根据 statusCode 返回对应状态码
 *
 * 用法:
 *   throw new AppError(400, 'name is required')
 *   throw new AppError(404, 'role not found')
 *   throw new AppError(409, 'code already exists')
 */
export class AppError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
  }
}

/**
 * 快捷构造函数
 */
export const BadRequest = (message) => new AppError(400, message)
export const Unauthorized = (message) => new AppError(401, message)
export const Forbidden = (message) => new AppError(403, message)
export const NotFound = (message) => new AppError(404, message)
export const Conflict = (message) => new AppError(409, message)
