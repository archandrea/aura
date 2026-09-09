# Aura 工作台改版 · 原型交付

UI 原型（16 屏 + 1 个弹窗态）已导出为 PNG（2x，1440×900），供前端开发直接对照实现。
设计源文件：Ardot `Aura 工作台改版原型` — https://ardot.tencent.com/file/723970175272232

配套文档：`docs/frontend-workspace-redesign-dev-doc.md`（改造方案）、`docs/aura-ui-redesign-options.html`（A/B 草图）。

---

## 一、方案边界

| 方案 | 定位 | 覆盖界面 | 结构特征 |
|---|---|---|---|
| **A** | 系统**入口与门户** | 01 登录、02 注册、03 项目工作台、04 空状态、05/05b 新建项目 | 深色模块导航 Rail（72px）+ 项目侧栏（260px）+ 概览主区；强调"先选项目再进入" |
| **B** | 系统**主体验** | 06 推进页、07 空会话、08 笔记库、09 笔记编辑、10 设置、11 模型配置、12–14 系统管理 | 三栏沉浸式：左项目列表 / 中内容推进 / 右上下文沉淀 |
| 全局 | 所有界面共用 | 15 状态与反馈 | 状态色、空状态、骨架屏、Toast、校验、二次确认 |

**衔接方式**：用户从 A 方案的入口（登录 → 工作台）选定项目后，进入 B 方案的三栏工作区；B 方案左栏沿用 A 的项目列表与状态胶囊，保证"选项目"这一动作在两个方案里位置与语义一致。A 的深色 Rail 只在入口层出现，进入 B 后降级为左栏顶部的轻量模块切换，避免两套导航并存。

---

## 二、屏幕清单与代码映射

改动类型：**新增** = 现无此页面需新建；**重构** = 结构/布局重写；**改造** = 沿用现有结构，替换视觉与信息密度。

| 图 | 界面 | 方案 | 目标路由 | 现有代码 | 改动 |
|---|---|---|---|---|---|
| `00-cover.png` | 封面与索引 | — | — | — | 索引页 |
| `01-login-A.png` | 登录 | A | `/login` | `interface/src/pages/login/index.tsx` | 改造 |
| `02-register-A.png` | 注册 | A | `/login`（切换态） | `interface/src/pages/login/index.tsx` | 改造 |
| `03-workspace-A.png` | 项目工作台 | A | `/`（现重定向到 `/chat`） | `interface/src/pages/index.tsx` | **新增** |
| `04-workspace-empty-A.png` | 工作台空状态 | A | `/` | `interface/src/pages/index.tsx` | **新增** |
| `05-new-project-A.png` | 新建/编辑项目（底图） | A | `/` | `interface/src/pages/index.tsx` | **新增** |
| `05b-new-project-modal-A.png` | 新建项目弹窗态 | A | `/` | 同上 | **新增** |
| `06-project-advance-B.png` | 项目推进页 | B | `/chat` | `interface/src/pages/chat/index.tsx` | 重构 |
| `07-chat-empty-B.png` | 推进页空会话 | B | `/chat` | `interface/src/pages/chat/index.tsx` | 重构 |
| `08-note-library-B.png` | 笔记库 | B | `/note` | `interface/src/pages/note/index.tsx` | 重构 |
| `09-note-editor-B.png` | 笔记编辑 | B | `/note/edit/:id?` | `interface/src/pages/note/edit.tsx` | 重构 |
| `10-settings-B.png` | 设置首页 | B | `/setting` | `interface/src/pages/setting/index.tsx` | 改造 |
| `11-model-config-B.png` | 模型配置 | B | `/setting/model-config` | `interface/src/pages/setting/model-config.tsx` | 改造 |
| `12-admin-users-B.png` | 用户管理 | B | `/admin/users` | `interface/src/pages/admin/users/index.tsx` | 改造 |
| `13-admin-roles-B.png` | 角色管理（含权限矩阵） | B | `/admin/roles` | `interface/src/pages/admin/roles/index.tsx` | 改造 |
| `14-admin-menus-B.png` | 菜单管理（树形表格） | B | `/admin/menus` | `interface/src/pages/admin/menus/index.tsx` | 改造 |
| `15-states-feedback.png` | 状态与反馈规范 | 全局 | — | 建议新建 `components/ui/*` | **新增** |

> 当前 `pages/index.tsx` 仅做 `redirect('/chat')`，改版后需承载真正的项目工作台，这是本次改动量最大的一块。

---

## 三、各屏关键实现点

### 方案 A（入口）
- **01/02 登录注册**：左右分栏，左侧品牌区（主色底 + 产品价值点），右侧表单；表单控件高 38px，圆角 8px。
- **03 工作台**：72px 深色 Rail（工作台/笔记/设置/管理 + 底部头像）+ 260px 项目侧栏（搜索 + 项目列表，含状态胶囊）+ 主区（页面标题、4 个统计卡、状态筛选、项目卡网格）。
- **04 空状态**：主区替换为居中插画 + "新建项目"主按钮（见 `15-states-feedback.png` 空状态规范）。
- **05b 弹窗**：560px 宽，页面内边距 28px，底部按钮右对齐；遮罩 `rgba(22,32,42,.45)`。

### 方案 B（主体验）
- **06 推进页**：左 280 / 中自适应 / 右 320。左栏 = 品牌行 + 模块导航 + 项目列表 + 用户栏；中栏 = 项目头 + 消息流 + 输入区；右栏 = 项目卡 + 会话分组 + 已沉淀结论。
- **07 空会话**：中栏居中引导，右栏展示"尚未沉淀"占位。
- **08/09 笔记**：08 为三栏（左筛选 280 / 中列表 / 右标签统计 300）；09 为编辑器三栏（左笔记列表 260 / 中编辑区 / 右属性与大纲 300）。
- **10/11 设置**：左 280 设置导航（设置 / 系统管理两个分组），右主区。
- **12–14 系统管理**：统一"标题 + 筛选栏 + 表格/树 + 分页"骨架；13 额外含权限矩阵，14 为可展开树形表格（子项用 `↳` 缩进，含显示/隐藏态）。

### 全局（15）
状态胶囊（项目 3 态 + 会话 3 态）、按钮三态、输入框三态（默认/聚焦/禁用）、空状态、骨架屏、加载中按钮、Toast（成功/错误）、表单校验提示、二次确认。

---

## 四、设计 Token

- `tokens.css` — CSS 变量，可直接引入或在 Tailwind theme 中引用
- `tokens.json` — 结构化 token，含状态色语义（项目/会话状态对应文案与配色）

核心色：主色 `#2266D1`、进行中 `#2F7D5C`、已暂停 `#AD6D18`、已归档 `#6B7785`、失败 `#C0392B`、深色 Rail `#18222D`、画布 `#F5F7F9`、主文字 `#16202A`。

---

## 五、建议实施顺序

1. **基础层**：落地 `tokens.css`，抽 `components/ui`（Button / Input / Badge / Modal / Toast / Skeleton），按 `15-states-feedback.png` 对齐。
2. **入口层（A）**：登录注册 → 项目工作台 → 新建项目弹窗（含 03 新增页面与 project 数据模型）。
3. **主体验（B）**：推进页三栏 → 空会话 → 笔记库/编辑。
4. **设置与管理**：设置首页 → 模型配置 → 用户/角色/菜单管理（三屏同构，可复用同一套列表页组件）。

---

## 六、在线预览

`index.html` 为本地预览页，直接双击在浏览器打开即可按序浏览全部界面。
