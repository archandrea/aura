import db from '../sql/index.js'
import { getOffsetPage } from '../utils/pager.js'
import { formatResponse } from '../../shared/utils/formatter.js'

export default class Chat {
  static filterFields(chat) {
    return formatResponse(chat)
  }

  static async findByWorkspaceId(workspaceId, { filters = {}, pagination = null, sort = {} } = {}) {
    if (!workspaceId) {
      throw new Error('workspaceId is required')
    }
    const baseSql = 'SELECT * FROM chat WHERE workspace_id = ?'

    if (pagination) {
      const options = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        allowedSortFields: ['proposer', 'created_at', 'updated_at'],
        orderBy: sort.orderBy || 'created_at',
        orderDir: sort.orderDir || 'DESC',
      }

      const { rows, page, pageSize, offset, total, totalPage } = await getOffsetPage(baseSql, [workspaceId], options)
      return {
        rows: rows.map(this.filterFields),
        page,
        pageSize,
        offset,
        total,
        totalPage
      }
    } else {
      const [rows] = await db.query(baseSql, [workspaceId])
      return rows.map(this.filterFields) || []
    }
  }

  static async create({ workspaceId, proposer, content } = {}) {
    if (!workspaceId) {
      throw new Error('workspaceId is required')
    }
    const baseSql = 'INSERT INTO chat (workspace_id, proposer, content) VALUES (?, ?, ?)'
    const [result] = await db.query(baseSql, [workspaceId, proposer, content])
    return result.insertId
  }

  static async update(id, payload) {
    if (!id) {
      throw new Error('id is required')
    }
    const baseSql = 'UPDATE chat SET '
    const clause = ' WHERE id = ?'
    let sql = ''
    let params = []
    for (const key in payload) {
      if (['content'].includes(key) && payload[key]) {
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
    const baseSql = 'DELETE FROM chat WHERE id = ?'
    const [result] = await db.query(baseSql, [id])
    return result.affectedRows > 0
  }
}