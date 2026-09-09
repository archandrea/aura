-- RBAC「menu 即权限」改造迁移（幂等，可重复执行）
-- 适用：从旧 schema（permission/role_permission 独立表 + 旧 menu 表）升级
-- 执行：mysql -u<user> -p < server/sql/migrations/20260903_rbac_menu_as_permission.sql
-- 注意：会重建 menu 表并重放种子数据，手工自定义过的菜单会重置为种子内容

USE `aura`;

-- 1. 删除废弃的旧表
DROP TABLE IF EXISTS role_permission;
DROP TABLE IF EXISTS permission;

-- 2. 旧 menu 表结构（含 permission_id 外键）与新 schema 不兼容，直接重建
DROP TABLE IF EXISTS menu;
CREATE TABLE menu (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    permission VARCHAR(100) DEFAULT NULL,
    path VARCHAR(255) DEFAULT NULL,
    icon VARCHAR(100) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    type ENUM('directory', 'menu', 'button') DEFAULT 'menu',
    visible TINYINT(1) DEFAULT 1,
    status TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_parent_id (parent_id),
    INDEX idx_permission (permission)
);

-- 3. role_menu（新装库可能已建，IF NOT EXISTS 兜底）
CREATE TABLE IF NOT EXISTS role_menu (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    menu_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_role_menu (role_id, menu_id),
    INDEX idx_role_id (role_id),
    INDEX idx_menu_id (menu_id)
);

-- 4. user_role 结构兜底（若报 Duplicate key name / Duplicate column 说明已存在，忽略即可）
-- ALTER TABLE user_role ADD UNIQUE KEY uk_user_role (user_id, role_id);
-- ALTER TABLE user_role ADD INDEX idx_user_id (user_id);
-- ALTER TABLE user_role ADD INDEX idx_role_id (role_id);

-- 5. 重放菜单种子（与 init.sql 完全一致，改菜单时两处同步）
--    业务菜单与前端侧边栏对应：Chat / Note(New Note, My Notes) / System(Setting, Model Config)
INSERT IGNORE INTO menu (id, parent_id, name, code, permission, path, icon, sort_order, type, visible) VALUES
(1,  NULL, 'Chat',         'chat',         NULL, '/chat',                 'OpenAIFilled',  1, 'menu',      1),
(10, NULL, 'Note',         'note',         NULL, NULL,                    'BookOutlined',  2, 'directory', 1),
(11, 10,   'New Note',     'note_new',     NULL, '/note/edit',            NULL,            1, 'menu',      1),
(12, 10,   'My Notes',     'note_list',    NULL, '/note',                 NULL,            2, 'menu',      1),
(20, NULL, 'System',       'config',       NULL, NULL,                    'SettingFilled', 3, 'directory', 1),
(21, 20,   'Setting',      'setting',      NULL, '/setting',              NULL,            1, 'menu',      1),
(22, 20,   'Model Config', 'model_config', NULL, '/setting/model-config', NULL,            2, 'menu',      1),
-- 管理菜单
(100, NULL, '系统管理', 'admin', NULL, NULL, NULL, NULL, 10, 'directory', 1),
(101, 100, '用户管理', 'user',       'user:list',              '/admin/users', NULL, 1, 'menu', 1),
(102, 101, '查看用户', 'user_read',       'user:read',              NULL, NULL, 1, 'button', 1),
(103, 101, '新增用户', 'user_create',     'user:create',            NULL, NULL, 2, 'button', 1),
(104, 101, '编辑用户', 'user_update',     'user:update',            NULL, NULL, 3, 'button', 1),
(105, 101, '删除用户', 'user_delete',     'user:delete',            NULL, NULL, 4, 'button', 1),
(106, 101, '分配角色', 'user_assign_role','user:assign_role',       NULL, NULL, 5, 'button', 1),
(120, 100, '角色管理', 'role',       'role:list',              '/admin/roles', NULL, 2, 'menu', 1),
(121, 120, '新增角色', 'role_create',     'role:create',            NULL, NULL, 1, 'button', 1),
(122, 120, '编辑角色', 'role_update',     'role:update',            NULL, NULL, 2, 'button', 1),
(123, 120, '删除角色', 'role_delete',     'role:delete',            NULL, NULL, 3, 'button', 1),
(124, 120, '分配权限', 'role_assign_perm','role:assign_permission', NULL, NULL, 4, 'button', 1),
(140, 100, '菜单管理', 'menu',       'menu:list',              '/admin/menus', NULL, 3, 'menu', 1),
(141, 140, '新增菜单', 'menu_create',     'menu:create',            NULL, NULL, 1, 'button', 1),
(142, 140, '编辑菜单', 'menu_update',     'menu:update',            NULL, NULL, 2, 'button', 1),
(143, 140, '删除菜单', 'menu_delete',     'menu:delete',            NULL, NULL, 3, 'button', 1);

-- 6. 重放角色-菜单关联
-- member：业务菜单（目录必须与子菜单一并授权，否则子菜单会脱离树结构）
INSERT IGNORE INTO role_menu (role_id, menu_id)
SELECT r.id, m.id FROM role r, menu m WHERE r.code = 'member' AND m.id IN (1, 10, 11, 12, 20, 21, 22);
-- admin：系统管理目录 + 用户/角色/菜单管理（含所有 button）
INSERT IGNORE INTO role_menu (role_id, menu_id)
SELECT r.id, m.id FROM role r, menu m WHERE r.code = 'admin' AND m.id IN (
  100, 101, 102, 103, 104, 105, 106, 120, 121, 122, 123, 124, 140, 141, 142, 143
);
-- super_admin：拥有所有菜单（代码层对 super_admin 全局放行 + 查询层实体化，此处兜底）
INSERT IGNORE INTO role_menu (role_id, menu_id)
SELECT r.id, m.id FROM role r, menu m WHERE r.code = 'super_admin';

-- 7. 历史无角色用户回填 member
INSERT IGNORE INTO user_role (user_id, role_id)
SELECT u.id, r.id FROM user u, role r
WHERE r.code = 'member'
  AND u.id NOT IN (SELECT DISTINCT user_id FROM user_role);

-- 8. 首用户 super_admin 兜底
INSERT IGNORE INTO user_role (user_id, role_id)
SELECT 1, r.id FROM role r WHERE r.code = 'super_admin' AND EXISTS (SELECT 1 FROM user WHERE id = 1);

-- 9. 历史脏数据清理：工作区挂载的他人模型配置置空（模型归属校验生效前的遗留）
UPDATE workspace w JOIN model_config mc ON w.model_id = mc.id
SET w.model_id = NULL WHERE mc.user_id <> w.user_id;
