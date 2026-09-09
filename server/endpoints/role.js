import express from 'express'
import Role from '../models/role.js'
import Rbac from '../models/rbac.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authMiddleware } from '../middlewares/auth.js'
import { loadAuthContext, requirePermission, isSuperAdmin } from '../middlewares/rbac.js'
import Validator from '../../shared/utils/validator.js'
import { BadRequest, NotFound, Conflict, Forbidden } from '../utils/appError.js'

const router = express.Router()

function roleEndpoints(apiRouter) {
  apiRouter.use('/role', asyncHandler(authMiddleware), asyncHandler(loadAuthContext), router)

  // 1. 获取非分页角色列表
  router.get('/list', requirePermission('role:list'), asyncHandler(async (req, res) => {
    const { orderBy, orderDir, ...rest } = req.query
    const data = await Role.findAll({
      filters: rest,
      sort: {
        orderBy,
        orderDir
      }
    })
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 2. 获取分页角色列表
  router.get('/page', requirePermission('role:list'), asyncHandler(async (req, res) => {
    const { page, pageSize, orderBy, orderDir, ...rest } = req.query
    const data = await Role.findAll({
      filters: {
        ...rest,
        createdAt: rest?.createdAt?.split(',') || null,
        updatedAt: rest?.updatedAt?.split(',') || null,
      },
      pagination: {
        page: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 10
      },
      sort: {
        orderBy,
        orderDir
      }
    })
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 3. 获取角色详情
  router.get('/:id', requirePermission('role:list'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const data = await Role.findById(id)
    if (!data) {
      throw NotFound('role not found')
    }
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 4. 创建角色
  router.post('/', requirePermission('role:create'), asyncHandler(async (req, res) => {
    const { name, code, description } = req.body
    if (!name || !code) {
      throw BadRequest('name and code are required')
    }
    if (!Validator.isValidCode(code)) {
      throw BadRequest('code must be 2-64 characters, lowercase letters/digits/underscore, start with a letter')
    }
    if (!Validator.isLength(name, 2, 255)) {
      throw BadRequest('name must be 2-255 characters')
    }
    if (description && !Validator.isLength(description, 0, 255)) {
      throw BadRequest('description must be no more than 255 characters')
    }

    // 检查 code 是否已存在
    const existing = await Role.findByCode(code)
    if (existing) {
      throw Conflict('role code already exists')
    }

    const id = await Role.create({ name, code, description })
    const data = await Role.findById(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 5. 更新角色
  router.put('/:id', requirePermission('role:update'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { name, description } = req.body

    if (!name && description === undefined) {
      throw BadRequest('at least one field (name, description) is required')
    }
    if (name && !Validator.isLength(name, 2, 255)) {
      throw BadRequest('name must be 2-255 characters')
    }
    if (description && !Validator.isLength(description, 0, 255)) {
      throw BadRequest('description must be no more than 255 characters')
    }

    // 检查是否存在
    const existing = await Role.findById(id)
    if (!existing) {
      throw NotFound('role not found')
    }
    if (existing.isSystem) {
      throw BadRequest('system role cannot be modified')
    }

    await Role.update(id, { name, description })
    const data = await Role.findById(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 6. 删除角色
  router.delete('/:id', requirePermission('role:delete'), asyncHandler(async (req, res) => {
    const { id } = req.params

    const existing = await Role.findById(id)
    if (!existing) {
      throw NotFound('role not found')
    }
    if (existing.isSystem) {
      throw BadRequest('system role cannot be deleted')
    }

    // delete 内部会清理 role_menu / user_role 关联
    const data = await Role.delete(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 7. 获取角色关联的菜单 ID 列表
  router.get('/:id/menus', requirePermission('role:list'), asyncHandler(async (req, res) => {
    const { id } = req.params

    const existing = await Role.findById(id)
    if (!existing) {
      throw NotFound('role not found')
    }

    const data = await Rbac.getRoleMenuIds(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 8. 给角色分配菜单/权限（全量替换）
  router.put('/:id/menus', requirePermission('role:assign_permission'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { menuIds } = req.body

    if (!Array.isArray(menuIds)) {
      throw BadRequest('menuIds must be an array')
    }
    if (menuIds.some(menuId => !Validator.isPositiveInt(menuId))) {
      throw BadRequest('menuIds must be an array of positive integers')
    }

    const existing = await Role.findById(id)
    if (!existing) {
      throw NotFound('role not found')
    }

    // ===== 提权防护 =====
    const isSuper = await isSuperAdmin(req.user.id)

    // R2: 系统角色（super_admin/admin/member）的权限仅 super_admin 可改
    if (existing.isSystem && !isSuper) {
      throw Forbidden('only super_admin can modify a system role')
    }

    // R3: 非 super_admin 只能授予自己拥有的菜单/权限，防止向自定义角色自我提权
    if (!isSuper) {
      const ownMenuIds = await Rbac.getUserMenuIds(req.user.id)
      const illegal = menuIds.filter((menuId) => !ownMenuIds.includes(menuId))
      if (illegal.length > 0) {
        throw Forbidden('cannot grant permissions beyond your own')
      }
    }

    await Rbac.assignMenusToRole(id, menuIds)
    res.status(200).json({
      data: true,
      code: 200,
      message: 'success'
    })
  }))
}

export default roleEndpoints
