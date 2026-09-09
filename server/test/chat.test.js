import { beforeAll, describe, expect, it } from 'vitest'
import { getRequest, registerAndLogin, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

const createWorkspace = async (token, title) => {
  const res = await request.post('/api/workspace').set(authHeader(token)).send({ title })
  expect(res.status).toBe(200)
  return res.body.data.id
}

const createModelConfig = async (token) => {
  const res = await request.post('/api/model-config').set(authHeader(token)).send({
    provider: 'openai',
    modelName: 'gpt-4o-mini',
  })
  expect(res.status).toBe(200)
  return res.body.data?.id ?? res.body.data
}

describe('对话横向越权防护', () => {
  it('不能向他人的工作区发消息', async () => {
    const alice = await registerAndLogin()
    const workspaceId = await createWorkspace(alice.token, 'alice ws')
    const bob = await registerAndLogin()
    const res = await request.post(`/api/chat/${workspaceId}`).set(authHeader(bob.token)).send({ content: 'hi' })
    expect(res.status).toBe(403)
  })

  it('不能把工作区的模型挂成他人的配置（E1）', async () => {
    const alice = await registerAndLogin()
    const workspaceId = await createWorkspace(alice.token, 'alice ws 2')
    const bob = await registerAndLogin()
    const modelId = await createModelConfig(bob.token)
    const res = await request.put(`/api/workspace/${workspaceId}`).set(authHeader(alice.token)).send({ modelId })
    expect(res.status).toBe(403)
  })

  it('chat 请求体里的 modelId 被忽略（E2）', async () => {
    const alice = await registerAndLogin()
    // 工作区未挂载任何模型
    const workspaceId = await createWorkspace(alice.token, 'alice ws 3')
    // 若 body.modelId 未被忽略，这里会尝试用该模型；被忽略则因工作区无模型返回 400
    const res = await request.post(`/api/chat/${workspaceId}`).set(authHeader(alice.token)).send({
      content: 'hi', modelId: 999999, stream: false,
    })
    expect(res.status).toBe(400)
  })
})
