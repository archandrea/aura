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
    const rows = await Note.findByKeywords({ id: alice.id }, 'redis')
    expect(rows.length).toBe(1)
    expect(rows[0].title).toBe('Alice 的 Redis 笔记')
    // 纪律 2：检索结果不带全文
    expect(rows[0].content).toBeUndefined()
  })
})

describe('Note keywords 写入口与检索', () => {
  it('keywords 列命中检索，keywords 为 NULL 的笔记不报错', async () => {
    const carol = await registerAndLogin()
    await createNote(carol.token, {
      title: '缓存笔记',
      content: 'cache-aside 与旁路缓存',
      keywords: ['缓存', 'cache'],
    })
    await createNote(carol.token, {
      title: '没有关键词的笔记',
      content: 'keywords 列为 NULL',
    })

    const { default: Note } = await import('../models/note.js')

    // 只有关键词列含 "cache" 的笔记命中（标题/描述里没有这个词）
    const hit = await Note.findByKeywords({ id: carol.id }, 'cache')
    expect(hit.length).toBe(1)
    expect(hit[0].title).toBe('缓存笔记')
    expect(hit[0].keywords).toEqual(['缓存', 'cache'])

    // keywords 为 NULL 的笔记：不报错，只是不命中
    const miss = await Note.findByKeywords({ id: carol.id }, 'python')
    expect(miss.length).toBe(0)
  })

  it('update 可以改写 keywords', async () => {
    const dave = await registerAndLogin()
    const noteId = await createNote(dave.token, {
      title: 'Dave 的笔记',
      content: '待更新关键词',
      keywords: ['旧关键词'],
    })

    const put = await request.put(`/api/note/${noteId}`).set(authHeader(dave.token)).send({
      keywords: ['新关键词', 'mysql'],
    })
    expect(put.status).toBe(200)

    const { default: Note } = await import('../models/note.js')
    const hit = await Note.findByKeywords({ id: dave.id }, 'mysql')
    expect(hit.length).toBe(1)
    expect(hit[0].keywords).toEqual(['新关键词', 'mysql'])
  })

  it('keywords 格式非法时返回 400', async () => {
    const eve = await registerAndLogin()
    const bad = await request.post('/api/note').set(authHeader(eve.token)).send({
      title: '非法关键词',
      content: 'x',
      keywords: ['ok', 123],
    })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toContain('keywords')
  })
})
