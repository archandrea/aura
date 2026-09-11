# MCP 笔记检索开发计划（新手向）

> 目标：让 AI 对话可以检索当前用户的笔记，回答时能引用笔记内容——落地产品规划里的"知识可回链"和"项目级记忆"。
> 前置要求：跑得通 `pnpm dev:server` + `pnpm dev`，会用 `.http` 文件或 curl 调接口，读过 `docs/redis-integration-plan.md`（本计划沿用它的节奏：分阶段、每阶段独立提交）。

---

## 0. 这份计划怎么用

### 0.1 总览

| 阶段 | 功能点 | 学到的核心模式 | 难度 | 预计耗时 |
|---|---|---|---|---|
| 0 | 地基修缮：修 chat 现有 bug + happy-path 冒烟测试 | 模型 mock 测试 | ★★ | 半天 |
| 1 | `Note.findByKeywords` + 归属安全查询 | JSON 列检索、信任边界 | ★★ | 半天 |
| 2 | 工具定义 + 非流式接入 | **Tool Calling 完整循环**（本计划核心） | ★★★ | 1~2 天 |
| 3 | 流式信封协议 + 前端引用回链 | SSE 协议设计、增量解析 | ★★★ | 1 天 |
| 4 | 可选进阶：缓存 / 真 MCP Server / 对话沉淀 | — | 不排期 |

每个阶段独立提交一个 git commit，出问题可以单独回滚。

### 0.2 名词澄清：我们要做的其实不是（字面意义的）MCP

路线图里这个模块叫"MCP 笔记检索工具"，动工前先把概念摆正：

- **Tool Calling（工具调用）**：大模型 API 的原生能力。你在请求里声明一批"工具"（名字 + 参数 schema + 说明），模型判断需要时返回"请帮我执行 search_notes，参数是 xxx"，**由你的代码执行**后把结果喂回去，模型再继续生成。整个循环发生在你的进程内。
- **MCP（Model Context Protocol）**：Anthropic 提出的开放协议，把"工具/资源"做成**独立进程或独立服务**（stdio / HTTP），任何支持 MCP 的客户端（Claude Desktop、Cursor、其他 IDE）都能挂载。它解决的是"一次实现，处处挂载"。

本计划做的是 **Tool Calling**——工具和 Express 跑在同一个进程里，直接查 MySQL。这是个人项目现阶段性价比最高的选择：没有进程间通信、没有额外部署、调试直接断点。

两者的代码结构其实高度重合：工具的"定义 + 执行器"写好之后，包一层 `@modelcontextprotocol/sdk` 就能升级成真正的 MCP Server（见阶段 4.2）。所以目录命名沿用路线图的 `server/mcp/`，但你要清楚：**现在写的是 in-process 工具，不是 MCP 协议服务**。

### 0.3 贯穿全程的三条纪律

1. **工具执行没有中间件保护，SQL 必须自带 `user_id`**。
   HTTP 端点有 `requireOwnership` 挡在前面，但工具的 `execute` 是被 AI SDK 在进程内直接调用的，express 的中间件链完全管不到它。模型返回的 `noteId` 是"模型说了算"的输入，**绝对不能**拿它直接 `Note.findById`（这个方法不看 user_id，见 1.3）。
2. **检索结果必须裁剪，token 是花钱的**。
   `note.content` 是 TEXT 全文，一次检索命中 5 篇长笔记就可能塞进去几万 token。原则：搜索工具只返回摘要（标题/描述/关键词），全文按需通过第二个工具取，且全文也截断。
3. **每加一个行为，就要有对应的测试**。
   工具是纯函数（传 `user`，返回数据），测试成本极低；端点行为用 `MockLanguageModelV3`（`ai/test` 自带）mock 模型，不花一分钱。

### 0.4 开工前的现状清点

已就绪的条件：

| 条件 | 现状 |
|---|---|
| note 表有 `keywords JSON` 列 | `sql/init.sql:211`，但**没有任何写入口**（create/update 只写 title/content/description），检索仍以标题/描述命中为主 |
| `Note.findByKeywords` 是 TODO 空桩 | `server/models/note.js:62`，本计划阶段 1 实现 |
| AI SDK 版本 | `ai@6.0.69`（v6，API 已按实际安装版本核实，见附录 A） |
| 对话限流/鉴权 | `POST /api/chat/:workspaceId` 已挂 `rateLimit` + `requireOwnership`，工具不改变这条链路 |

**动工前发现的 3 个现有问题**（阶段 0 处理前两个，第三个阶段 3 顺带）：

