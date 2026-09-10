/**
 * 全局测试初始化与清理
 * - 在所有测试开始前：创建测试数据库并初始化表结构
 * - 在所有测试结束后：清除数据并关闭连接池
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { beforeAll, afterAll } from 'vitest'
import mysql from 'mysql2/promise'
import yaml from 'js-yaml'

// 确保测试环境
process.env.NODE_ENV = 'test'

const __dirname = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url))

// 手动加载 .env 文件（测试时 env.js 的相对路径可能有问题）
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// 在加载 sql/index.js 之前，先连接 MySQL 并确保测试数据库 (aura_test) 存在
try {
  const configPath = path.resolve(__dirname, '../config.yaml')
  const config = yaml.load(fs.readFileSync(configPath, 'utf8'))
  const initConn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  })
  await initConn.execute('CREATE DATABASE IF NOT EXISTS `aura_test`')
  await initConn.end()
} catch (err) {
  console.error('❌ Failed to ensure aura_test database exists:', err.message)
}

// 必须在设置好环境变量且创建好数据库之后再导入 sql
const { default: pool } = await import('../sql/index.js')
// Redis 同理：测试期间连真实 Redis，但缓存必须在跑前/跑后清空，
// 否则上一轮运行残留的 rbac 缓存会污染本轮测试（MySQL 清了而 Redis 没清，权限断言会撞上脏缓存）
const { default: redis } = await import('../utils/redis.js')

// 注意必须用 beforeEach 而不是 beforeAll：
// 各测试文件的 beforeEach 会 TRUNCATE user 表重建数据，自增 ID 从 1 重新发号，
// 不同测试的"同 ID 不同权限"用户会互相踩缓存，只有逐测试清空才能对齐
beforeEach(async () => {
  try {
    if (redis) await redis.flushdb()
  } catch (err) {
    console.error('⚠️ Failed to flush redis before test:', err.message)
  }
})

beforeAll(async () => {
  try {
    // 读取并执行 init.sql 初始化表结构
    const initSql = fs.readFileSync(
      path.resolve(__dirname, '../sql/init.sql'),
      'utf8'
    )

    // 按分号拆分 SQL 语句并逐条执行，测试环境下过滤掉创建和选择数据库的语句
    const statements = initSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.toUpperCase().startsWith('CREATE DATABASE') && !s.toUpperCase().startsWith('USE'))

    for (const statement of statements) {
      await pool.execute(statement)
    }

    console.log('✅ Test database initialized')
  } catch (err) {
    console.error('❌ Failed to initialize test database:', err.message)
    throw err
  }
})

afterAll(async () => {
  try {
    // 清空所有表数据（按外键依赖顺序）
    const tables = [
      'user_settings',
      'chat',
      'model_config',
      'note',
      'workspace',
      'role_menu',
      'user_role',
      'menu',
      'role',
      'user'
    ]

    await pool.execute('SET FOREIGN_KEY_CHECKS = 0')
    for (const table of tables) {
      try {
        await pool.execute(`TRUNCATE TABLE \`${table}\``)
      } catch {
        // 表可能不存在，忽略
      }
    }
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1')

    // 清空测试期间写入的 Redis 缓存，与上面的 TRUNCATE 对称
    if (redis) await redis.flushdb()

    // 关闭连接池
    await pool.end()
    console.log('🧹 Test database cleaned up')
  } catch (err) {
    console.error('⚠️ Cleanup warning:', err.message)
  }
})
