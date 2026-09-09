/**
 * Menu API 接口测试
 * 覆盖：菜单 CRUD、树结构、permission 字段校验、权限拦截、删除时清理 role_menu
 */
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
  await cleanTable('user')
})

describe('GET /api/menu/list', () => {
  it('未认证请求应返回 401', async () => {
    const res = await request.get('/api/menu/list')
    expect(res.status).toBe(401)
  })

  it('普通用户（无 menu:list 权限）应返回 403', async () => {
    const { token } = await registerAndLogin()
    const res = await request.get('/api/menu/list').set(authHeader(token))
    expect(res.status).toBe(403)
  })

  it('super_admin 应返回菜单列表', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request.get('/api/menu/list').set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
  })
})

describe('POST /api/menu', () => {
  let token

  beforeEach(async () => {
    token = (await registerAndLoginAdmin()).token
  })

  it('应成功创建目录', async () => {
    const res = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({
        name: '系统管理',
        code: 'system',
        type: 'directory',
        sortOrder: 10
      })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(200)
    expect(res.body.data.type).toBe('directory')
    expect(res.body.data.permission).toBeNull()
  })

  it('应成功创建带权限码的菜单页与按钮', async () => {
    const pageRes = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({
        name: '用户管理',
        code: 'user',
        permission: 'user:list',
        path: '/admin/users',
        type: 'menu'
      })
    expect(pageRes.status).toBe(200)
    expect(pageRes.body.data.permission).toBe('user:list')

    const btnRes = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({
        name: '新增用户',
        code: 'user_create',
        permission: 'user:create',
        parentId: pageRes.body.data.id,
        type: 'button'
      })
    expect(btnRes.status).toBe(200)
    expect(btnRes.body.data.parentId).toBe(pageRes.body.data.id)
  })

  it('非法 permission 格式应报错（缺冒号分隔）', async () => {
    const res = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({
        name: '坏菜单',
        code: 'bad_menu',
        permission: 'userlist',
        type: 'menu'
      })

    expect(res.status).toBe(400)
  })

  it('非法 permission 格式应报错（大写）', async () => {
    const res = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({
        name: '坏菜单2',
        code: 'bad_menu2',
        permission: 'User:Create',
        type: 'menu'
      })

    expect(res.status).toBe(400)
  })

  it('缺失必填字段应报错', async () => {
    const res = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '只有名字' })

    expect(res.status).toBe(400)
  })

  it('重复 code 应报错', async () => {
    await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '菜单A', code: 'dup_menu', type: 'menu' })

    const res = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '菜单B', code: 'dup_menu', type: 'menu' })

    expect(res.status).toBe(409)
  })

  it('不存在的 parentId 应报错', async () => {
    const res = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({
        name: '孤儿菜单',
        code: 'orphan_menu',
        parentId: 999999,
        type: 'button'
      })

    // model 层抛裸 Error，经全局错误处理器返回 500
    expect(res.status).toBe(500)
  })

  it('普通用户应返回 403', async () => {
    const { token: memberToken } = await registerAndLogin()
    const res = await request
      .post('/api/menu')
      .set(authHeader(memberToken))
      .send({ name: '越权菜单', code: 'hack_menu', type: 'menu' })

    expect(res.status).toBe(403)
  })
})

describe('GET /api/menu/tree', () => {
  it('应返回树形结构', async () => {
    const { token } = await registerAndLoginAdmin()

    const dirRes = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '系统管理', code: 'tree_system', type: 'directory' })
    const dirId = dirRes.body.data.id

    await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '用户管理', code: 'tree_user', permission: 'user:list', parentId: dirId, type: 'menu' })
    await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '新增用户', code: 'tree_user_create', permission: 'user:create', parentId: dirId, type: 'button' })

    const res = await request.get('/api/menu/tree').set(authHeader(token))
    expect(res.status).toBe(200)

    const dir = res.body.data.find(node => node.id === dirId)
    expect(dir).toBeDefined()
    expect(dir.children).toBeInstanceOf(Array)
    expect(dir.children.length).toBe(2)
  })
})

describe('PUT /api/menu/:id', () => {
  it('应成功更新菜单', async () => {
    const { token } = await registerAndLoginAdmin()
    const createRes = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '原菜单', code: 'to_update', type: 'menu', permission: 'test:read' })

    const res = await request
      .put(`/api/menu/${createRes.body.data.id}`)
      .set(authHeader(token))
      .send({ name: '新菜单', permission: 'test:write' })

    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('新菜单')
    expect(res.body.data.permission).toBe('test:write')
  })

  it('更新不存在的菜单应报错', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request
      .put('/api/menu/999999')
      .set(authHeader(token))
      .send({ name: '不存在的' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/menu/:id', () => {
  it('删除菜单时应同步清理 role_menu', async () => {
    const { token } = await registerAndLoginAdmin()
    const createRes = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '待删菜单', code: 'to_delete', type: 'menu', permission: 'test:delete' })
    const menuId = createRes.body.data.id

    // 建一个角色挂上该菜单，删除菜单后 role_menu 应被清理
    const [roleRes] = await db.query(`INSERT INTO role (name, code) VALUES ('删菜单角色', 'del_menu_role')`)
    await db.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?, ?)', [roleRes.insertId, menuId])

    const res = await request
      .delete(`/api/menu/${menuId}`)
      .set(authHeader(token))

    expect(res.status).toBe(200)
    expect(res.body.data).toBe(true)

    const [rows] = await db.query('SELECT COUNT(*) AS c FROM role_menu WHERE menu_id = ?', [menuId])
    expect(rows[0].c).toBe(0)
  })

  it('存在子菜单时删除应报错', async () => {
    const { token } = await registerAndLoginAdmin()
    const parentRes = await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '父菜单', code: 'parent_menu', type: 'directory' })

    await request
      .post('/api/menu')
      .set(authHeader(token))
      .send({ name: '子菜单', code: 'child_menu', parentId: parentRes.body.data.id, type: 'menu' })

    const res = await request
      .delete(`/api/menu/${parentRes.body.data.id}`)
      .set(authHeader(token))

    expect(res.status).toBe(400)
  })

  it('删除不存在的菜单应报错', async () => {
    const { token } = await registerAndLoginAdmin()
    const res = await request
      .delete('/api/menu/999999')
      .set(authHeader(token))

    expect(res.status).toBe(404)
  })
})
