import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getRequest, registerAndLogin, registerAndLoginAdmin, authHeader, cleanTable } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

// 创建一个属于指定用户的模型配置，返回其 id
const createModelConfig = async (token) => {
  const res = await request
    .post('/api/model-config')
    .set(authHeader(token))
    .send({ provider: 'openai', modelName: 'gpt-test' })
  expect(res.status).toBe(200)
  return res.body.data?.id ?? res.body.data
}

beforeEach(async () => {
  await cleanTable('workspace')
  await cleanTable('user_role')
  await cleanTable('user')
})

describe('GET /api/workspace/list', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/workspace/list')
    expect(res.status).toBe(401)
  })

  it('认证请求应返回空列表', async () => {
    const { token } = await registerAndLogin()
    const res = await request.get('/api/workspace/list').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
  })
})

describe('POST /api/workspace/', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.post('/api/workspace').send({ title: 'test' })
    expect(res.status).toBe(401)
  })

  it('应成功创建工作区', async () => {
    const { token } = await registerAndLogin()
    const modelId = await createModelConfig(token)
    const res = await request
      .post('/api/workspace')
      .set(authHeader(token))
      .send({ title: 'test workspace', modelId })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBeInstanceOf(Object)
    expect(res.body.data.id).toBeDefined()
  })

  it('创建后应在列表中查到', async () => {
    const { token } = await registerAndLogin()
    const createRes = await request
      .post('/api/workspace')
      .set(authHeader(token))
      .send({ title: 'my workspace' })

    const listRes = await request.get('/api/workspace/list').set(authHeader(token))
    const found = listRes.body.data.find(w => w.id === createRes.body.data.id)
    expect(found).toBeDefined()
    expect(found.title).toBe('my workspace')
  })
})

describe('PUT /api/workspace/:id', () => {
  let token, workspaceId

  beforeEach(async () => {
    const auth = await registerAndLogin()
    token = auth.token
    const res = await request
      .post('/api/workspace')
      .set(authHeader(token))
      .send({ title: 'original title' })
    workspaceId = res.body.data.id
  })

  it('编辑后 title 应更新', async () => {
    const updateRes = await request
      .put(`/api/workspace/${workspaceId}`)
      .set(authHeader(token))
      .send({ title: 'updated title' })

    expect(updateRes.body.code).toBe(200)

    const listRes = await request.get('/api/workspace/list').set(authHeader(token))
    const found = listRes.body.data.find(w => w.id === workspaceId)
    expect(found.title).toBe('updated title')
  })

  it('编辑后 modelId 应更新', async () => {
    const modelId = await createModelConfig(token)

    const updateRes = await request
      .put(`/api/workspace/${workspaceId}`)
      .set(authHeader(token))
      .send({ modelId })

    expect(updateRes.body.code).toBe(200)

    const listRes = await request.get('/api/workspace/list').set(authHeader(token))
    const found = listRes.body.data.find(w => w.id === workspaceId)
    expect(found.modelId).toBe(modelId)
  })

  it('不能挂载他人的模型配置', async () => {
    const alice = await registerAndLogin()
    const aliceModelId = await createModelConfig(alice.token)

    const res = await request
      .put(`/api/workspace/${workspaceId}`)
      .set(authHeader(token))
      .send({ modelId: aliceModelId })
    expect(res.status).toBe(403)
  })

  it('挂载不存在的模型配置应返回 404', async () => {
    const res = await request
      .put(`/api/workspace/${workspaceId}`)
      .set(authHeader(token))
      .send({ modelId: 999999 })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/workspace/:id', () => {
  let token, workspaceId

  beforeEach(async () => {
    const auth = await registerAndLogin()
    token = auth.token
    const res = await request
      .post('/api/workspace')
      .set(authHeader(token))
      .send({ title: 'to be deleted' })
    workspaceId = res.body.data.id
  })

  it('应成功删除工作区', async () => {
    const deleteRes = await request
      .delete(`/api/workspace/${workspaceId}`)
      .set(authHeader(token))

    expect(deleteRes.body.code).toBe(200)
    expect(deleteRes.body.data).toBe(true)
  })

  it('删除后不应在列表中', async () => {
    await request.delete(`/api/workspace/${workspaceId}`).set(authHeader(token))

    const listRes = await request.get('/api/workspace/list').set(authHeader(token))
    const found = listRes.body.data.find(w => w.id === workspaceId)
    expect(found).toBeUndefined()
  })
})

describe('横向越权防护（requireOwnership）', () => {
  it('用户不能修改他人的工作区', async () => {
    const alice = await registerAndLogin()
    const createRes = await request
      .post('/api/workspace')
      .set(authHeader(alice.token))
      .send({ title: 'alice workspace' })
    const workspaceId = createRes.body.data.id

    const bob = await registerAndLogin()
    const res = await request
      .put(`/api/workspace/${workspaceId}`)
      .set(authHeader(bob.token))
      .send({ title: 'hacked title' })

    expect(res.status).toBe(403)
  })

  it('用户不能删除他人的工作区', async () => {
    const alice = await registerAndLogin()
    const createRes = await request
      .post('/api/workspace')
      .set(authHeader(alice.token))
      .send({ title: 'alice workspace 2' })
    const workspaceId = createRes.body.data.id

    const bob = await registerAndLogin()
    const res = await request
      .delete(`/api/workspace/${workspaceId}`)
      .set(authHeader(bob.token))

    expect(res.status).toBe(403)
  })

  it('super_admin 可以管理任何工作区', async () => {
    const alice = await registerAndLogin()
    const createRes = await request
      .post('/api/workspace')
      .set(authHeader(alice.token))
      .send({ title: 'alice workspace 3' })
    const workspaceId = createRes.body.data.id

    const admin = await registerAndLoginAdmin()
    const res = await request
      .put(`/api/workspace/${workspaceId}`)
      .set(authHeader(admin.token))
      .send({ title: 'admin edited' })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })

  it('操作不存在的工作区应返回 404', async () => {
    const { token } = await registerAndLogin()
    const res = await request
      .put('/api/workspace/999999')
      .set(authHeader(token))
      .send({ title: 'not found' })

    expect(res.status).toBe(404)
  })
})