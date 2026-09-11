/**
 * 对话 happy-path 冒烟测试
 * 用 MockLanguageModelV3 替换真实模型，验证「发消息 → 模型回复 → 双方消息落库」主链路。
 * 任何 chat.js 主流程的回归（如 ReferenceError、消息构造错误）都应先在这里变红。
 */
import { vi, beforeAll, describe, expect, it } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'

// vi.mock 会被提升到文件顶部；app.js 在 helpers.getApp() 里懒加载，
// 所以 chat.js 拿到的 createModelInstance 一定是这里的假模型
vi.mock('../utils/model-factory.js', () => ({
  createModelInstance: () =>
    new MockLanguageModelV3({
      doGenerate: {
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10 },
        content: [{ type: 'text', text: 'mocked reply' }],
      },
    }),
}))

import { getRequest, registerAndLogin, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

describe('对话 happy path', () => {
  it('发消息后返回模型回复，用户/助手消息均落库', async () => {
    const user = await registerAndLogin()

    const modelRes = await request.post('/api/model-config').set(authHeader(user.token)).send({
      provider: 'openai',
      modelName: 'gpt-4o-mini',
    })
    expect(modelRes.status).toBe(200)
    const modelId = modelRes.body.data?.id ?? modelRes.body.data

    // 创建时直接挂载模型（挂载校验要求配置属于创建者）
    const wsRes = await request.post('/api/workspace').set(authHeader(user.token)).send({
      title: 'happy path ws',
      modelId,
    })
    expect(wsRes.status).toBe(200)
    const workspaceId = wsRes.body.data.id

    const chatRes = await request
      .post(`/api/chat/${workspaceId}`)
      .set(authHeader(user.token))
      .send({ content: 'hi', stream: false })

    expect(chatRes.status).toBe(200)
    expect(chatRes.body.data).toBe('mocked reply')

    const listRes = await request
      .get(`/api/chat/list/${workspaceId}`)
      .set(authHeader(user.token))
    expect(listRes.status).toBe(200)

    // list 端点不传分页参数，data 直接是消息数组
    const messages = listRes.body.data
    const proposers = messages.map((row) => row.proposer)
    expect(proposers).toContain('user')
    expect(proposers).toContain('assistant')

    // 用户消息落库时应带上本次使用的模型配置 id
    const userRow = messages.find((row) => row.proposer === 'user')
    expect(userRow.modelId).toBe(modelId)
  })
})
