import db from '../sql/index.js'
import Rbac from './rbac.js'
import { getOffsetPage } from '../utils/pager.js'
import { formatResponse } from '../../shared/utils/formatter.js'

export default class Role {
  static filterFields(role) {
    return formatResponse(role)
  }

  static async findAll({ filters = {}, pagination = null, sort = {} } = {}) {
    let baseSql = `SELECT * FROM role WHERE 1=1`
    const params = []

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

    if (filters.code) {
      baseSql += ' AND code = ?'
      params.push(filters.code)
    }

    if (pagination) {
      const options = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        allowedSortFields: ['name', 'code', 'created_at', 'updated_at'],
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
    const baseSql = 'SELECT * FROM role WHERE id = ?'
    const [rows] = await db.query(baseSql, [id])
    return rows[0] && this.filterFields(rows[0])
  }

  static async findByCode(code) {
    if (!code) {
      throw new Error('code is required')
    }
    const baseSql = 'SELECT * FROM role WHERE code = ?'
    const [rows] = await db.query(baseSql, [code])
    return rows[0]
  }

  static async create({ name, code, description } = {}) {
    const baseSql = 'INSERT INTO role (name, code, description) VALUES (?, ?, ?)'
    const [result] = await db.query(baseSql, [name, code, description])
    return result.insertId
  }

  static async update(id, payload) {
    if (!id) {
      throw new Error('id is required')
    }
    const baseSql = 'UPDATE role SET '
    const clause = ' WHERE id = ?'
    let sql = ''
    let params = []
    for (const key in payload) {
      if (['name', 'description'].includes(key) && payload[key] !== undefined) {
        sql += `${key} = ?, `
        params.push(payload[key])
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
    const [roleRows] = await db.query('SELECT is_system FROM role WHERE id = ?', [id])
    if (!roleRows.length) {
      throw new Error('role not found')
    }
    if (roleRows[0].is_system === 1) {
      throw new Error('system role cannot be deleted')
    }
    // 清理 role_menu / user_role 关联
    await Rbac.cleanRoleRelations(id)
    const baseSql = 'DELETE FROM role WHERE id = ?'
    const [result] = await db.query(baseSql, [id])
    return result.affectedRows > 0
  }
}