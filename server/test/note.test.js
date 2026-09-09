import { beforeAll, describe, expect, it } from 'vitest'
import { getRequest, registerAndLogin, registerAndLoginAdmin, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

// Note.create 返回 insertId（数字），直接作为 id 使用
const createNote = async (token, title) => {
  const res = await request.post('/api/note').set(authHeader(token)).send({ title, content: 'hello' })
  expect(res.status).toBe(200)
  return res.body.data?.id ?? res.body.data
}

describe('GET /api/note/page', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/note/page')
    expect(res.status).toBe(401)
  })

  it('列表只能看到自己的笔记', async () => {
    // 唯一标题，避免历史遗留行干扰断言
    const unique = `alice-private-${Date.now()}`
    const alice = await registerAndLogin()
    await createNote(alice.token, unique)
    const bob = await registerAndLogin()
    const res = await request.get('/api/note/page').set(authHeader(bob.token))
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body.data)).not.toContain(unique)
  })
})

describe('笔记横向越权防护（requireOwnership）', () => {
  it('用户不能查看他人的笔记', async () => {
    const alice = await registerAndLogin()
    const noteId = await createNote(alice.token, 'alice note 1')
    const bob = await registerAndLogin()
    const res = await request.get(`/api/note/${noteId}`).set(authHeader(bob.token))
    expect(res.status).toBe(403)
  })

  it('用户不能修改他人的笔记', async () => {
    const alice = await registerAndLogin()
    const noteId = await createNote(alice.token, 'alice note 2')
    const bob = await registerAndLogin()
    const res = await request.put(`/api/note/${noteId}`).set(authHeader(bob.token)).send({ title: 'hacked' })
    expect(res.status).toBe(403)
  })

  it('用户不能删除他人的笔记', async () => {
    const alice = await registerAndLogin()
    const noteId = await createNote(alice.token, 'alice note 3')
    const bob = await registerAndLogin()
    const res = await request.delete(`/api/note/${noteId}`).set(authHeader(bob.token))
    expect(res.status).toBe(403)
  })

  it('super_admin 可以管理任何笔记', async () => {
    const alice = await registerAndLogin()
    const noteId = await createNote(alice.token, 'alice note 4')
    const root = await registerAndLoginAdmin()
    const res = await request.put(`/api/note/${noteId}`).set(authHeader(root.token)).send({ title: 'admin edited' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })

  it('操作不存在的笔记应返回 404', async () => {
    const alice = await registerAndLogin()
    const res = await request.put('/api/note/999999').set(authHeader(alice.token)).send({ title: 'x' })
    expect(res.status).toBe(404)
  })
})
