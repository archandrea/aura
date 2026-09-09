import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getRequest, registerAndLogin, registerAndLoginAdmin, authHeader, cleanTable } from './helpers.js'
import db from '../sql/index.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

beforeEach(async () => {
  await cleanTable('role_menu')
  await cleanTable('menu')
  await cleanTable('user_role')
  await cleanTable('role')
  await cleanTable('user')

  // 重新插入默认内置角色
  await db.query(`
    INSERT INTO role (id, name, code, description, is_system) VALUES
    (1, 'super_admin', 'super_admin', 'Super administrator', 1),
    (2, 'admin', 'admin', 'Administrator', 1),
    (3, 'member', 'member', 'Basic role', 1)
  `)
})

describe('GET /api/role/list', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/role/list')
    expect(res.status).toBe(401)
  })

  it('普通用户（无 role:list 权限）应返回 403', async () => {
    const { token } = await registerAndLogin()
    const res = await request.get('/api/role/list').set(authHeader(token))
    expect(res.status).toBe(403)
  })

  it('super_admin 应返回系统角色列表', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request.get('/api/role/list').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
    expect(res.body.data.length).toBe(3)
    const codes = res.body.data.map(r => r.code)
    expect(codes).toContain('super_admin')
    expect(codes).toContain('admin')
    expect(codes).toContain('member')
  })
})

describe('GET /api/role/page', () => {
  it('super_admin 应返回分页角色列表', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request
      .get('/api/role/page')
      .query({ page: 1, pageSize: 2 })
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.rows).toBeInstanceOf(Array)
    expect(res.body.data.rows.length).toBe(2)
    expect(res.body.data.total).toBe(3)
  })
})

describe('GET /api/role/:id', () => {
  it('应成功获取指定角色详情', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request.get('/api/role/1').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.code).toBe('super_admin')
  })

  it('不存在的角色应报错', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request.get('/api/role/999').set(authHeader(token))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/role', () => {
  it('super_admin 应成功创建新角色', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '自定义角色',
        code: 'custom_role',
        description: '这是一段描述'
      })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.code).toBe('custom_role')
    expect(res.body.data.name).toBe('自定义角色')
  })

  it('普通用户应返回 403', async () => {
    const { token } = await registerAndLogin()
    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '越权角色',
        code: 'hack_role'
      })

    expect(res.status).toBe(403)
  })

  it('缺失必填字段应报错', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '缺少code的角色'
      })

    expect(res.status).toBe(400)
  })

  it('创建重复code的角色应报错', async () => {
    const { token } = await registerAndLoginAdmin()
    await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '角色A',
        code: 'duplicate_code'
      })

    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '角色B',
        code: 'duplicate_code'
      })

    expect(res.status).toBe(409)
  })
})

describe('PUT /api/role/:id', () => {
  let token, customRoleId

  beforeEach(async () => {
    const auth = await registerAndLoginAdmin()
    token = auth.token
    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '原角色名',
        code: 'custom_role_to_edit',
        description: '原描述'
      })
    customRoleId = res.body.data.id
  })

  it('应成功更新自定义角色名称和描述', async () => {
    const res = await request
      .put(`/api/role/${customRoleId}`)
      .set(authHeader(token))
      .send({
        name: '新角色名',
        description: '新描述'
      })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.name).toBe('新角色名')
    expect(res.body.data.description).toBe('新描述')
  })

  it('更新不存在的角色应报错', async () => {
    const res = await request
      .put('/api/role/999')
      .set(authHeader(token))
      .send({
        name: '随便改改'
      })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/role/:id', () => {
  let token, customRoleId

  beforeEach(async () => {
    const auth = await registerAndLoginAdmin()
    token = auth.token
    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '待删除角色',
        code: 'custom_role_to_delete'
      })
    customRoleId = res.body.data.id
  })

  it('应成功删除自定义角色并清理关联数据', async () => {
    // 给角色挂上菜单关联，删除后应一并清理
    const [menuRows] = await db.query(`INSERT INTO menu (name, code, type) VALUES ('测试菜单', 'test_menu_del', 'menu')`)
    await db.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?, ?)', [customRoleId, menuRows.insertId])

    const res = await request
      .delete(`/api/role/${customRoleId}`)
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBe(true)

    const [rmRows] = await db.query('SELECT COUNT(*) AS c FROM role_menu WHERE role_id = ?', [customRoleId])
    expect(rmRows[0].c).toBe(0)
  })

  it('删除系统角色应报错', async () => {
    const res = await request
      .delete('/api/role/1') // super_admin 是系统内置角色
      .set(authHeader(token))

    expect(res.status).toBe(400)
  })

  it('删除不存在的角色应报错', async () => {
    const res = await request
      .delete('/api/role/999')
      .set(authHeader(token))

    expect(res.status).toBe(404)
  })
})

describe('GET/PUT /api/role/:id/menus', () => {
  let token, customRoleId, menuIds

  beforeEach(async () => {
    const auth = await registerAndLoginAdmin()
    token = auth.token
    const res = await request
      .post('/api/role')
      .set(authHeader(token))
      .send({
        name: '菜单测试角色',
        code: 'menu_test_role'
      })
    customRoleId = res.body.data.id

    // 自建菜单，避免依赖种子数据
    const [rows] = await db.query(`
      INSERT INTO menu (name, code, type, permission) VALUES
      ('测试目录', 'test_dir', 'directory', NULL),
      ('测试页面', 'test_page', 'menu', 'note:list'),
      ('测试按钮', 'test_btn', 'button', 'note:create')
    `)
    menuIds = [rows.insertId, rows.insertId + 1, rows.insertId + 2]
  })

  it('应返回角色关联的菜单 ID 列表（初始为空）', async () => {
    const res = await request.get(`/api/role/${customRoleId}/menus`).set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('给角色分配菜单后应能查到（全量替换）', async () => {
    const putRes = await request
      .put(`/api/role/${customRoleId}/menus`)
      .set(authHeader(token))
      .send({ menuIds })

    expect(putRes.status).toBe(200)
    expect(putRes.body.data).toBe(true)

    const getRes = await request.get(`/api/role/${customRoleId}/menus`).set(authHeader(token))
    expect(getRes.status).toBe(200)
    expect(getRes.body.data.sort()).toEqual([...menuIds].sort())

    // 全量替换语义：只留第一个
    const replaceRes = await request
      .put(`/api/role/${customRoleId}/menus`)
      .set(authHeader(token))
      .send({ menuIds: [menuIds[0]] })

    expect(replaceRes.status).toBe(200)
    const getRes2 = await request.get(`/api/role/${customRoleId}/menus`).set(authHeader(token))
    expect(getRes2.body.data).toEqual([menuIds[0]])
  })

  it('menuIds 非数组应报错', async () => {
    const res = await request
      .put(`/api/role/${customRoleId}/menus`)
      .set(authHeader(token))
      .send({ menuIds: 'not-array' })

    expect(res.status).toBe(400)
  })

  it('不存在的角色应报错', async () => {
    const res = await request.get('/api/role/999/menus').set(authHeader(token))
    expect(res.status).toBe(404)
  })

  it('普通用户应返回 403', async () => {
    const { token: memberToken } = await registerAndLogin()
    const res = await request
      .put(`/api/role/${customRoleId}/menus`)
      .set(authHeader(memberToken))
      .send({ menuIds })

    expect(res.status).toBe(403)
  })
})
