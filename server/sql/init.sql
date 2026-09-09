CREATE DATABASE IF NOT EXISTS `aura`;
USE `aura`;

CREATE TABLE IF NOT EXISTS user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_email (email)
);

CREATE TABLE IF NOT EXISTS role (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
);

INSERT IGNORE INTO
    role (
        id,
        name,
        code,
        description,
        is_system
    )
VALUES (
        1,
        'super_admin',
        'super_admin',
        'Super administrator',
        1
    );

INSERT IGNORE INTO
    role (
        id,
        name,
        code,
        description,
        is_system
    )
VALUES (
        2,
        'admin',
        'admin',
        'Administrator',
        1
    );

INSERT IGNORE INTO
    role (
        id,
        name,
        code,
        description,
        is_system
    )
VALUES (
        3,
        'member',
        'member',
        'Basic role',
        1
    );

-- ===================== RBAC 表 =====================
-- 设计：Menu 即 Permission。menu 表自带 permission 字符串字段，
-- 没有独立 permission 表；角色通过 role_menu 关联菜单/权限。

-- user_role：补充唯一约束与索引，结构变更直接重建（无外键约束，安全）
CREATE TABLE IF NOT EXISTS user_role (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_role (user_id, role_id),
    INDEX idx_user_id (user_id),
    INDEX idx_role_id (role_id)
);

CREATE TABLE IF NOT EXISTS menu (
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

-- ===================== RBAC 种子数据 =====================

-- 1. 菜单/权限树（directory 无权限码，menu 页面级权限，button 操作级权限）
--    业务菜单与前端侧边栏对应：Chat / Note(New Note, My Notes) / System(Setting, Model Config)
--    icon 存 antd 图标组件名，前端按 ICON_MAP[icon] 渲染；name 为纯展示字段，可随意改名
--    id 分配：业务菜单 1-99，管理菜单 100 起，各管理页间隔 20 预留扩展
INSERT IGNORE INTO menu (id, parent_id, name, code, permission, path, icon, sort_order, type, visible) VALUES
-- 业务菜单
(1,  NULL, 'Chat',         'chat',         NULL, '/chat',                 'OpenAIFilled',  1, 'menu',      1),
(10, NULL, 'Note',         'note',         NULL, NULL,                    'BookOutlined',  2, 'directory', 1),
(11, 10,   'New Note',     'note_new',     NULL, '/note/edit',            NULL,            1, 'menu',      1),
(12, 10,   'My Notes',     'note_list',    NULL, '/note',                 NULL,            2, 'menu',      1),
(20, NULL, 'System',       'config',       NULL, NULL,                    'SettingFilled', 3, 'directory', 1),
(21, 20,   'Setting',      'setting',      NULL, '/setting',              NULL,            1, 'menu',      1),
(22, 20,   'Model Config', 'model_config', NULL, '/setting/model-config', NULL,            2, 'menu',      1),
-- 系统管理（目录）
(100, NULL, '系统管理', 'admin', NULL, NULL, NULL, 10, 'directory', 1),
-- 用户管理（菜单页 + 按钮）
(101, 100, '用户管理', 'user',       'user:list',              '/admin/users', NULL, 1, 'menu', 1),
(102, 101, '查看用户', 'user_read',       'user:read',              NULL, NULL, 1, 'button', 1),
(103, 101, '新增用户', 'user_create',     'user:create',            NULL, NULL, 2, 'button', 1),
(104, 101, '编辑用户', 'user_update',     'user:update',            NULL, NULL, 3, 'button', 1),
(105, 101, '删除用户', 'user_delete',     'user:delete',            NULL, NULL, 4, 'button', 1),
(106, 101, '分配角色', 'user_assign_role','user:assign_role',       NULL, NULL, 5, 'button', 1),
-- 角色管理（菜单页 + 按钮）
(120, 100, '角色管理', 'role',       'role:list',              '/admin/roles', NULL, 2, 'menu', 1),
(121, 120, '新增角色', 'role_create',     'role:create',            NULL, NULL, 1, 'button', 1),
(122, 120, '编辑角色', 'role_update',     'role:update',            NULL, NULL, 2, 'button', 1),
(123, 120, '删除角色', 'role_delete',     'role:delete',            NULL, NULL, 3, 'button', 1),
(124, 120, '分配权限', 'role_assign_perm','role:assign_permission', NULL, NULL, 4, 'button', 1),
-- 菜单管理（菜单页 + 按钮）
(140, 100, '菜单管理', 'menu',       'menu:list',              '/admin/menus', NULL, 3, 'menu', 1),
(141, 140, '新增菜单', 'menu_create',     'menu:create',            NULL, NULL, 1, 'button', 1),
(142, 140, '编辑菜单', 'menu_update',     'menu:update',            NULL, NULL, 2, 'button', 1),
(143, 140, '删除菜单', 'menu_delete',     'menu:delete',            NULL, NULL, 3, 'button', 1);

-- 2. 角色-菜单关联
-- member：业务菜单（目录必须与子菜单一并授权，否则子菜单会脱离树结构）
INSERT IGNORE INTO role_menu (role_id, menu_id)
SELECT r.id, m.id FROM role r, menu m
WHERE r.code = 'member' AND m.id IN (1, 10, 11, 12, 20, 21, 22);

-- admin：系统管理目录 + 用户/角色/菜单管理（含所有 button）
INSERT IGNORE INTO role_menu (role_id, menu_id)
SELECT r.id, m.id FROM role r, menu m
WHERE r.code = 'admin' AND m.id IN (
  100,
  101, 102, 103, 104, 105, 106,
  120, 121, 122, 123, 124,
  140, 141, 142, 143
);

-- super_admin：拥有所有菜单（代码层面对 super_admin 全局放行，此处兜底）
INSERT IGNORE INTO role_menu (role_id, menu_id)
SELECT r.id, m.id FROM role r, menu m
WHERE r.code = 'super_admin';

-- 3. 初始化首个 super_admin 用户
--    默认密码 Admin_123456（bcrypt 加密存储），首次登录后请及时修改
INSERT IGNORE INTO user (id, name, email, password) VALUES
(1, 'admin', 'admin@aura.com', '$2b$10$AfSPWLHuNeqny89grp.U6.9aNXg7cHJXKYhX9zY2CGLpNXLSa2/x6');

INSERT IGNORE INTO user_role (user_id, role_id)
SELECT 1, r.id FROM role r
WHERE r.code = 'super_admin'
  AND EXISTS (SELECT 1 FROM user WHERE id = 1);

CREATE TABLE IF NOT EXISTS workspace (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    use_default_model TINYINT(1) NOT NULL DEFAULT 1,
    model_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workspace_id INT NOT NULL,
    proposer VARCHAR(255) NOT NULL,
    model_id INT,
    model_snapshot JSON DEFAULT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS note (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(50) NOT NULL,
    keywords JSON DEFAULT NULL,
    description VARCHAR(255) DEFAULT NULL,
    cover VARCHAR(255) DEFAULT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    base_url VARCHAR(255),
    api_key VARCHAR(255),
    model_name VARCHAR(100) NOT NULL,
    temperature DECIMAL(3, 2) DEFAULT 0.7,
    max_tokens INT DEFAULT 2048,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    default_model_id INT NOT NULL,
    system_prompt TEXT DEFAULT NULL,
    auto_save_interval INT DEFAULT 0,
    language VARCHAR(20) DEFAULT 'zh-CN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);