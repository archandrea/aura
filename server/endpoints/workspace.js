import express from 'express'
import sql from '../sql/index.js'
import Workspace from '../models/workspace.js'
import ModelConfig from '../models/model-config.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authMiddleware } from '../middlewares/auth.js'
import { requireOwnership } from '../middlewares/rbac.js'
import Validator from '../../shared/utils/validator.js'
import { BadRequest, NotFound, Forbidden } from '../utils/appError.js'

const router = express.Router()

function workspaceEndpoints(apiRouter) {
  apiRouter.use('/workspace', asyncHandler(authMiddleware), router)

  router.get('/list', asyncHandler(async (req, res) => {
    const { page, pageSize, orderBy, orderDir, ...rest } = req.query
    const data = await Workspace.findWithDetails({
      user: req.user,
      filters: {
        ...rest,
        createdAt: rest?.createdAt?.split(',') || null,
        updatedAt: rest?.updatedAt?.split(',') || null,
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

  router.post('/', asyncHandler(async (req, res) => {
    const { title, modelId } = req.body
    if (!title) {
      throw BadRequest('title is required')
    }
    if (!Validator.isLength(title, 1, 255)) {
      throw BadRequest('title must be 1-255 characters')
    }
    if (modelId && !Validator.isPositiveInt(modelId)) {
      throw BadRequest('modelId must be a positive integer')
    }

    // 挂载校验：配置必须属于创建者
    if (modelId) {
      const modelConfig = await ModelConfig.findById(modelId)
      if (!modelConfig) {
        throw NotFound('model config not found')
      }
      if (modelConfig.userId !== req.user.id) {
        throw Forbidden('model config does not belong to you')
      }
    }

    const id = await Workspace.create(req.user, { title, modelId })
    const data = await Workspace.findById(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  router.put('/:id', asyncHandler(requireOwnership({ resource: 'workspace' })), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { title, modelId } = req.body

    if (!title && !modelId) {
      throw BadRequest('at least one field (title, modelId) is required')
    }
    if (title && !Validator.isLength(title, 1, 255)) {
      throw BadRequest('title must be 1-255 characters')
    }
    if (modelId && !Validator.isPositiveInt(modelId)) {
      throw BadRequest('modelId must be a positive integer')
    }

    const existing = await Workspace.findById(id)
    if (!existing) {
      throw NotFound('workspace not found')
    }

    // modelId 挂载校验：配置必须属于工作区属主（唯一校验点，chat 只读工作区挂载的配置）
    // 校验对象是属主而非操作者，防止 super_admin 代管时把自己的配置挂进他人工作区
    if (modelId) {
      const modelConfig = await ModelConfig.findById(modelId)
      if (!modelConfig) {
        throw NotFound('model config not found')
      }
      if (modelConfig.userId !== existing.userId) {
        throw Forbidden('model config does not belong to the workspace owner')
      }
    }

    const data = await Workspace.update(id, { title, modelId })
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  router.delete('/:id', asyncHandler(requireOwnership({ resource: 'workspace' })), asyncHandler(async (req, res) => {
    const { id } = req.params
    const existing = await Workspace.findById(id)
    if (!existing) {
      throw NotFound('workspace not found')
    }
    const data = await Workspace.delete(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))
}

export default workspaceEndpoints
