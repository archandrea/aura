import express from 'express'
import sql from '../sql/index.js'
import ModelConfig from '../models/model-config.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authMiddleware } from '../middlewares/auth.js'
import { requireOwnership } from '../middlewares/rbac.js'
import Validator from '../../shared/utils/validator.js'
import { BadRequest, NotFound } from '../utils/appError.js'

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'openai-compatible']

const router = express.Router()

function modelConfigEndpoints(apiRouter) {
  apiRouter.use('/model-config', asyncHandler(authMiddleware), router)

  router.get('/list', asyncHandler(async (req, res) => {
    const { orderBy, orderDir, ...rest } = req.query
    const data = await ModelConfig.findAll({
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

  router.get('/group', asyncHandler(async (req, res) => {
    const { orderBy, orderDir } = req.query
    const data = await ModelConfig.findAll({
      user: req.user,
      sort: {
        orderBy,
        orderDir
      }
    })
    const groupedData = data.reduce((acc, item) => {
      const key = item.provider
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(item)
      return acc
    }, {})

    res.status(200).json({
      data: groupedData,
      code: 200,
      message: 'success'
    })
  }))

  router.get('/:id', asyncHandler(requireOwnership({ resource: 'model_config' })), asyncHandler(async (req, res) => {
    const { id } = req.params
    const data = await ModelConfig.findById(id)
    if (!data) {
      throw NotFound('model config not found')
    }
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const { provider, baseUrl, apiKey, modelName, temperature, maxTokens, isActive } = req.body
    if (!provider || !modelName) {
      throw BadRequest('provider and modelName are required')
    }
    if (!Validator.isOneOf(provider, VALID_PROVIDERS)) {
      throw BadRequest(`provider must be one of: ${VALID_PROVIDERS.join(', ')}`)
    }
    if (!Validator.isNonEmptyString(modelName)) {
      throw BadRequest('modelName must be a non-empty string')
    }
    if (baseUrl && !Validator.isUrl(baseUrl)) {
      throw BadRequest('baseUrl must be a valid URL')
    }
    if (temperature !== undefined && !Validator.isInRange(temperature, 0, 2)) {
      throw BadRequest('temperature must be between 0 and 2')
    }
    if (maxTokens !== undefined && !Validator.isPositiveInt(maxTokens)) {
      throw BadRequest('maxTokens must be a positive integer')
    }

    const data = await ModelConfig.create(req.user, { provider, baseUrl, apiKey, modelName, temperature, maxTokens, isActive })
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  router.put('/:id', asyncHandler(requireOwnership({ resource: 'model_config' })), asyncHandler(async (req, res) => {
    const { id } = req.params
    const { provider, baseUrl, apiKey, modelName, temperature, maxTokens, isActive } = req.body

    if (!provider && !baseUrl && apiKey === undefined && !modelName && temperature === undefined && maxTokens === undefined && isActive === undefined) {
      throw BadRequest('at least one field is required')
    }
    if (provider && !Validator.isOneOf(provider, VALID_PROVIDERS)) {
      throw BadRequest(`provider must be one of: ${VALID_PROVIDERS.join(', ')}`)
    }
    if (modelName !== undefined && !Validator.isNonEmptyString(modelName)) {
      throw BadRequest('modelName must be a non-empty string')
    }
    if (baseUrl && !Validator.isUrl(baseUrl)) {
      throw BadRequest('baseUrl must be a valid URL')
    }
    if (temperature !== undefined && !Validator.isInRange(temperature, 0, 2)) {
      throw BadRequest('temperature must be between 0 and 2')
    }
    if (maxTokens !== undefined && !Validator.isPositiveInt(maxTokens)) {
      throw BadRequest('maxTokens must be a positive integer')
    }

    const existing = await ModelConfig.findById(id)
    if (!existing) {
      throw NotFound('model config not found')
    }

    const data = await ModelConfig.update(id, { provider, baseUrl, apiKey, modelName, temperature, maxTokens, isActive })
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))

  router.delete('/:id', asyncHandler(requireOwnership({ resource: 'model_config' })), asyncHandler(async (req, res) => {
    const { id } = req.params
    const existing = await ModelConfig.findById(id)
    if (!existing) {
      throw NotFound('model config not found')
    }
    const data = await ModelConfig.delete(id)
    res.status(200).json({
      data,
      code: 200,
      message: 'success'
    })
  }))
}

export default modelConfigEndpoints