1. **`server/endpoints/chat.js:71` 引用了未声明的 `modelId`** —— `Chat.create({ workspaceId, modelId, ... })` 里这个变量在作用域里不存在，ESM 严格模式下会直接抛 `ReferenceError`。也就是说：**POST /api/chat 的成功路径目前是坏的（500）**。现有测试只覆盖 403/400 分支（`test/chat.test.js` 全是越权场景），所以没暴露。
2. **历史消息取的是"最旧的 20 条"** —— `chat.js:76-96` 用 `page: 1 + orderDir: 'asc'` 分页，第 1 页升序 = 最早 20 条。对话超过 20 条后，模型看到的反而是开头的消息、丢失最近上下文；而且刚插入的当前消息会被再手动 append 一次（重复）。
3. **非流式响应结构与前端读取不匹配** —— 后端 `data` 直接返回字符串（`chat.js:107`），前端 `handleChat` 却读 `res.data.content`（`pages/chat/index.tsx:251`）。当前主路径是流式所以没炸；阶段 3 统一成 `{ content, references }` 后自然修复。

---

## 阶段 0：地基修缮（先让现有链路可靠，再往上盖）

### 0.1 为什么先修 bug

工具调用建立在"消息历史 → 模型 → 落库"这条链路上。这条链路现在有 ReferenceError，不修的话阶段 2 的所有验证都会撞在同一堵墙上；而且 happy-path 没有任何测试，是"一改就坏"的典型死角。

### 0.2 修复 1：`modelId` ReferenceError

`workspace` 上挂载的配置就是本次对话用的配置，取 `modelConfig.id`：

```js
// server/endpoints/chat.js —— POST /:workspaceId 处理器内
await Chat.create({
  workspaceId,
  modelId: modelConfig.id,   // 原来是裸的 modelId（未声明，ReferenceError）
  content,
  proposer: 'user'
})
```

### 0.3 修复 2：历史窗口改为"最新 20 条、时间正序"

```js
await Chat.create({ workspaceId, modelId: modelConfig.id, content, proposer: 'user' })

// 最新 20 条（含刚插入的这条），desc 取完再 reverse 回时间正序
const { rows } = await Chat.findByWorkspaceId(workspaceId, {
  pagination: { page: 1, pageSize: 20 },
  sort: { orderBy: 'created_at', orderDir: 'desc' }
})

const messages = rows.reverse().map(item => ({
  role: item.proposer,
  content: item.content,
}))
```

对比原代码的三个变化：`asc` → `desc`（取最新）；取完 `reverse()`（喂给模型时仍是正序）；**删掉手动 append 当前消息**（它已经在 rows 里了，原来会被发两遍）。

### 0.4 补 happy-path 冒烟测试

不 mock 模型的话，测试会真的去调远端 API——所以要用 AI SDK 自带的测试工具。在 `server/test/` 新建 `chat-happy-path.test.js`：

```js
import { vi, beforeAll, describe, expect, it } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'

// vi.mock 会被提升到文件顶部执行，app.js 是在 helpers.getApp() 里懒加载的，
// 所以这里能稳定地把 createModelInstance 换成假模型
vi.mock('../utils/model-factory.js', () => ({
  createModelInstance: () =>
    new MockLanguageModelV3({
      doGenerate: {
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 10 },
        content: [{ type: 'text', text: 'mocked reply' }],
      },
    }),
}))

import { getRequest, registerAndLogin, authHeader } from './helpers.js'

let request

beforeAll(async () => {
  request = await getRequest()
})

describe('对话 happy path', () => {
  it('发消息后落库并返回模型回复', async () => {
    const { token } = await registerAndLogin()
    const model = await request.post('/api/model-config').set(authHeader(token)).send({
      provider: 'openai',
      modelName: 'gpt-4o-mini',
    })
    const ws = await request.post('/api/workspace').set(authHeader(token)).send({ title: 't' })
    await request.put(`/api/workspace/${ws.body.data.id}`).set(authHeader(token)).send({
      modelId: model.body.data?.id ?? model.body.data,
    })

    const res = await request
      .post(`/api/chat/${ws.body.data.id}`)
      .set(authHeader(token))
      .send({ content: 'hi', stream: false })

    expect(res.status).toBe(200)
    expect(res.body.data).toBe('mocked reply')

    const list = await request.get(`/api/chat/list/${ws.body.data.id}`).set(authHeader(token))
    const proposers = list.body.data.rows.map((r) => r.proposer)
    expect(proposers).toContain('user')
    expect(proposers).toContain('assistant')
  })
})
```

讲解两个知识点：

- **`MockLanguageModelV3`（注意是 V3）**：`ai/test` 导出的假 `LanguageModel`。`doGenerate` 可以直接给一个结果对象，也可以给数组（第 N 次调用返回第 N 个结果——阶段 2 模拟"先工具调用、后文本回答"就靠数组形式）。
- **`vi.mock` 模块替换**：vitest 把 `utils/model-factory.js` 整个换成假实现。因为 `helpers.js` 里 app 是懒加载的，mock 一定先生效。这个套路后面每个阶段都复用。

