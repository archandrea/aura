import express from 'express'
import Menu from '../models/menu.js'
import Rbac from '../models/rbac.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { toTree } from '../../shared/utils/formatter.js'
import { authMiddleware } from '../middlewares/auth.js'
import { loadAuthContext, requirePermission } from '../middlewares/rbac.js'
import Validator from '../../shared/utils/validator.js'
import { BadRequest, NotFound, Conflict } from '../utils/appError.js'

const VALID_MENU_TYPES = ['directory', 'menu', 'button']

const router = express.Router()

function menuEndpoints(apiRouter) {
  apiRouter.use('/menu', asyncHandler(authMiddleware), asyncHandler(loadAuthContext), router)

  // 1. 获取菜单平铺列表
  router.get('/list', requirePermission('menu:list'), asyncHandler(async (req, res) => {
    const data = await Menu.findAll({
      ...req.query
    })
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 2. 获取菜单树
  router.get('/tree', requirePermission('menu:list'), asyncHandler(async (req, res) => {
    const data = await Menu.findAll({
      ...req.query
    })
    const tree = toTree(data)
    res.status(200).json({
      data: tree,
      code: 200,
      message: 'success'
    })
  }))

  // 3. 创建菜单/权限
  router.post('/', requirePermission('menu:create'), asyncHandler(async (req, res) => {
    const { parentId, name, code, permission, path, icon, sortOrder, type, visible, status } = req.body

    if (!name || !code) {
      throw BadRequest('name and code are required')
    }
    if (!Validator.isValidCode(code)) {
      throw BadRequest('code must be 2-64 characters, lowercase letters/digits/underscore, start with a letter')
    }
    if (!Validator.isLength(name, 1, 100)) {
      throw BadRequest('name must be 1-100 characters')
    }
    if (parentId && !Validator.isPositiveInt(parentId)) {
      throw BadRequest('parentId must be a positive integer')
    }
    if (type && !Validator.isOneOf(type, VALID_MENU_TYPES)) {
      throw BadRequest(`type must be one of: ${VALID_MENU_TYPES.join(', ')}`)
    }
    if (permission && !Validator.isValidPermissionCode(permission)) {
      throw BadRequest('permission must be colon-separated segments (e.g. user:create), lowercase letters/digits/underscore')
    }

    const existing = await Menu.findByCode(code)
    if (existing) {
      throw Conflict('menu code already exists')
    }

    const id = await Menu.create({ parentId, name, code, permission, path, icon, sortOrder, type, visible, status })
    const data = await Menu.findById(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 4. 更新菜单/权限
  router.put('/:id', requirePermission('menu:update'), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { parentId, name, code, permission, path, icon, sortOrder, type, visible, status } = req.body

    const existing = await Menu.findById(id)
    if (!existing) {
      throw NotFound('menu not found')
    }

    // code 格式校验（传了才校验）
    if (code && !Validator.isValidCode(code)) {
      throw BadRequest('code must be 2-64 characters, lowercase letters/digits/underscore, start with a letter')
    }
    if (name !== undefined && !Validator.isLength(name, 1, 100)) {
      throw BadRequest('name must be 1-100 characters')
    }
    if (parentId && !Validator.isPositiveInt(parentId)) {
      throw BadRequest('parentId must be a positive integer')
    }
    if (type && !Validator.isOneOf(type, VALID_MENU_TYPES)) {
      throw BadRequest(`type must be one of: ${VALID_MENU_TYPES.join(', ')}`)
    }
    if (permission && !Validator.isValidPermissionCode(permission)) {
      throw BadRequest('permission must be colon-separated segments (e.g. user:create), lowercase letters/digits/underscore')
    }

    // code 唯一性校验（排除自身）
    if (code && code !== existing.code) {
      const existingByCode = await Menu.findByCode(code)
      if (existingByCode) {
        throw Conflict('menu code already exists')
      }
    }

    await Menu.update(id, { parentId, name, code, permission, path, icon, sortOrder, type, visible, status })
    const data = await Menu.findById(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  // 5. 删除菜单/权限
  router.delete('/:id', requirePermission('menu:delete'), asyncHandler(async (req, res) => {
    const { id } = req.params

    const existing = await Menu.findById(id)
    if (!existing) {
      throw NotFound('menu not found')
    }

    const existingSubMenu = await Menu.findAll({
      parentId: id
    })
    if (existingSubMenu.length) {
      throw BadRequest('menu has sub menu, cannot delete')
    }

    const data = await Menu.delete(id)
    // 同步清理 role_menu 中的引用
    await Rbac.cleanMenuRelations(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))
}

export default menuEndpoints
