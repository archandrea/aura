import express from 'express'
import sql from '../sql/index.js'
import Chat from '../models/chat.js'
import ModelConfig from '../models/model-config.js'
import Workspace from '../models/workspace.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { authMiddleware } from '../middlewares/auth.js'
import { requireOwnership } from '../middlewares/rbac.js'
import { createModelInstance } from '../utils/model-factory.js'
import { generateText, streamText } from 'ai'
import Validator from '../../shared/utils/validator.js'
import { BadRequest, NotFound } from '../utils/appError.js'

const router = express.Router()

function chatEndpoints(apiRouter) {
  apiRouter.use('/chat', asyncHandler(authMiddleware), router)

  router.get('/list/:workspaceId', asyncHandler(requireOwnership({ resource: 'chat_workspace', idFrom: 'params.workspaceId' })), asyncHandler(async (req, res) => {
    const { workspaceId } = req.params
    const { page, pageSize, orderBy, orderDir, ...rest } = req.query
    const data = await Chat.findByWorkspaceId(
      workspaceId,
      {
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

  router.post('/:workspaceId', asyncHandler(requireOwnership({ resource: 'chat_workspace', idFrom: 'params.workspaceId' })), asyncHandler(async (req, res) => {
    const { workspaceId } = req.params
    const { content, stream = true, think = true } = req.body

    if (!content) {
      throw BadRequest('content is required')
    }
    if (!Validator.isNonEmptyString(content)) {
      throw BadRequest('content cannot be empty')
    }

    // 模型固定取工作区挂载的配置（requireOwnership 已确保工作区存在且属于当前用户，
    // 配置归属在挂载时已校验，见 workspace PUT），请求体传入的任何 modelId 一律忽略
    const workspace = await Workspace.findById(workspaceId)
    if (!workspace.modelId) {
      throw BadRequest('no model configured for this workspace, please set a model first')
    }

    const modelConfig = await ModelConfig.findById(workspace.modelId)
    if (!modelConfig) {
      throw NotFound('model config not found')
    }

    await Chat.create({
      workspaceId,
      modelId,
      content,
      proposer: 'user'
    })

    const { rows } = await Chat.findByWorkspaceId(
      workspaceId,
      {
        filters: {
        },
        pagination: {
          page: 1,
          pageSize: 20
        },
        sort: {
          orderBy: 'created_at',
          orderDir: 'asc'
        }
      })

    const messages = [...rows, { workspaceId, content, proposer: 'user' }].map(item => {
      return {
        role: item.proposer,
        content: item.content
      }
    })

    const model = createModelInstance(modelConfig)

    if (!stream) {
      const result = await generateText({
        model,
        prompt: messages,
      });
      await Chat.create({ workspaceId, content: result.text, proposer: 'assistant' })
      res.status(200).json({
        data: result.text,
        code: 200,
        message: 'success'
      })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const result = streamText({
      model,
      prompt: messages,
    });
    let data = ''
    for await (const textPart of result.textStream) {
      data += textPart
      res.write(textPart)
    }
    await Chat.create({ workspaceId, content: data, proposer: 'assistant' })
    res.end()
  }))
}

export default chatEndpoints
