import express from 'express'
import sql from '../sql/index.js'
import User from '../models/user.js'
import Role from '../models/role.js'
import Rbac from '../models/rbac.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import Validator from '../../shared/utils/validator.js'
import { AppError, BadRequest, NotFound, Conflict, Forbidden } from '../utils/appError.js'
import { comparePassword } from '../utils/bcrypt.js'
import jwt from 'jsonwebtoken'
import { authMiddleware } from '../middlewares/auth.js'
import { loadAuthContext, requirePermission, requireSelfOrPermission, isSuperAdmin } from '../middlewares/rbac.js'
import { toTree } from '../../shared/utils/formatter.js'

const router = express.Router()

// 需要登录且加载权限上下文的公共中间件链（register/login 保持公开）
const withAuthContext = [asyncHandler(authMiddleware), asyncHandler(loadAuthContext)]

function userEndpoints(apiRouter) {
  apiRouter.use('/user', router)

  router.get('/list', ...withAuthContext, requirePermission('user:list'), asyncHandler(async (req, res) => {
    const { page, pageSize, orderBy, orderDir, ...rest } = req.query
    const data = await User.findAll({
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

  router.get('/page', ...withAuthContext, requirePermission('user:list'), asyncHandler(async (req, res) => {
    const { page, pageSize, orderBy, orderDir, ...rest } = req.query
    const data = await User.findAll({
      filters: {
        ...rest,
        createdAt: rest?.createdAt?.split(',') || null,
        updatedAt: rest?.updatedAt?.split(',') || null,
      },
      pagination: {
        page,
        pageSize
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

  // 当前用户 Profile（含角色/权限/菜单树，登录即可访问，须注册在 /:id 之前）
  router.get('/profile', ...withAuthContext, asyncHandler(async (req, res) => {
    const userId = req.user.id
    const user = await User.findById(userId)
    if (!user) {
      throw NotFound('user not found')
    }

    const roles = await Rbac.getUserRoles(userId)
    const permissions = await Rbac.getUserPermissions(userId)
    const menus = toTree(await Rbac.getUserMenus(userId))

    res.status(200).json({
      data: {
        ...user,
        roles,
        permissions,
        menus
      },
      code: 200,
      message: 'success'
    })
  }))

  router.get('/:id', ...withAuthContext, requireSelfOrPermission('user:read'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const data = await User.findById(id)
    if (!data) {
      throw NotFound('user not found')
    }
    // 附带角色 ID 列表，供管理后台「分配角色」回显
    const roleIds = await Rbac.getUserRoleIds(id)
    res.status(200).json({
      data: { ...data, roleIds },
      code: 200,
      message: 'success'
    })
  }))

  router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      throw BadRequest('name, email and password are required')
    }
    if (!Validator.isValidName(name)) {
      throw BadRequest('name must be 4-16 characters (letters, digits, _ or -)')
    }
    if (!Validator.isEmail(email)) {
      throw BadRequest('invalid email format')
    }
    if (!Validator.isStrongPassword(password)) {
      throw BadRequest('password must be at least 8 characters with letters, digits and special chars (-_)')
    }
    const existing = await User.findByEmail(email)
    if (existing) {
      throw Conflict('email already registered')
    }
    const existingName = await User.findByName(name)
    if (existingName) {
      throw Conflict('name already registered')
    }
    const data = await User.create({ name, email, password })
    res.status(200).json({
      data,
      code: 200,
      message: 'success',
    })
  }))

  router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      throw BadRequest('email and password are required')
    }
    if (!Validator.isEmail(email)) {
      throw BadRequest('invalid email format')
    }
    const data = await User.findByEmail(email)
    if (!data) {
      throw NotFound('user not found')
    }
    const isMatch = await comparePassword(password, data.password)
    if (!isMatch) {
      throw BadRequest('password is incorrect')
    }
    const { id, name } = data
    const token = jwt.sign({ id, name, email }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '3 days'
    })

    res.status(200).json({
      data: {
        id,
        name,
        email,
        token
      },
      code: 200,
      message: 'success',
    })
  }))

  // 更新用户：本人可自助修改，修改他人需要 user:update 权限
  router.put('/:id', ...withAuthContext, requireSelfOrPermission('user:update'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { name, email, password } = req.body

    // 至少传一个字段
    if (!name && !email && !password) {
      throw BadRequest('at least one field (name, email, password) is required')
    }
    if (name && !Validator.isValidName(name)) {
      throw BadRequest('name must be 4-16 characters (letters, digits, _ or -)')
    }
    if (email && !Validator.isEmail(email)) {
      throw BadRequest('invalid email format')
    }
    if (password && !Validator.isStrongPassword(password)) {
      throw BadRequest('password must be at least 8 characters with letters, digits and special chars (-_)')
    }

    const existing = await User.findById(id)
    if (!existing) {
      throw NotFound('user not found')
    }
    if (email && email !== existing.email) {
      const emailTaken = await User.findByEmail(email)
      if (emailTaken) {
        throw Conflict('email already in use')
      }
    }

    const data = await User.update(id, { name, email, password })
    res.status(200).json({
      data,
      code: 200,
      message: 'success',
    })
  }))

  // 删除用户（仅管理员）
  router.delete('/:id', ...withAuthContext, requirePermission('user:delete'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const existing = await User.findById(id)
    if (!existing) {
      throw NotFound('user not found')
    }
    // 提权防护 R4：super_admin 用户仅 super_admin 可删
    const targetRoles = await Rbac.getUserRoles(id)
    if (targetRoles.includes('super_admin') && !(await isSuperAdmin(req.user.id))) {
      throw Forbidden('only super_admin can delete a super_admin user')
    }
    const data = await User.delete(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 给用户分配角色（全量替换，仅管理员）
  router.put('/:id/roles', ...withAuthContext, requirePermission('user:assign_role'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { roleIds } = req.body

    if (!Array.isArray(roleIds)) {
      throw BadRequest('roleIds must be an array')
    }
    if (roleIds.some(roleId => !Validator.isPositiveInt(roleId))) {
      throw BadRequest('roleIds must be an array of positive integers')
    }

    const existing = await User.findById(id)
    if (!existing) {
      throw NotFound('user not found')
    }

    for (const roleId of roleIds) {
      const role = await Role.findById(roleId)
      if (!role) {
        throw BadRequest(`role ${roleId} not found`)
      }
    }

    // 提权防护 R1：super_admin 角色只能由 super_admin 分配，防止 admin 自我提权
    const superAdminRole = await Role.findByCode('super_admin')
    if (superAdminRole && roleIds.includes(superAdminRole.id) && !(await isSuperAdmin(req.user.id))) {
      throw Forbidden('only super_admin can assign the super_admin role')
    }

    await Rbac.assignRolesToUser(id, roleIds)
    res.status(200).json({
      data: true,
      code: 200,
      message: 'success'
    })
  }))
}

export default userEndpoints
