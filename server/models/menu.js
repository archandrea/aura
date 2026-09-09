import db from '../sql/index.js'
import { formatResponse, toSnakeCase } from '../../shared/utils/formatter.js'

export default class Menu {
  static filterFields(menu) {
    return formatResponse(menu)
  }

  static async findAll(filters = {}) {
    let baseSql = 'SELECT * FROM menu WHERE 1=1'
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

    if (filters.parentId !== undefined) {
      if (filters.parentId === null || filters.parentId === 'null') {
        baseSql += ' AND parent_id IS NULL'
      } else {
        baseSql += ' AND parent_id = ?'
        params.push(filters.parentId)
      }
    }

    if (filters.permission) {
      baseSql += ' AND permission = ?'
      params.push(filters.permission)
    }

    if (filters.type) {
      baseSql += ' AND type = ?'
      params.push(filters.type)
    }

    if (filters.visible !== undefined) {
      baseSql += ' AND visible = ?'
      params.push(filters.visible)
    }

    if (filters.status !== undefined) {
      baseSql += ' AND status = ?'
      params.push(filters.status)
    }

    baseSql += ' ORDER BY sort_order ASC, id ASC'

    const [rows] = await db.query(baseSql, params)
    return rows.map(this.filterFields) || []
  }

  static async findByCode(code) {
    if (!code) {
      throw new Error('code is required')
    }
    const [rows] = await db.query('SELECT * FROM menu WHERE code = ?', [code])
    return rows[0] && this.filterFields(rows[0])
  }

  static async findById(id) {
    if (!id) {
      throw new Error('id is required')
    }
    const [rows] = await db.query('SELECT * FROM menu WHERE id = ?', [id])
    return rows[0] && this.filterFields(rows[0])
  }

  // visible/status 必须有默认值：INSERT 显式传 NULL 会绕过列默认值，产生永远不可见的菜单
  static async create({ parentId, name, code, permission, path, icon, sortOrder = 0, type = 'menu', visible = 1, status = 1 } = {}) {
    if (parentId) {
      const [rows] = await db.query('SELECT * FROM menu WHERE id = ?', [parentId])
      if (!rows.length) {
        throw new Error('parent node not found')
      }
    }
    const baseSql = 'INSERT INTO menu (parent_id, name, code, permission, path, icon, sort_order, type, visible, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    const [result] = await db.query(baseSql, [parentId, name, code, permission, path, icon, sortOrder, type, visible, status])
    return result.insertId
  }

  static async update(id, payload = {}) {
    if (!id) {
      throw new Error('id is required')
    }
    if (payload.parentId) {
      const [rows] = await db.query('SELECT * FROM menu WHERE id = ?', [payload.parentId])
      if (!rows.length) {
        throw new Error('parent node not found')
      }
    }
    const baseSql = 'UPDATE menu SET '
    const clause = ' WHERE id = ?'
    let sql = ''
    let params = []
    const allowedFields = ['parentId', 'name', 'code', 'permission', 'path', 'icon', 'sortOrder', 'type', 'visible', 'status']
    for (const key in payload) {
      if (allowedFields.includes(key) && payload[key] !== undefined) {
        sql += `${toSnakeCase(key)} = ?, `
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
    const baseSql = 'DELETE FROM menu WHERE id = ?'
    const [result] = await db.query(baseSql, [id])
    return result.affectedRows > 0
  }
}
