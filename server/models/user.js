import db from '../sql/index.js'
import Rbac from './rbac.js'
import { getOffsetPage } from '../utils/pager.js'
import { formatResponse } from '../../shared/utils/formatter.js'
import { hashPassword, comparePassword } from '../utils/bcrypt.js'

export default class User {
  static filterFields(user) {
    const { password, ...rest } = user
    return formatResponse(rest)
  }

  static async findAll({ filters = {}, pagination = null, sort = {} } = {}) {
    let baseSql = `SELECT * FROM user WHERE 1=1`
    const params = []

    if (filters.keyword) {
      baseSql += ' AND (name LIKE ? OR email LIKE ?)'
      params.push(`%${filters.keyword}%`, `%${filters.keyword}%`)
    }

    if (filters.createdAt) {
      baseSql += ' AND created_at BETWEEN ? AND ?'
      params.push(filters.createdAt[0], filters.createdAt[1])
    }

    if (filters.updatedAt) {
      baseSql += ' AND updated_at BETWEEN ? AND ?'
      params.push(filters.updatedAt[0], filters.updatedAt[1])
    }

    if (filters.name) {
      baseSql += ' AND name = ?'
      params.push(filters.name)
    }

    if (filters.email) {
      baseSql += ' AND email = ?'
      params.push(filters.email)
    }

    if (pagination) {
      const options = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        allowedSortFields: ['name', 'email', 'created_at', 'updated_at'],
        orderBy: sort.orderBy || 'created_at',
        orderDir: sort.orderDir || 'DESC',
      }

      const { rows, page, pageSize, offset, total, totalPage } = await getOffsetPage(baseSql, params, options)
      return {
        rows: rows.map(this.filterFields),
        page,
        pageSize,
        offset,
        total,
        totalPage
      }
    } else {
      const [rows] = await db.query(baseSql, params)
      return rows.map(this.filterFields) || []
    }
  }

  static async findById(id) {
    if (!id) {
      throw new Error('id is required')
    }
    const baseSql = 'SELECT * FROM user WHERE id = ?'
    const [rows] = await db.query(baseSql, [id])
    const user = rows[0]
    if (user) {
      const [roles] = await db.query(`
        SELECT
          r.id,
          r.name,
          r.code,
          r.description,
          r.is_system
        FROM user_role ur
        LEFT JOIN role r ON ur.role_id = r.id
        WHERE ur.user_id = ?
      `, [id])
      user.roles = roles
      return this.filterFields(user)
    }
  }

  static async findByEmail(email) {
    if (!email) {
      throw new Error('email is required')
    }
    const baseSql = 'SELECT * FROM user WHERE email = ?'
    const [rows] = await db.query(baseSql, [email])
    return rows[0]
  }

  static async findByName(name) {
    if (!name) {
      throw new Error('name is required')
    }
    const baseSql = 'SELECT * FROM user WHERE name = ?'
    const [rows] = await db.query(baseSql, [name])
    return rows[0]
  }

  static async create({ name, email, password } = {}) {
    const baseSql = 'INSERT INTO user (name, email, password) VALUES (?, ?, ?)'
    const [result] = await db.query(baseSql, [name, email, await hashPassword(password)])
    // 新用户默认分配 member 角色（种子数据缺失时跳过，不阻塞注册）
    const [roles] = await db.query('SELECT id FROM role WHERE code = ?', ['member'])
    if (roles.length) {
      await db.query('INSERT INTO user_role (user_id, role_id) VALUES (?, ?)', [result.insertId, roles[0].id])
    }
    return result.insertId
  }

  static async update(id, payload) {
    if (!id) {
      throw new Error('id is required')
    }
    const baseSql = 'UPDATE user SET '
    const clause = ' WHERE id = ?'
    let sql = ''
    let params = []
    for (const key in payload) {
      if (['name', 'email', 'password'].includes(key) && payload[key]) {
        sql += `${key} = ?, `
        if (key === 'password') {
          params.push(await hashPassword(payload[key]))
        } else {
          params.push(payload[key])
        }
      }
    }
    if (params.length < 1) {
      return true
    }
    // Remove trailing comma and space
    sql = sql.slice(0, -2)

    const finalSql = baseSql + sql + clause
    params.push(id)
    const [result] = await db.query(finalSql, params)
    return result.affectedRows > 0
  }

  static async delete(id) {
    if (!id) {
      throw new Error('id is required')
    }
    // 清理 user_role 关联
    await Rbac.cleanUserRelations(id)
    const baseSql = 'DELETE FROM user WHERE id = ?'
    const [result] = await db.query(baseSql, [id])
    return result.affectedRows > 0
  }
}