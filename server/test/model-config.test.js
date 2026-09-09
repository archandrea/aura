import { beforeAll, describe, expect, it } from 'vitest'
import { getRequest, registerAndLogin, registerAndLoginAdmin, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

// 创建一个属于指定用户的模型配置，返回其 id
const createModelConfig = async (token, modelName = 'gpt-test') => {
  const res = await request.post('/api/model-config').set(authHeader(token)).send({
    provider: 'openai',
    modelName,
  })
  expect(res.status).toBe(200)
  return res.body.data?.id ?? res.body.data
}

describe('GET /api/model-config/list', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/model-config/list')
    expect(res.status).toBe(401)
  })

  it('列表只能看到自己的配置', async () => {
    // 唯一 modelName，避免历史遗留行干扰断言
    const unique = `alice-model-${Date.now()}`
    const alice = await registerAndLogin()
    await createModelConfig(alice.token, unique)
    const bob = await registerAndLogin()
    const res = await request.get('/api/model-config/list').set(authHeader(bob.token))
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body.data)).not.toContain(unique)
  })
})

describe('模型配置横向越权防护（requireOwnership）', () => {
  it('用户不能查看他人的模型配置', async () => {
    const alice = await registerAndLogin()
    const configId = await createModelConfig(alice.token)
    const bob = await registerAndLogin()
    const res = await request.get(`/api/model-config/${configId}`).set(authHeader(bob.token))
    expect(res.status).toBe(403)
  })

  it('用户不能修改他人的模型配置', async () => {
    const alice = await registerAndLogin()
    const configId = await createModelConfig(alice.token)
    const bob = await registerAndLogin()
    const res = await request.put(`/api/model-config/${configId}`).set(authHeader(bob.token)).send({ modelName: 'hacked' })
    expect(res.status).toBe(403)
  })

  it('用户不能删除他人的模型配置', async () => {
    const alice = await registerAndLogin()
    const configId = await createModelConfig(alice.token)
    const bob = await registerAndLogin()
    const res = await request.delete(`/api/model-config/${configId}`).set(authHeader(bob.token))
    expect(res.status).toBe(403)
  })

  it('super_admin 可以管理任何模型配置', async () => {
    const alice = await registerAndLogin()
    const configId = await createModelConfig(alice.token)
    const root = await registerAndLoginAdmin()
    const res = await request.put(`/api/model-config/${configId}`).set(authHeader(root.token)).send({ modelName: 'admin-model' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })

  it('操作不存在的模型配置应返回 404', async () => {
    const alice = await registerAndLogin()
    const res = await request.put('/api/model-config/999999').set(authHeader(alice.token)).send({ modelName: 'x' })
    expect(res.status).toBe(404)
  })
})