### 0.5 验收清单

- [ ] `pnpm test:server` 全绿（含新冒烟测试；修 bug 前它应该先红一次，确认测试真的能抓到 ReferenceError）
- [ ] 手动：配一个真实模型，对话一轮，消息列表里用户/助手消息各一条、无重复
- [ ] git commit

---

## 阶段 1：`Note.findByKeywords` + 归属安全查询（Model 层）

### 1.1 概念：JSON 列怎么参与 LIKE 检索

`note.keywords` 是 MySQL 的 JSON 类型。让"关键词"参与模糊匹配，最简单的办法是把 JSON 整体转成字符串再 LIKE：

```sql
CAST(keywords AS CHAR) LIKE '%redis%'
-- 存的是 ["redis","缓存"]，转成字符串后是 '["redis", "缓存"]'，LIKE '%redis%' 命中
```

这是个人项目量级（单用户笔记数百条以内）完全够用的方案。**不要**一上来就上 MySQL FULLTEXT 索引或向量检索：FULLTEXT 对中文分词不友好、向量检索要引入 embedding——它们都在阶段 4 的进阶清单里，等"检索不准"真的成为痛点再上。

另外注意 `Note.filterFields`（`models/note.js:6`）会剥掉 `content` 字段——这正好符合纪律 2（不给模型塞全文）。我们的检索 SQL 干脆**不查 content 列**，从源头省 token。

### 1.2 实现 `findByKeywords`

```js
// server/models/note.js —— 替换掉那个 TODO 空桩
static async findByKeywords(user, keyword, { limit = 5 } = {}) {
  if (!user?.id) {
    throw new Error('userId is required')
  }
  if (!keyword || typeof keyword !== 'string') {
    throw new Error('keyword is required')
  }

  const pattern = `%${keyword}%`
  // 刻意不查 content：搜索工具只给模型看摘要，全文用 get_note_detail 按需取
  const baseSql = `
    SELECT id, title, description, keywords, updated_at
    FROM note
    WHERE user_id = ?
      AND (
        title LIKE ?
        OR description LIKE ?
        OR CAST(keywords AS CHAR) LIKE ?
      )
    ORDER BY updated_at DESC
    LIMIT ?
  `
  const [rows] = await db.query(baseSql, [user.id, pattern, pattern, pattern, limit])
  return rows.map(this.filterFields)
}
```

（`updated_at DESC`：同一条笔记多版本更新时，优先召回新内容。）

可选加餐（本阶段不做也行）：给 `Note.create`/`Note.update` 加 `keywords` 参数（前端传数组，落库 `JSON.stringify(arr)`），否则 keywords 列永远为 NULL。做的话记得同步放开 `endpoints/note.js` 的字段校验。

### 1.3 实现 `findByIdAndUser`（信任边界的关键一课）

现有 `Note.findById`（`models/note.js:66`）**只按 id 查、不看 user_id**——HTTP 路径上安全，因为有 `requireOwnership` 中间件先挡了一道；但阶段 2 的工具没有这道闸，模型的输入不可信。所以补一个带归属的变体，**工具路径只用这个**：

```js
// server/models/note.js
static async findByIdAndUser(id, user) {
  if (!id) {
    throw new Error('id is required')
  }
  if (!user?.id) {
    throw new Error('userId is required')
  }
  const [rows] = await db.query(
    'SELECT * FROM note WHERE id = ? AND user_id = ?',
    [id, user.id]
  )
  return rows[0] || null
}
```

为什么不直接改 `findById` 加 user_id 参数？因为它同时被 `endpoints/note.js` 的多个处理器用，那些路径已由中间件保证归属；两条路径职责不同，分开方法比改签名影响面小。

### 1.4 测试

新建 `server/test/note-keywords.test.js`，重点测**跨用户隔离**：

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { getRequest, registerAndLogin, authHeader } from './helpers.js'

let request
beforeAll(async () => { request = await getRequest() })

const createNote = async (token, note) => {
  const res = await request.post('/api/note').set(authHeader(token)).send(note)
  expect(res.status).toBe(200)
  return res.body.data
}

