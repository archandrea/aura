import db from '../sql/index.js'
import Rbac from '../models/rbac.js'
import { Unauthorized, Forbidden, NotFound } from '../utils/appError.js'

/**
 * 加载当前用户的角色与权限上下文 → 挂载到 req.auth
 * 必须在 authMiddleware 之后使用
 */
export const loadAuthContext = async (req, res, next) => {
  const userId = req.user?.id
  if (!userId) {
    throw Unauthorized('no user session found')
  }

  const roles = await Rbac.getUserRoles(userId)
  const permissions = await Rbac.getUserPermissions(userId)
  req.auth = { roles, permissions }
  next()
}

/**
 * 功能级权限拦截中间件
 * @param {string} permissionCode 权限码，如 'user:create'
 *
 * 使用方式：router.post('/', requirePermission('user:create'), handler)
 */
export const requirePermission = (permissionCode) => {
  return (req, res, next) => {
    const { roles = [], permissions = [] } = req.auth || {}

    // super_admin 全局放行，防止配置错误锁死系统
    if (roles.includes('super_admin')) {
      return next()
    }

    if (permissions.includes(permissionCode)) {
      return next()
    }

    throw Forbidden(`missing permission [${permissionCode}]`)
  }
}

/**
 * 资源属主放行 + 权限拦截
 * 目标资源属于当前用户时放行（自助操作），否则要求指定权限（管理操作）
 *
 * 使用方式：router.put('/:id', requireSelfOrPermission('user:update'), handler)
 */
export const requireSelfOrPermission = (permissionCode, idFrom = 'params.id') => {
  return (req, res, next) => {
    let resourceId = req
    for (const part of idFrom.split('.')) {
      resourceId = resourceId?.[part]
    }

    if (resourceId && Number(resourceId) === req.user?.id) {
      return next()
    }

    return requirePermission(permissionCode)(req, res, next)
  }
}

/**
 * 判断指定用户是否为 super_admin（高危操作的提权防护用）
 */
export const isSuperAdmin = async (userId) => {
  if (!userId) return false
  const roles = await Rbac.getUserRoles(userId)
  return roles.includes('super_admin')
}

/**
 * 资源归属校验中间件（防横向越权）
 * @param {string} resource 资源类型：note | workspace | model_config | chat | chat_workspace
 * @param {string} idFrom 资源 ID 来源，如 'params.id'、'params.workspaceId'
 */
const RESOURCE_SQL = {
  note: 'SELECT user_id FROM note WHERE id = ?',
  workspace: 'SELECT user_id FROM workspace WHERE id = ?',
  model_config: 'SELECT user_id FROM model_config WHERE id = ?',
  // chat 无 user_id，隶属 workspace，校验其所属 workspace 的属主
  chat: `
    SELECT w.user_id
    FROM chat c
    JOIN workspace w ON c.workspace_id = w.id
    WHERE c.id = ?
  `,
  chat_workspace: 'SELECT user_id FROM workspace WHERE id = ?'
}

export const requireOwnership = ({ resource, idFrom = 'params.id' }) => {
  const sqlQuery = RESOURCE_SQL[resource]
  if (!sqlQuery) {
    throw new Error(`unsupported resource check: ${resource}`)
  }

  return async (req, res, next) => {
    const userId = req.user?.id
    if (!userId) {
      throw Unauthorized('no user session found')
    }

    let resourceId = req
    for (const part of idFrom.split('.')) {
      resourceId = resourceId?.[part]
    }
    if (!resourceId) {
      throw new Error(`missing resource ID from ${idFrom}`)
    }

    const [rows] = await db.query(sqlQuery, [resourceId])
    if (rows.length === 0) {
      throw NotFound('resource not found')
    }

    if (rows[0].user_id === userId) {
      return next()
    }

    // 非属主时才查角色（属主路径零额外查询，且不依赖 loadAuthContext）
    if (req.auth?.roles?.includes('super_admin')) {
      return next()
    }
    const roles = await Rbac.getUserRoles(userId)
    if (roles.includes('super_admin')) {
      return next()
    }

    throw Forbidden('you do not own this resource')
  }
}
