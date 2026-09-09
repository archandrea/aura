/**
 * 通用校验工具类
 *
 * 设计原则：
 * - 静态方法，无副作用，纯函数
 * - 只做格式校验，不做业务校验（唯一性、存在性等由 model 层负责）
 * - 返回 boolean，不抛错（抛错由 endpoint 层负责）
 */
class Validator {
  // ==================== 用户相关 ====================

  /**
   * 用户名：4-16位，字母数字下划线连字符
   */
  static isValidName(val) {
    if (typeof val !== 'string') return false
    return /^[a-zA-Z0-9_-]{4,16}$/.test(val)
  }

  /**
   * 邮箱格式
   */
  static isEmail(val) {
    if (typeof val !== 'string') return false
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
  }

  /**
   * 强密码：至少8位，包含字母、数字和特殊字符(-_)
   */
  static isStrongPassword(val) {
    if (typeof val !== 'string') return false
    return /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[-_])[A-Za-z\d-_]{8,}$/.test(val)
  }

  // ==================== 通用标识符 ====================

  /**
   * 业务编码（role.code, menu.code 等）
   * 2-64位，小写字母数字下划线，以字母开头
   */
  static isValidCode(val) {
    if (typeof val !== 'string') return false
    return /^[a-z][a-z0-9_]{1,63}$/.test(val)
  }

  /**
   * 权限标识（menu.permission，如 user:create、user:assign_role）
   * 冒号分段（至少两段），每段 2-64 位小写字母数字下划线，以字母开头
   */
  static isValidPermissionCode(val) {
    if (typeof val !== 'string') return false
    return /^[a-z][a-z0-9_]{1,63}(?::[a-z][a-z0-9_]{1,63})+$/.test(val)
  }

  // ==================== 字符串通用 ====================

  /**
   * 非空字符串
   */
  static isNonEmptyString(val) {
    return typeof val === 'string' && val.trim().length > 0
  }

  /**
   * 字符串长度范围校验
   */
  static isLength(val, min, max) {
    if (typeof val !== 'string') return false
    return val.length >= min && val.length <= max
  }

  // ==================== 数字相关 ====================

  /**
   * 正整数
   */
  static isPositiveInt(val) {
    if (typeof val === 'string') val = Number(val)
    return Number.isInteger(val) && val > 0
  }

  /**
   * 数字范围校验（含边界）
   */
  static isInRange(val, min, max) {
    const num = Number(val)
    return !isNaN(num) && num >= min && num <= max
  }

  // ==================== URL ====================

  /**
   * URL 格式（宽松校验，允许 http/https）
   */
  static isUrl(val) {
    if (typeof val !== 'string') return false
    try {
      const url = new URL(val)
      return ['http:', 'https:'].includes(url.protocol)
    } catch {
      return false
    }
  }

  // ==================== 枚举 ====================

  /**
   * 是否属于指定枚举值集合
   */
  static isOneOf(val, allowed) {
    return allowed.includes(val)
  }
}

export default Validator
