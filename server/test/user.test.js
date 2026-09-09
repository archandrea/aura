/**
 * User API 接口测试
 * 覆盖：注册、登录、Profile、列表、分页、更新（自助/管理）、删除、角色分配、权限拦截
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getRequest, registerAndLogin, registerAndLoginAdmin, authHeader, cleanTable } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

beforeEach(async () => {
  await cleanTable('user_role')
  await cleanTable('user')
})

describe('POST /api/user/register', () => {
  it('应成功注册用户', async () => {
    const res = await request
      .post('/api/user/register')
      .send({
        name: 'test_register',
        email: 'register@test.com',
        password: 'Test_123456'
      })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.message).toBe('success')
  })

  it('缺少必填字段应报错', async () => {
    const res = await request
      .post('/api/user/register')
      .send({ name: 'test' })

    expect(res.status).toBe(400)
  })

  it('无效邮箱格式应报错', async () => {
    const res = await request
      .post('/api/user/register')
      .send({
        name: 'test_invalid_email',
        email: 'not-an-email',
        password: 'Test_123456'
      })

    expect(res.status).toBe(400)
  })

  it('弱密码应报错', async () => {
    const res = await request
      .post('/api/user/register')
      .send({
        name: 'test_weak_pwd',
        email: 'weak@test.com',
        password: '123'
      })

    expect(res.status).toBe(400)
  })

  it('重复注册同名用户应报错', async () => {
    await request
      .post('/api/user/register')
      .send({
        name: 'duplicate_user',
        email: 'dup1@test.com',
        password: 'Test_123456'
      })

    const res = await request
      .post('/api/user/register')
      .send({
        name: 'duplicate_user',
        email: 'dup2@test.com',
        password: 'Test_123456'
      })

    expect(res.status).toBe(409)
  })

  it('新注册用户默认角色只有member', async () => {
    const { token, id } = await registerAndLogin()

    const res = await request
      .get(`/api/user/${id}`)
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.roles.length).toBe(1)
    expect(res.body.data.roles[0].code).toBe('member')
  })
})

describe('POST /api/user/login', () => {
  beforeEach(async () => {
    // 注册一个用户供登录测试使用
    await request
      .post('/api/user/register')
      .send({
        name: 'login_user',
        email: 'login@test.com',
        password: 'Test_123456'
      })
  })

  it('应成功登录并返回 token', async () => {
    const res = await request
      .post('/api/user/login')
      .send({
        email: 'login@test.com',
        password: 'Test_123456'
      })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toHaveProperty('token')
    expect(res.body.data.name).toBe('login_user')
    expect(res.body.data.email).toBe('login@test.com')
  })

  it('错误密码应报错', async () => {
    const res = await request
      .post('/api/user/login')
      .send({
        email: 'login@test.com',
        password: 'WrongPassword@123'
      })

    expect(res.status).toBe(400)
  })

  it('不存在的用户应报错', async () => {
    const res = await request
      .post('/api/user/login')
      .send({
        email: 'nonexist@test.com',
        password: 'Test_123456'
      })

    expect(res.status).toBe(404)
  })

  it('缺少字段应报错', async () => {
    const res = await request
      .post('/api/user/login')
      .send({ email: 'login@test.com' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/user/profile', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/user/profile')
    expect(res.status).toBe(401)
  })

  it('member 的 profile 应包含角色、权限与菜单', async () => {
    const { token } = await registerAndLogin()
    const res = await request.get('/api/user/profile').set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.roles).toContain('member')
    expect(Array.isArray(res.body.data.permissions)).toBe(true)
    expect(Array.isArray(res.body.data.menus)).toBe(true)
    // member 基础菜单（chat/note/setting）无权限码，权限集应为空
    expect(res.body.data.permissions).toEqual([])
  })

  it('profile 不应泄露密码', async () => {
    const { token } = await registerAndLogin()
    const res = await request.get('/api/user/profile').set(authHeader(token))
    expect(res.body.data.password).toBeUndefined()
  })
})

describe('GET /api/user/list', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/user/list')
    expect(res.status).toBe(401)
  })

  it('普通用户（无 user:list 权限）应返回 403', async () => {
    const { token } = await registerAndLogin()
    const res = await request.get('/api/user/list').set(authHeader(token))
    expect(res.status).toBe(403)
  })

  it('管理员应返回用户列表', async () => {
    await registerAndLogin()
    const { token } = await registerAndLoginAdmin()

    const res = await request
      .get('/api/user/list')
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
  })
})

describe('GET /api/user/page', () => {
  it('管理员应支持分页查询', async () => {
    const { token } = await registerAndLoginAdmin()

    const res = await request
      .get('/api/user/page')
      .query({ page: 1, pageSize: 10 })
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBeDefined()
  })

  it('管理员应支持关键词搜索', async () => {
    const { token, name } = await registerAndLoginAdmin()

    const res = await request
      .get('/api/user/page')
      .query({ page: 1, pageSize: 10, keyword: name })
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })

  it('普通用户应返回 403', async () => {
    const { token } = await registerAndLogin()

    const res = await request
      .get('/api/user/page')
      .set(authHeader(token))

    expect(res.status).toBe(403)
  })
})

describe('PUT /api/user/:id', () => {
  it('用户可以更新自己的资料（自助）', async () => {
    const { token, id } = await registerAndLogin()

    const res = await request
      .put(`/api/user/${id}`)
      .set(authHeader(token))
      .send({
        name: 'updated_name',
        email: 'updated@test.com'
      })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })

  it('普通用户更新他人应返回 403', async () => {
    const alice = await registerAndLogin()
    const bob = await registerAndLogin({ name: 'bob_target', email: 'bob_target@test.com' })

    const res = await request
      .put(`/api/user/${bob.id}`)
      .set(authHeader(alice.token))
      .send({ name: 'hacked_name' })

    expect(res.status).toBe(403)
  })

  it('管理员可以更新他人资料', async () => {
    const admin = await registerAndLoginAdmin()
    const bob = await registerAndLogin({ name: 'bob_admin_edit', email: 'bob_admin_edit@test.com' })

    const res = await request
      .put(`/api/user/${bob.id}`)
      .set(authHeader(admin.token))
      .send({ name: 'admin_edited' })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })
})

describe('DELETE /api/user/:id', () => {
  it('管理员应成功删除用户', async () => {
    const admin = await registerAndLoginAdmin()
    const target = await registerAndLogin({ name: 'to_delete', email: 'delete@test.com' })

    const res = await request
      .delete(`/api/user/${target.id}`)
      .set(authHeader(admin.token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
  })

  it('普通用户删除他人应返回 403', async () => {
    const alice = await registerAndLogin()
    const bob = await registerAndLogin({ name: 'bob_del', email: 'bob_del@test.com' })

    const res = await request
      .delete(`/api/user/${bob.id}`)
      .set(authHeader(alice.token))

    expect(res.status).toBe(403)
  })
})

describe('PUT /api/user/:id/roles', () => {
  let admin, target

  beforeEach(async () => {
    admin = await registerAndLoginAdmin()
    target = await registerAndLogin({ name: 'role_target', email: 'role_target@test.com' })
  })

  it('管理员应成功给用户分配角色（全量替换）', async () => {
    // target 注册后默认 member，替换为 admin（角色 id=2）
    const res = await request
      .put(`/api/user/${target.id}/roles`)
      .set(authHeader(admin.token))
      .send({ roleIds: [2] })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBe(true)

    const detailRes = await request
      .get(`/api/user/${target.id}`)
      .set(authHeader(admin.token))
    expect(detailRes.body.data.roles.map(r => r.code)).toEqual(['admin'])
  })

  it('分配空数组应清空用户所有角色', async () => {
    const res = await request
      .put(`/api/user/${target.id}/roles`)
      .set(authHeader(admin.token))
      .send({ roleIds: [] })

    expect(res.status).toBe(200)

    const detailRes = await request
      .get(`/api/user/${target.id}`)
      .set(authHeader(admin.token))
    expect(detailRes.body.data.roles).toEqual([])
  })

  it('roleIds 非数组应报错', async () => {
    const res = await request
      .put(`/api/user/${target.id}/roles`)
      .set(authHeader(admin.token))
      .send({ roleIds: 'not-array' })

    expect(res.status).toBe(400)
  })

  it('roleIds 含不存在的角色应报错', async () => {
    const res = await request
      .put(`/api/user/${target.id}/roles`)
      .set(authHeader(admin.token))
      .send({ roleIds: [9999] })

    expect(res.status).toBe(400)
  })

  it('不存在的用户应报错', async () => {
    const res = await request
      .put('/api/user/999/roles')
      .set(authHeader(admin.token))
      .send({ roleIds: [2] })

    expect(res.status).toBe(404)
  })

  it('普通用户应返回 403', async () => {
    const res = await request
      .put(`/api/user/${target.id}/roles`)
      .set(authHeader(target.token))
      .send({ roleIds: [1] }) // 尝试给自己提权 super_admin

    expect(res.status).toBe(403)
  })
})