describe('Note.findByKeywords 归属隔离', () => {
  it('只返回当前用户的笔记', async () => {
    const alice = await registerAndLogin()
    const bob = await registerAndLogin()
    await createNote(alice.token, {
      title: 'Alice 的 Redis 笔记',
      content: 'cache-aside 模式',
      description: 'redis 学习',
    })
    await createNote(bob.token, {
      title: 'Bob 的 Redis 笔记',
      content: '不该被 Alice 的工具搜到',
      description: 'redis',
    })

    // 直接调用 Model 层（工具路径的真实入口），绕过 HTTP
    const { default: Note } = await import('../models/note.js')
    const rows = await Note.findByKeywords(
      { id: /* alice 的 userId，从 profile 接口取 */ 1 },
      'redis'
    )
    expect(rows.length).toBe(1)
    expect(rows[0].title).toBe('Alice 的 Redis 笔记')
  })
})
```

（alice 的 userId：`registerAndLogin` 返回值里没有的话，调 `GET /api/user/profile` 取，或扩展 helpers 返回 id。）

### 1.5 验收清单

- [ ] Alice/Bob 隔离测试通过
- [ ] `findByKeywords` 对 `keywords` 为 NULL 的笔记不报错（NULL LIKE 是 NULL，被 OR 短路，验证一下）
- [ ] `pnpm test:server` 全绿；git commit

---

## 阶段 2：工具定义 + 非流式接入（本计划的核心）

### 2.1 概念：Tool Calling 的完整循环

不带工具时，`generateText` 是一问一答。带上工具后变成一个**多步循环**：

```
用户消息 + 历史消息 + 工具定义
        ↓
   模型第一次生成 ── finishReason: 'tool-calls'
        │  "我需要调 search_notes(query='redis 缓存')"
        ↓
   你的 execute 函数跑 SQL，返回结果 ──── 这一步 100% 发生在你的进程里
        ↓
   模型第二次生成（带着工具结果）
        │  "根据你的笔记《Redis 学习计划》……"
        ↓
   finishReason: 'stop' → 循环结束，result.text 汇总所有文本
```

三个关键认知：

1. **循环不是你写的**。`generateText`/`streamText` 内部自动执行"调工具→喂结果→再生成"，你只提供 `tools`。但循环要有刹车：`stopWhen: stepCountIs(5)` 限制最多 5 步，防止模型陷入"检索→不满意→再检索"的死循环烧 token。
2. **工具的 description 是写给模型看的提示词**，模型完全靠它决定"什么时候调、传什么参数"。写清楚触发条件，比任何代码都影响效果。
3. **模型可能一次都不调工具**（问题与笔记无关时），这是正确行为，不要强迫。

### 2.2 安装 zod

工具参数 schema 用 zod 描述（AI SDK 只认 zod / Standard Schema）：

```bash
pnpm --filter aura-server add zod
```

### 2.3 新建 `server/mcp/` 目录

```text
server/mcp/
├── index.js              # buildNoteTools(user, hooks)：工具工厂
├── prompts.js            # 工具使用的 system prompt
└── tools/
    ├── search-notes.js   # 按关键词搜笔记，返回摘要列表
    └── get-note-detail.js# 按 id 取笔记全文（归属校验）
```

**为什么是工厂函数而不是常量**：工具的 `execute` 里要用 `user.id` 查库——每个请求的用户不同，所以工具必须按请求构建（这就是纪律 1 的落地方式：把用户身份"焊"进闭包里）。

`server/mcp/tools/search-notes.js`：

```js
import { tool } from 'ai'
import { z } from 'zod'
import Note from '../../models/note.js'

export function searchNotesTool(user, hooks = {}) {
  const { onNoteFound } = hooks
  return tool({
    description:
      '在当前用户的笔记库中按关键词检索笔记，返回匹配的笔记摘要列表（标题、描述、关键词、更新时间）。' +
      '当用户的问题可能与其已有笔记、历史结论、之前记录的知识相关时，先调用本工具检索。',
    parameters: z.object({
      query: z.string().min(1).describe('检索关键词，建议 1~4 个词，优先用笔记标题里的词'),
      limit: z.number().int().min(1).max(10).optional().describe('返回条数，默认 5'),
    }),
    execute: async ({ query, limit = 5 }) => {
      try {
        const notes = await Note.findByKeywords(user, query, { limit })
        // 引用收集：每命中一条就通知外部（chat 端用它组装 references 回传前端）
        notes.forEach((n) => onNoteFound?.({ id: n.id, title: n.title }))
        return { query, count: notes.length, notes }
      } catch (err) {
        // 工具内部消化错误，返回结构化的失败信息让模型自己决定怎么办，
        // 不要让异常炸掉整个 generateText
        return { query, count: 0, notes: [], error: 'search_failed' }
      }
    },
  })
}
```

`server/mcp/tools/get-note-detail.js`：

```js
import { tool } from 'ai'
import { z } from 'zod'
import Note from '../../models/note.js'

const MAX_CHARS = 4000

