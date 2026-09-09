import { beforeAll, describe, expect, it } from 'vitest'
import db from '../sql/index.js'
import { getRequest, registerAndLogin, registerAndLoginAdmin, assignRole, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

const getRoleId = async (code) => {
  const [rows] = await db.query('SELECT id FROM role WHERE code = ?', [code])
  return rows[0].id
}

// 有 admin 角色但非 super_admin 的账号（registerAndLogin 自带 member 角色）
const makeAdmin = async () => {
  const admin = await registerAndLogin()
  await assignRole(admin.id, 'admin')
  return admin
}

describe('提权防护（严格模式）', () => {
  it('R1: admin 不能给用户分配 super_admin 角色', async () => {
    const admin = await makeAdmin()
    const victim = await registerAndLogin()
    const roleId = await getRoleId('super_admin')
    const res = await request.put(`/api/user/${victim.id}/roles`).set(authHeader(admin.token)).send({ roleIds: [roleId] })
    expect(res.status).toBe(403)
  })

  it('R1 反例: admin 可以给用户分配 admin 角色', async () => {
    const admin = await makeAdmin()
    const victim = await registerAndLogin()
    const roleId = await getRoleId('admin')
    const res = await request.put(`/api/user/${victim.id}/roles`).set(authHeader(admin.token)).send({ roleIds: [roleId] })
    expect(res.status).toBe(200)
  })

  it('R2: admin 不能修改系统角色的权限', async () => {
    const admin = await makeAdmin()
    const roleId = await getRoleId('super_admin')
    const res = await request.put(`/api/role/${roleId}/menus`).set(authHeader(admin.token)).send({ menuIds: [] })
    expect(res.status).toBe(403)
  })

  it('R3: admin 不能授予自己没有的权限（未绑定任何角色的幽灵菜单）', async () => {
    // 不能用 seed 菜单做负例：测试用户经由 member 角色拥有 chat/note 等业务菜单
    const root = await registerAndLoginAdmin()
    const suffix = Date.now()
    const ghostRes = await request.post('/api/menu').set(authHeader(root.token)).send({
      name: '幽灵菜单', code: `ghost_r3_${suffix}`, permission: `ghost_r3_${suffix}:read`, type: 'menu', path: '/ghost',
    })
    expect(ghostRes.status).toBe(200)
    const ghostId = ghostRes.body.data.id

    const admin = await makeAdmin()
    const createRes = await request
      .post('/api/role')
      .set(authHeader(admin.token))
      .send({ name: '自定义', code: `custom_r3_${suffix}`, description: '' })
    const customRoleId = createRes.body.data.id

    const res = await request
      .put(`/api/role/${customRoleId}/menus`)
      .set(authHeader(admin.token))
      .send({ menuIds: [ghostId] })
    expect(res.status).toBe(403)
  })

  it('R3 反例: admin 可以授予自己拥有的权限（menu 100/101 = 系统管理/用户管理）', async () => {
    const admin = await makeAdmin()
    const suffix = Date.now()
    const createRes = await request
      .post('/api/role')
      .set(authHeader(admin.token))
      .send({ name: '自定义2', code: `custom_r3_ok_${suffix}`, description: '' })
    const customRoleId = createRes.body.data.id

    const res = await request
      .put(`/api/role/${customRoleId}/menus`)
      .set(authHeader(admin.token))
      .send({ menuIds: [100, 101] })
    expect(res.status).toBe(200)
  })

  it('R4: admin 不能删除 super_admin 用户', async () => {
    const admin = await makeAdmin()
    const root = await registerAndLoginAdmin()
    const res = await request.delete(`/api/user/${root.id}`).set(authHeader(admin.token))
    expect(res.status).toBe(403)
  })

  it('super_admin 不受限', async () => {
    const root = await registerAndLoginAdmin()
    const victim = await registerAndLogin()
    const roleId = await getRoleId('super_admin')
    const res = await request.put(`/api/user/${victim.id}/roles`).set(authHeader(root.token)).send({ roleIds: [roleId] })
    expect(res.status).toBe(200)
  })
})
