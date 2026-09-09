/**
 * 测试辅助函数
 */
import supertest from 'supertest'

let _app = null

/**
 * 获取 app 实例（懒加载）
 */
export async function getApp() {
  if (!_app) {
    const { default: app } = await import('../app.js')
    _app = app
  }
  return _app
}

/**
 * 获取 supertest request 实例
 */
export async function getRequest() {
  const app = await getApp()
  return supertest(app)
}

/**
 * 注册测试用户并返回 token
 * @param {object} [userData] - 可选的用户数据覆盖
 * @returns {Promise<{token: string, name: string, email: string}>}
 */
export async function registerAndLogin(userData = {}) {
  const request = await getRequest()

  const ts = Date.now().toString().slice(-6)
  const defaultUser = {
    name: userData.name || `tuser_${ts}`,
    email: userData.email || `test_${ts}@test.com`,
    password: userData.password || 'Test_123456'
  }

  // 注册
  const registerRes = await request
    .post('/api/user/register')
    .send(defaultUser)

  if (!registerRes.ok) {
    throw new Error(`Register failed: ${registerRes.body.message}`)
  }

  // 登录获取 token
  const loginRes = await request
    .post('/api/user/login')
    .send({
      email: defaultUser.email,
      password: defaultUser.password
    })

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.body.message}`)
  }

  return {
    id: loginRes.body.data.id,
    token: loginRes.body.data.token,
    name: loginRes.body.data.name,
    email: loginRes.body.data.email,
  }
}

/**
 * 给用户分配角色（直接操作数据库，绕过 API 权限，用于测试准备）
 */
export async function assignRole(userId, roleCode) {
  const { default: pool } = await import('../sql/index.js')
  const [rows] = await pool.query('SELECT id FROM role WHERE code = ?', [roleCode])
  if (!rows.length) {
    throw new Error(`role ${roleCode} not found, run init.sql seeds first`)
  }
  await pool.query('INSERT IGNORE INTO user_role (user_id, role_id) VALUES (?, ?)', [userId, rows[0].id])
}

/**
 * 注册并登录一个 super_admin 用户
 */
export async function registerAndLoginAdmin(userData = {}) {
  const auth = await registerAndLogin(userData)
  await assignRole(auth.id, 'super_admin')
  return auth
}

/**
 * 获取带认证头的 request helper
 * @param {string} token - JWT token
 */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}

/**
 * 清空指定表
 * @param {string} tableName
 */
export async function cleanTable(tableName) {
  const { default: pool } = await import('../sql/index.js')
  await pool.execute('SET FOREIGN_KEY_CHECKS = 0')
  await pool.execute(`TRUNCATE TABLE ${tableName}`)
  await pool.execute('SET FOREIGN_KEY_CHECKS = 1')
}