export function getNoteDetailTool(user, hooks = {}) {
  const { onNoteFound } = hooks
  return tool({
    description:
      '按笔记 id 获取笔记全文。仅当 search_notes 返回的摘要不足以回答问题时才调用，不要对同一个 id 重复调用。',
    parameters: z.object({
      noteId: z.number().int().describe('笔记 id，来自 search_notes 返回的列表'),
    }),
    execute: async ({ noteId }) => {
      try {
        // 注意：用的是 findByIdAndUser（带归属），不是 findById
        const note = await Note.findByIdAndUser(noteId, user)
        if (!note) {
          return { found: false }   // 拿别人的 id 来查只会得到 not found
        }
        onNoteFound?.({ id: note.id, title: note.title })
        return {
          found: true,
          id: note.id,
          title: note.title,
          content:
            note.content.length > MAX_CHARS
              ? note.content.slice(0, MAX_CHARS) + '\n…（内容过长已截断）'
              : note.content,
        }
      } catch (err) {
        return { found: false, error: 'fetch_failed' }
      }
    },
  })
}
```

`server/mcp/prompts.js`：

```js
export const NOTE_TOOLS_SYSTEM_PROMPT = `你可以调用工具检索用户的笔记库。

使用规则：
1. 当用户的问题可能涉及已有笔记、历史记录、之前保存的结论时，先调用 search_notes 检索，再结合检索结果回答；
2. 回答中引用了笔记内容时，明确指出引用了哪条笔记（说出标题）；
3. 检索没有结果就直说"没有找到相关笔记"，不要编造笔记内容；
4. 与笔记无关的普通问题，直接回答，不要调用工具。`
```

`server/mcp/index.js`：

```js
import { searchNotesTool } from './tools/search-notes.js'
import { getNoteDetailTool } from './tools/get-note-detail.js'

/**
 * 按请求构建工具集。工具的 execute 通过闭包持有 user，
 * 所有查询天然带归属——这是工具路径唯一的安全屏障。
 */
export function buildNoteTools(user, hooks = {}) {
  return {
    search_notes: searchNotesTool(user, hooks),
    get_note_detail: getNoteDetailTool(user, hooks),
  }
}

export { NOTE_TOOLS_SYSTEM_PROMPT } from './prompts.js'
```

**为什么用 `onNoteFound` 回调收集引用，而不是从 `result.steps` 里翻 toolResults**：闭包回调不依赖 SDK 的返回值结构（各版本字段名变过好几次），最稳、最好测；而且收集逻辑与 SDK 解耦，阶段 3 流式直接复用。

### 2.4 改造 `endpoints/chat.js` 非流式分支

```js
import { generateText, streamText, stepCountIs } from 'ai'
import { buildNoteTools, NOTE_TOOLS_SYSTEM_PROMPT } from '../mcp/index.js'

const TOOL_MAX_STEPS = 5

// —— 处理器内 ——
const references = []   // 本轮对话引用到的笔记，随响应回传

const tools = buildNoteTools(req.user, {
  onNoteFound: (ref) => {
    // 去重后收集，作为"知识回链"数据回传前端
    if (!references.some((r) => r.id === ref.id)) {
      references.push(ref)
    }
  },
})

if (!stream) {
  const result = await generateText({
    model,
    messages,          // 阶段 0 修好的历史 + 当前消息
    system: NOTE_TOOLS_SYSTEM_PROMPT,
    tools,
    stopWhen: stepCountIs(TOOL_MAX_STEPS),
  })
  await Chat.create({ workspaceId, content: result.text, proposer: 'assistant' })
  res.status(200).json({
    data: { content: result.text, references },
    code: 200,
    message: 'success',
  })
  return
}
```

注意两处变化：

- **system prompt 单独传**，不要拼进 messages 数组（AI SDK 两种都支持，`system` 参数更清晰）。
- **响应从裸字符串升级为 `{ content, references }`**。这是阶段 3 流式协议的预演——先把"回复正文"和"引用列表"两件事分开。

### 2.5 测试：模拟"先调工具、再回答"

`MockLanguageModelV3` 的 `doGenerate` 传**数组** = 按调用次序依次返回。第一次返回 tool-call，SDK 会真的执行我们的 `execute`（查测试库），第二次返回文本：

```js
// server/test/chat-tools.test.js
import { vi, beforeAll, describe, expect, it } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'

vi.mock('../utils/model-factory.js', () => {
  return {
    createModelInstance: () =>
      new MockLanguageModelV3({
        doGenerate: [
          {
            finishReason: 'tool-calls',
            usage: { inputTokens: 10, outputTokens: 5 },
            content: [{
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'search_notes',
              input: JSON.stringify({ query: 'redis' }),   // v6 里字段名是 input，字符串化 JSON
            }],
          },
          {
            finishReason: 'stop',
            usage: { inputTokens: 50, outputTokens: 20 },
            content: [{ type: 'text', text: '根据你的笔记《Redis 学习计划》……' }],
          },
        ],
      }),
  }
})

import { getRequest, registerAndLogin, authHeader } from './helpers.js'

