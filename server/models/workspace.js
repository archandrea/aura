import db from '../sql/index.js'
import { getOffsetPage } from '../utils/pager.js'
import { formatResponse } from '../../shared/utils/formatter.js'

export default class Workspace {
  static filterFields(workspace) {
    return formatResponse(workspace)
  }

  static async findAll({ user, filters = {}, pagination = null, sort = {} } = {}) {
    if (!user?.id) {
      throw new Error('userId is required')
    }

    let baseSql = `SELECT * FROM workspace WHERE 1=1`
    const params = []

    baseSql += ' AND user_id = ?'
    params.push(user.id)

    if (filters.createdAt) {
      baseSql += ' AND created_at BETWEEN ? AND ?'
      params.push(filters.createdAt[0], filters.createdAt[1])
    }

    if (filters.updatedAt) {
      baseSql += ' AND updated_at BETWEEN ? AND ?'
      params.push(filters.updatedAt[0], filters.updatedAt[1])
    }

    if (filters.title) {
      baseSql += ' AND title = ?'
      params.push(filters.title)
    }

    if (pagination) {
      const options = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        allowedSortFields: ['title', 'created_at', 'updated_at'],
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

  static async findWithDetails({ user, filters = {}, pagination = null, sort = {} } = {}) {
    if (!user?.id) {
      throw new Error('userId is required')
    }

    let baseSql = `
    SELECT 
      workspace.*, 
      model_config.model_name, 
      model_config.provider 
    FROM workspace 
    LEFT JOIN model_config ON workspace.model_id = model_config.id 
    WHERE 1=1`
    const params = []

    baseSql += ' AND workspace.user_id = ?'
    params.push(user.id)

    if (filters.createdAt) {
      baseSql += ' AND workspace.created_at BETWEEN ? AND ?'
      params.push(filters.createdAt[0], filters.createdAt[1])
    }

    if (filters.updatedAt) {
      baseSql += ' AND workspace.updated_at BETWEEN ? AND ?'
      params.push(filters.updatedAt[0], filters.updatedAt[1])
    }

    if (filters.title) {
      baseSql += ' AND workspace.title = ?'
      params.push(filters.title)
    }

    if (pagination) {
      const options = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        allowedSortFields: ['title', 'created_at', 'updated_at'],
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
    const baseSql = 'SELECT * FROM workspace WHERE id = ?'
    const [rows] = await db.query(baseSql, [id])
    return rows[0] && this.filterFields(rows[0])
  }

  static async create(user, { title, modelId } = {}) {
    if (!user?.id) {
      throw new Error('userId is required')
    }
    const baseSql = 'INSERT INTO workspace (user_id, title, model_id) VALUES (?, ?, ?)'
    const [result] = await db.query(baseSql, [user.id, title, modelId])
    return result.insertId
  }

  static async update(id, payload,) {
    if (!id) {
      throw new Error('id is required')
    }

    const baseSql = 'UPDATE workspace SET '
    const clause = ' WHERE id = ?'
    let sql = ''
    let params = []

    if (payload?.title) {
      sql += 'title = ?, '
      params.push(payload.title)
    }
    if (payload?.modelId) {
      sql += 'model_id = ?, '
      params.push(payload.modelId)
    }
    if (params.length < 1) {
      return true
    }
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
    await db.query('DELETE FROM chat WHERE workspace_id = ?', [id])
    const baseSql = 'DELETE FROM workspace WHERE id = ?'
    const [result] = await db.query(baseSql, [id])
    return result.affectedRows > 0
  }
}