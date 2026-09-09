import db from '../sql/index.js'
import { formatResponse } from '../../shared/utils/formatter.js'

/**
 * RBAC 核心 Model
 * 鉴权链路：user → user_role → role_menu → menu.permission
 */
export default class Rbac {
  /**
   * 获取用户的所有角色 code
   */
  static async getUserRoles(userId) {
    const [rows] = await db.query(
      `SELECT r.code FROM role r
       JOIN user_role ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId]
    )
    return rows.map(row => row.code)
  }

  /**
   * 获取用户的所有权限码（通过 role → menu.permission 链路）
   * super_admin 直接返回全量权限码，与 requirePermission 的放行口径对齐，
   * 前端 profile 拿到的集合即后端真实授权范围（前端不感知角色特判）
   */
  static async getUserPermissions(userId) {
    const roles = await this.getUserRoles(userId)
    if (roles.includes('super_admin')) {
      const [all] = await db.query(
        'SELECT DISTINCT permission FROM menu WHERE permission IS NOT NULL AND status = 1'
      )
      return all.map(row => row.permission)
    }
    const [rows] = await db.query(
      `SELECT DISTINCT m.permission FROM menu m
       JOIN role_menu rm ON m.id = rm.menu_id
       JOIN user_role ur ON rm.role_id = ur.role_id
       WHERE ur.user_id = ?
         AND m.permission IS NOT NULL
         AND m.status = 1`,
      [userId]
    )
    return rows.map(row => row.permission)
  }

  /**
   * 获取用户可见的菜单列表（平铺，接口层自行 toTree）
   * super_admin 直接返回全部可见菜单：新建菜单未绑定角色时超管也可见
   */
  static async getUserMenus(userId) {
    const roles = await this.getUserRoles(userId)
    if (roles.includes('super_admin')) {
      const [all] = await db.query(
        `SELECT * FROM menu
         WHERE type IN ('directory', 'menu') AND visible = 1 AND status = 1
         ORDER BY sort_order ASC, id ASC`
      )
      return all.map(formatResponse)
    }
    const [rows] = await db.query(
      `SELECT DISTINCT m.* FROM menu m
       JOIN role_menu rm ON m.id = rm.menu_id
       JOIN user_role ur ON rm.role_id = ur.role_id
       WHERE ur.user_id = ?
         AND m.type IN ('directory', 'menu')
         AND m.visible = 1
         AND m.status = 1
       ORDER BY m.sort_order ASC, m.id ASC`,
      [userId]
    )
    return rows.map(formatResponse)
  }

  /**
   * 获取用户的所有角色 ID（管理后台回显用）
   */
  static async getUserRoleIds(userId) {
    const [rows] = await db.query('SELECT role_id FROM user_role WHERE user_id = ?', [userId])
    return rows.map(row => row.role_id)
  }

  /**
   * 获取用户拥有的所有菜单 ID（提权防护 R3 用）
   */
  static async getUserMenuIds(userId) {
    const [rows] = await db.query(
      `SELECT DISTINCT rm.menu_id FROM role_menu rm
       JOIN user_role ur ON rm.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId]
    )
    return rows.map(row => row.menu_id)
  }

  /**
   * 给用户分配角色（全量替换，事务）
   */
  static async assignRolesToUser(userId, roleIds) {
    const connection = await db.getConnection()
    await connection.beginTransaction()
    try {
      await connection.query('DELETE FROM user_role WHERE user_id = ?', [userId])
      if (roleIds && roleIds.length > 0) {
        const values = roleIds.map(roleId => [userId, roleId])
        await connection.query('INSERT INTO user_role (user_id, role_id) VALUES ?', [values])
      }
      await connection.commit()
      return true
    } catch (err) {
      await connection.rollback()
      throw err
    } finally {
      connection.release()
    }
  }

  /**
   * 给角色分配菜单/权限（全量替换，事务）
   */
  static async assignMenusToRole(roleId, menuIds) {
    const connection = await db.getConnection()
    await connection.beginTransaction()
    try {
      await connection.query('DELETE FROM role_menu WHERE role_id = ?', [roleId])
      if (menuIds && menuIds.length > 0) {
        const values = menuIds.map(menuId => [roleId, menuId])
        await connection.query('INSERT INTO role_menu (role_id, menu_id) VALUES ?', [values])
      }
      await connection.commit()
      return true
    } catch (err) {
      await connection.rollback()
      throw err
    } finally {
      connection.release()
    }
  }

  /**
   * 获取角色关联的所有菜单 ID
   */
  static async getRoleMenuIds(roleId) {
    const [rows] = await db.query(
      'SELECT menu_id FROM role_menu WHERE role_id = ?',
      [roleId]
    )
    return rows.map(row => row.menu_id)
  }

  /**
   * 删除角色时清理关联数据
   */
  static async cleanRoleRelations(roleId) {
    await db.query('DELETE FROM role_menu WHERE role_id = ?', [roleId])
    await db.query('DELETE FROM user_role WHERE role_id = ?', [roleId])
  }

  /**
   * 删除菜单时清理 role_menu 中的引用
   */
  static async cleanMenuRelations(menuId) {
    await db.query('DELETE FROM role_menu WHERE menu_id = ?', [menuId])
  }

  /**
   * 删除用户时清理角色关联
   */
  static async cleanUserRelations(userId) {
    await db.query('DELETE FROM user_role WHERE user_id = ?', [userId])
  }
}
