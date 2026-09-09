/**
 * init.sql 种子数据验证
 * 模拟全新安装：清空 RBAC 相关表 → 重跑 init.sql → 验证首个 super_admin 用户可用
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { getRequest, authHeader, cleanTable } from './helpers.js'
import db from '../sql/index.js'

const __dirname = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url))

let request

beforeAll(async () => {
  request = await getRequest()
})

beforeEach(async () => {
  // 清空 RBAC 相关表，模拟全新安装
  await cleanTable('role_menu')
  await cleanTable('user_role')
  await cleanTable('menu')
  await cleanTable('role')
  await cleanTable('user')

  // 与 setup.js 相同的方式重跑 init.sql
  const initSql = fs.readFileSync(path.resolve(__dirname, '../sql/init.sql'), 'utf8')
  const statements = initSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.toUpperCase().startsWith('CREATE DATABASE') && !s.toUpperCase().startsWith('USE'))

  for (const statement of statements) {
    await db.execute(statement)
  }
})

describe('init.sql 种子数据', () => {
  it('应初始化首个用户 admin，且仅有 super_admin 角色', async () => {
    const [users] = await db.query('SELECT id, name, email FROM user WHERE id = 1')
    expect(users.length).toBe(1)
    expect(users[0].name).toBe('admin')
    expect(users[0].email).toBe('admin@aura.com')

    const [roles] = await db.query(`
      SELECT r.code FROM role r
      JOIN user_role ur ON r.id = ur.role_id
      WHERE ur.user_id = 1
    `)
    expect(roles.map(r => r.code)).toEqual(['super_admin'])
  })

  it('种子管理员应能用默认密码登录', async () => {
    const res = await request
      .post('/api/user/login')
      .send({
        email: 'admin@aura.com',
        password: 'Admin_123456'
      })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('token')
  })

  it('种子管理员应能通过 super_admin 通道访问管理接口', async () => {
    const loginRes = await request
      .post('/api/user/login')
      .send({ email: 'admin@aura.com', password: 'Admin_123456' })
    const token = loginRes.body.data.token

    // user:list 需要 super_admin/admin 权限，种子管理员应直接放行
    const listRes = await request.get('/api/user/list').set(authHeader(token))
    expect(listRes.status).toBe(200)
    expect(listRes.body.code).toBe(200)

    // profile 应报告 super_admin 角色与完整权限码
    const profileRes = await request.get('/api/user/profile').set(authHeader(token))
    expect(profileRes.status).toBe(200)
    expect(profileRes.body.data.roles).toContain('super_admin')
    expect(profileRes.body.data.permissions).toContain('user:list')
    expect(profileRes.body.data.menus.length).toBeGreaterThan(0)
  })

  it('种子管理员修改默认密码后仍可登录', async () => {
    const loginRes = await request
      .post('/api/user/login')
      .send({ email: 'admin@aura.com', password: 'Admin_123456' })
    const token = loginRes.body.data.token

    const updateRes = await request
      .put('/api/user/1')
      .set(authHeader(token))
      .send({ password: 'NewPass_123456' })
    expect(updateRes.status).toBe(200)

    // 旧密码失效
    const oldLogin = await request
      .post('/api/user/login')
      .send({ email: 'admin@aura.com', password: 'Admin_123456' })
    expect(oldLogin.status).toBe(400)

    // 新密码可用
    const newLogin = await request
      .post('/api/user/login')
      .send({ email: 'admin@aura.com', password: 'NewPass_123456' })
    expect(newLogin.status).toBe(200)
  })
})