// 前置：给当前用户建一条标题含 "Redis" 的笔记 + 挂模型的 workspace（套路同阶段 0）
// 断言：
//   res.body.data.references 里含这条笔记的 { id, title }
//   res.body.data.content === '根据你的笔记《Redis 学习计划》……'
//   chat 表落库了 assistant 消息
```

再加一条**越权用例**（纪律 1 的回归测试）：mock 让模型用**别人的笔记 id** 调 `get_note_detail`，断言工具返回 `{ found: false }`、回复里不含他人笔记内容。

工具本身也可以直测（不走 HTTP）：

```js
const tools = buildNoteTools({ id: aliceId })
const result = await tools.search_notes.execute({ query: 'redis' }, {
  toolCallId: 't', messages: [], abortSignal: undefined,
})
expect(result.count).toBe(1)
```

（`execute` 的第二个参数是运行时上下文，测试时给最小对象即可；以 zod 校验后的 `args` 会作为第一个参数传入。）

### 2.6 动手验证（真实模型）

1. 建几条标题带明确关键词的笔记（如 "Redis 缓存失效策略"）；
2. 在挂了真实模型的 workspace 里问："我之前记过缓存失效怎么处理吗？"；
3. 期望：回复提到你的笔记标题，`references` 里有对应 id；
4. 再问一个明显无关的问题（"用 JS 写个快排"），期望：正常回答、`references` 为空数组（模型没调工具）；
5. `redis-cli` 无需参与——本阶段与 Redis 无关。

### 2.7 验收清单

- [ ] 带 mock 的工具循环测试通过（tool-calls → execute → 二次生成）
- [ ] 越权用例通过（他人笔记 id 查不到）
- [ ] 真实模型验证：相关问答回答带引用、无关问答不调工具
- [ ] 模型不支持 tool calling 时（部分小模型如此）：接口不崩（SDK 会报错，被全局 error handler 接住返回 500 + 明确 message），可接受
- [ ] `pnpm test:server` 全绿；git commit

### 2.8 本阶段常见坑

- `parameters` 忘了 `.describe()`——模型不知道该传什么，乱编参数；每个字段都写描述；
- 工具 `execute` 里抛异常且没 try/catch，整个请求 500；工具错误要转成返回值（见 2.3）；
- `stopWhen` 忘了设，模型连环调工具直到 token 上限；
- 在 `endpoints` 里直接 `import { searchNotesTool }` 绕过工厂——丢了 user 闭包，会查全表（这就是为什么入口只有 `buildNoteTools`）。

---

## 阶段 3：流式信封协议 + 前端引用回链

### 3.1 概念：为什么裸文本流装不下"引用"

现在的流式实现是 `for await (const textPart of result.textStream) res.write(textPart)`——响应体里**只有正文**。工具调用带来了正文之外的信息：

- 检索过程状态（"正在检索笔记…"，工具循环期间用户是干等的，这段静默要有反馈）；
- 引用列表（`references`，正文渲染完再展示）。

所以需要给流定义一个**信封（envelope）协议**：每个事件一行 JSON，沿用 SSE 标准格式（`data: ...\n\n`）：

| 事件 | 载荷 | 时机 |
|---|---|---|
| `text` | `{ type:'text', value:'一小段正文' }` | 每个正文增量（对应 `text-delta`） |
| `status` | `{ type:'status', value:'正在检索笔记…' }` | 工具被调用时 |
| `references` | `{ type:'references', notes:[{id,title}] }` | 流结束前一次性推送 |
| `done` | `{ type:'done' }` | 正常结束 |
| `error` | `{ type:'error', message:'...' }` | 中途异常（此时状态码已是 200，只能靠事件报错） |

前端升级后，非流式响应（阶段 2 的 `{ content, references }`）与流式事件是同一套语义，两条渲染路径收敛。

### 3.2 后端：改用 `fullStream`

`textStream` 只吐正文，拿不到工具事件。换成 `fullStream`（它吐出包括 `text-delta`、`tool-call`、`tool-result`、`finish-step` 在内的所有分片，类型名已按 ai@6.0.69 核实）：

```js
// endpoints/chat.js 流式分支
res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
res.setHeader('Cache-Control', 'no-cache')
res.setHeader('Connection', 'keep-alive')

const sendEvent = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)

const references = []   // 同非流式分支：onNoteFound 收集（tools 在两个分支前构建一次即可）

const result = streamText({
  model,
  messages,
  system: NOTE_TOOLS_SYSTEM_PROMPT,
  tools,
  stopWhen: stepCountIs(TOOL_MAX_STEPS),
})

