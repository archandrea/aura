import { beforeAll, describe, expect, it } from 'vitest'
import { getRequest, registerAndLogin, registerAndLoginAdmin, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

// 创建一个不绑定任何角色的菜单
const createGhostMenu = async (token, code) => {
  const res = await request.post('/api/menu').set(authHeader(token)).send({
    name: '幽灵菜单', code, permission: `${code}:read`, type: 'menu', path: '/ghost',
  })
  expect(res.status).toBe(200)
  return res.body.data
}

describe('super_admin 权限/菜单实体化（getUserPermissions/getUserMenus）', () => {
  it('未绑定任何角色的新菜单，super_admin 的 profile 也能看到', async () => {
    const root = await registerAndLoginAdmin()
    const menu = await createGhostMenu(root.token, `ghost_menu_a_${Date.now()}`)
    const res = await request.get('/api/user/profile').set(authHeader(root.token))
    expect(res.status).toBe(200)
    expect(res.body.data.permissions).toContain(`${menu.code}:read`)
    expect(res.body.data.menus.some((m) => m.id === menu.id)).toBe(true)
  })

  it('member 不会获得未绑定菜单的权限', async () => {
    const root = await registerAndLoginAdmin()
    const menu = await createGhostMenu(root.token, `ghost_menu_b_${Date.now()}`)
    const member = await registerAndLogin()
    const res = await request.get('/api/user/profile').set(authHeader(member.token))
    expect(res.status).toBe(200)
    expect(res.body.data.permissions).not.toContain(`${menu.code}:read`)
  })
})