let full = ''
try {
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      full += part.text
      sendEvent({ type: 'text', value: part.text })
    } else if (part.type === 'tool-call') {
      if (part.toolName === 'search_notes') sendEvent({ type: 'status', value: '正在检索笔记…' })
      if (part.toolName === 'get_note_detail') sendEvent({ type: 'status', value: '正在读取笔记…' })
    }
    // tool-result 不必推送：命中笔记已在 references 里，正文里模型也会自己说
  }
  sendEvent({ type: 'references', notes: references })
  sendEvent({ type: 'done' })
  await Chat.create({ workspaceId, content: full, proposer: 'assistant' })
} catch (err) {
  sendEvent({ type: 'error', message: err.message })
} finally {
  res.end()
}
```

两个细节：

- **`text-delta` 才是正文增量**（v6 的类型名），不要写成 v4 时代的 `text-part`/`text-delta` 混用；
- 流式响应一旦开始就改不了状态码，异常只能走 `error` 事件——前端要处理它。

### 3.3 前端：SSE 增量解析器

现在前端直接读 `e.event.target.responseText`（axios `onDownloadProgress` 给的是**到目前为止的完整响应文本**）。要在它之上做增量解析：记住上次消费到的位置，每次只解析新增部分，并容忍"半个 JSON 被切成两个 chunk"的边界情况。

新建 `interface/src/utils/sse.ts`：

```ts
export type SSEEvent =
  | { type: 'text'; value: string }
  | { type: 'status'; value: string }
  | { type: 'references'; notes: { id: number; title: string }[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** 返回一个有状态的解析器：每次喂入"到目前为止的完整响应文本"，回调按事件触发 */
export function createSSEParser(onEvent: (evt: SSEEvent) => void) {
  let consumed = 0
  return (fullText: string) => {
    const fresh = fullText.slice(consumed)
    const chunks = fresh.split('\n\n')          // SSE 事件以空行分隔
    const remainder = chunks.pop() ?? ''        // 最后一段可能是不完整事件，留到下次
    consumed += fresh.length - remainder.length
    for (const chunk of chunks) {
      const line = chunk.trim()
      if (!line.startsWith('data: ')) continue  // 忽略注释行等杂音
      try {
        onEvent(JSON.parse(line.slice(6)))
      } catch {
        /* 半包 JSON：理论上 remainder 已兜住，这里再防御一层 */
      }
    }
  }
}
```

### 3.4 前端：改造 `handleStreamChat` 与气泡渲染

```tsx
// pages/chat/index.tsx —— ChatPanel 内
const handleStreamChat = async () => {
  if (!workspace || prompt.trim() === '') return
  const content = prompt.trim()
  setPrompt('')
  setLoading(true)
  const newConversation = [...conversation, { proposer: 'user', content }]
  setConversation([...newConversation, { proposer: 'assistant', content: '', references: [] }])

  const feed = createSSEParser((evt) => {
    setConversation((prev) => {
      const last = { ...prev[prev.length - 1] }
      const rest = prev.slice(0, -1)
      if (evt.type === 'text') last.content += evt.value
      if (evt.type === 'status') last.status = evt.value
      if (evt.type === 'references') last.references = evt.notes
      if (evt.type === 'error') last.content += `\n[出错了] ${evt.message}`
      return [...rest, last]
    })
  })

  await streamChatToWorkspace(workspace.id, content, (e: any) => {
    feed(e.event.target.responseText)
  })
  setLoading(false)
}
```

气泡的 `footer`（现有 `chatBubbleList` 里 assistant 分支）追加引用标签，点击跳笔记编辑页（路由已存在：`/note/edit/:id?`）：

```tsx
item.references?.length ? (
  <Space wrap>
    {item.references.map((ref) => (
      <Tag
        key={ref.id}
        icon={<LinkOutlined />}
        color="blue"
        className="cursor-pointer"
        onClick={() => navigate(`/note/edit/${ref.id}`)}>
        {ref.title}
      </Tag>
    ))}
  </Space>
) : null
```

（`Tag` 从 antd 引入；`navigate` 用 react-router 的 `useNavigate`。`status` 的展示从简：Bubble 上方一行灰字即可，流结束后清掉。）

顺带把 `handleChat`（非流式路径）读值改成 `res.data.content`——阶段 0 现状清点里的第 3 个问题至此修复。

### 3.5 动手验证

1. 问一个能命中笔记的问题：正文先出现"正在检索笔记…"状态，随后正文流式输出，气泡下方出现蓝色引用 Tag；
2. 点 Tag 跳到 `/note/edit/:id`，能看到对应笔记；
3. 问无关问题：无 status、无 Tag、正文直接流式输出；
4. 把 model-config 的 baseUrl 改成一个不通的地址，验证 `error` 事件路径：前端显示错误而非永久 loading；
5. 断网/关 Redis 均不影响本阶段（无新依赖）。

### 3.6 验收清单

- [ ] 流式正文、状态、引用、错误四类事件前端都正确渲染
- [ ] 跨 chunk 的半个 JSON 不炸（可临时把后端 `res.write` 改成逐字符 write 自测）
- [ ] 非流式路径（`stream: false`）前端也能展示引用
- [ ] `pnpm test:server` 全绿；git commit

---

## 阶段 4：可选进阶（不排期，记录方向）

### 4.1 Redis 缓存检索结果

`aura:mcp:search:user:{id}:{md5(query)}`，TTL 300 秒。失效难点：笔记写入口（note create/update/delete）不知道该用户缓存过哪些 query——用**版本号方案**：key 改为 `aura:mcp:search:user:{id}:v{N}`，`N` 存 `aura:mcp:ver:user:{id}`（INCR），笔记写入口 INCR 一次即全量失效。正好复用 Redis 计划阶段 2 学的"主动失效 + TTL 兜底"。

### 4.2 升级成真正的 MCP Server

用 `@modelcontextprotocol/sdk` 把 `mcp/tools/` 里的定义与执行器包一层 stdio/HTTP server，Aura 之外的工具（Claude Desktop、Cursor）也能挂载同一套笔记检索。因为工具已经是"schema + execute"结构，迁移主要是换注册方式。做完这个，"MCP 笔记检索"这个名字才完全名副其实。

### 4.3 衔接 M2：对话沉淀

工具体系就位后，"对话转笔记"只是新增一个 `save_note` 工具（execute 里 `Note.create`，同样带 user 闭包）——这是 product-roadmap M2 主线的起点，本计划的架构直接复用。

---

## 附录 A：AI SDK 速查（按本项目安装的 ai@6.0.69 核实）

| API | 来源 | 用途 |
|---|---|---|
| `tool({ description, parameters, execute })` | `'ai'` | 定义工具；`parameters` 用 zod schema |
| `generateText({ model, messages, system, tools, stopWhen })` | `'ai'` | 非流式生成，内部自动跑工具循环 |
| `streamText({...同上})` → `result.fullStream` | `'ai'` | 流式；`fullStream` 吐 `text-delta` / `tool-call` / `tool-result` / `finish-step` 等分片 |
| `result.textStream` | `'ai'` | 只吐正文文本的便捷流（本计划升级为 fullStream 后不再用） |
| `stepCountIs(n)` | `'ai'` | 传给 `stopWhen`，限制工具循环最大步数 |
| `MockLanguageModelV3` | `'ai/test'` | 测试假模型；`doGenerate` 传对象或**数组**（按次序返回） |
| `simulateReadableStream` | `'ai/test'` | 模拟 doStream 的分片流（测流式用，同思路） |

mock 工具调用时，content 里的 tool-call 分片长这样（v6 字段名是 `input`，JSON 字符串）：

```js
{ type: 'tool-call', toolCallId: 'call-1', toolName: 'search_notes', input: JSON.stringify({ query: 'redis' }) }
```

## 附录 B：安全清单（评审时逐条打勾）

- [ ] 工具的所有 SQL 都带 `user_id = ?`（唯一入口 `buildNoteTools(user)`）
- [ ] 按 id 取笔记只用 `Note.findByIdAndUser`，全项目搜索确认工具路径没有 `Note.findById`
- [ ] 工具返回内容经过裁剪（搜索不含 content；全文截断 4000 字符）
- [ ] 工具执行异常被转化为返回值，不会把 SQL 错误细节（表名/SQL 片段）透给模型
- [ ] `stopWhen` 限制了循环步数（防 token 失控）
- [ ] 工具循环的每一步依然在 `rateLimit`（30 次/小时）的同一请求预算内，无法借工具放大调用

## 附录 C：文件变更一览

```diff
server/
├── endpoints/chat.js            # 修 modelId bug、历史窗口、接入 tools + SSE
├── models/note.js               # findByKeywords、findByIdAndUser
+ ├── mcp/
+ │   ├── index.js               # buildNoteTools(user, hooks)
+ │   ├── prompts.js             # NOTE_TOOLS_SYSTEM_PROMPT
+ │   └── tools/
+ │       ├── search-notes.js
+ │       └── get-note-detail.js
+ ├── test/
+     ├── chat-happy-path.test.js
+     ├── note-keywords.test.js
+     └── chat-tools.test.js
interface/src/
+ ├── utils/sse.ts               # SSE 增量解析器
└── pages/chat/index.tsx         # 信封协议接入 + 引用 Tag
package.json (aura-server)       # + zod
```

## 附录 D：四个阶段各自的"一句话收获"

- 阶段 0：mock 模型让"AI 功能"第一次变得可测——happy-path 测试是所有后续改造的安全网。
- 阶段 1：LLM 时代的数据层老手艺没变——索引、裁剪、**归属过滤**一个都不能少，工具没有中间件替你把关。
- 阶段 2：Tool Calling = 你定义"模型能做什么"，SDK 驱动循环，你写好 execute 和刹车（stopWhen）。
- 阶段 3：当裸流表达不了结构化信息时，自己定义信封协议——SSE 只是"一行 JSON + 空行"这么朴素的约定。
