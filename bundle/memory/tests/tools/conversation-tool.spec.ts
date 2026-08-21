/**
 * T10 查原对话工具 `query_conversation`：注册/search 检索/补召（refine）逐级/限次。
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { MemoryToolBudget } from '../../src/tools/budget.ts'
import * as conversationTool from '../../src/tools/conversation-tool.ts'
import { loadFineLayers } from '../../src/tools/conversation-tool.ts'
import { FileSummaryStorage } from '../../src/compaction/storage.ts'
import { NoCoverageError } from '../../src/compaction/types.ts'
import type { LayerSummary } from '../../src/compaction/types.ts'

const testToolSignal = new AbortController().signal

function agent(sessionId: string): Agent {
  return { session: { id: sessionId } } as unknown as Agent
}

function mockMemory(overrides: { text?: string; total?: number } = {}) {
  return {
    searchConversations: async () => ({
      text: overrides.text ?? 'L0 原文：我们上次讨论了补召设计',
      total: overrides.total ?? 1,
    }),
  }
}

/** 一段覆盖 seq 的多层摘要：细层 L2（最细）+ 粗层 L1，按最细优先（契约）。 */
function layersFor(seq: number): LayerSummary[] {
  const base: Omit<LayerSummary, 'level' | 'text'> = {
    range: [seq, seq], tokens: 3, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true,
  }
  return [
    { ...base, level: 2, text: 'L2 细摘要' },
    { ...base, level: 1, text: 'L1 粗摘要' },
  ]
}

async function setup(options: {
  budget?: MemoryToolBudget
  refine?: conversationTool.Config['refine']
  searchText?: string
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.provide('memory', mockMemory({ text: options.searchText }))
  await ctx.plugin(conversationTool, {
    budget: options.budget ?? new MemoryToolBudget(),
    ...options.refine === undefined ? {} : { refine: options.refine },
  })
  return { ctx }
}

let callCounter = 0
function callTool(ctx: Context, args: unknown, caller?: Agent) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`conv-${++callCounter}`),
    name: 'query_conversation',
    arguments: args,
    ...caller !== undefined ? { agent: caller } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-harness-memory-bundle/tools/conversation-tool', () => {
  it('注册 query_conversation 工具，暴露 query/sessionKey/seq/limit 参数', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'query_conversation')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['limit', 'query', 'seq', 'sessionKey'])
  })

  it('描述声明触发场景、两种模式与调用上限', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'query_conversation')!
    expect(schema.description).toContain('最多 3 次')
    expect(schema.description).toContain('原对话')
  })

  it('描述明确两种模式职责边界：refine 补覆盖 seq 的细层摘要，跨会话走 search', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'query_conversation')!
    // refine 模式：补回"覆盖 seq 的细层摘要"。
    expect(schema.description).toContain('覆盖 seq')
    expect(schema.description).toContain('细层摘要')
    // search 模式：跨会话老对话细节走关键词检索。
    expect(schema.description).toContain('跨会话')
    expect(schema.description).toContain('关键词')
  })

  it('search 模式按关键词检索 L0 原文', async () => {
    const { ctx } = await setup({ searchText: 'L0 原文：上次 bug 是这样修的' })
    const result = await callTool(ctx, { query: '上次 bug' }, agent('s1'))
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('上次 bug 是这样修的')
  })

  it('search 模式缺少 query 时失败', async () => {
    const { ctx } = await setup()
    const result = await callTool(ctx, {}, agent('s1'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('需提供 query')
  })

  it('refine 补召：逐级返回覆盖 seq 的细层摘要（最细优先）与 L0 原文', async () => {
    const refine: conversationTool.Config['refine'] = async (_session, seq) => ({
      layers: layersFor(seq),
      rawMessages: [{ seq, text: 'L0 原文正文', role: 'user' }],
    })
    const { ctx } = await setup({ refine })
    const result = await callTool(ctx, { seq: 7 }, agent('s1'))
    expect(result.isError).toBe(false)
    const out = text(result)
    expect(out).toContain('L2 细摘要')
    expect(out).toContain('L1 粗摘要')
    expect(out).toContain('L0 原文正文')
    // 最细优先：L2 在 L1 之前。
    expect(out.indexOf('L2 细摘要')).toBeLessThan(out.indexOf('L1 粗摘要'))
  })

  it('refine 补召：无覆盖时报错而非幻想', async () => {
    const refine: conversationTool.Config['refine'] = async (_s, seq) => {
      throw new NoCoverageError(`no summary layer covers seq ${seq}`)
    }
    const { ctx } = await setup({ refine })
    const result = await callTool(ctx, { seq: 99 }, agent('s1'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('无摘要层覆盖')
  })

  it('refine 补召：无调用者会话时失败', async () => {
    const refine: conversationTool.Config['refine'] = async () => ({ layers: [], rawMessages: [] })
    const { ctx } = await setup({ refine })
    const result = await callTool(ctx, { seq: 1 })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('需要调用者会话')
  })

  it('两模式共享同一限次：合计超 3 次后拒绝', async () => {
    const refine: conversationTool.Config['refine'] = async () => ({ layers: [], rawMessages: [] })
    const { ctx } = await setup({ refine })
    // 2 次 search + 2 次 refine = 4 → 第 4 次失败。
    await callTool(ctx, { query: 'a' }, agent('s1'))
    await callTool(ctx, { query: 'b' }, agent('s1'))
    await callTool(ctx, { seq: 1 }, agent('s1'))
    const denied = await callTool(ctx, { seq: 2 }, agent('s1'))
    expect(denied.isError).toBe(true)
    expect(text(denied)).toContain('调用上限')
  })
})

describe('补召链路逐级补回（loadFineLayers）', () => {
  it('粗化后能从存储逐级补回覆盖 seq 的细层摘要（最细优先）', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-refine-'))
    try {
      const storage = new FileSummaryStorage(base)
      // 模拟 T8 压缩后落盘的多层摘要：L1 粗 + L2 细 + L3 更细，都覆盖 seq 5。
      await storage.save('s1', { level: 1, range: [1, 20], text: 'L1 粗摘要', tokens: 3, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true })
      await storage.save('s1', { level: 2, range: [1, 10], text: 'L2 细摘要', tokens: 3, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true })
      await storage.save('s1', { level: 3, range: [4, 6], text: 'L3 更细摘要', tokens: 3, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true })
      const layers = await loadFineLayers(storage, 's1', 5)
      // 逐级补回：更细→细→粗，level 降序。
      expect(layers.map((l) => l.level)).toEqual([3, 2, 1])
      expect(layers.map((l) => l.text)).toEqual(['L3 更细摘要', 'L2 细摘要', 'L1 粗摘要'])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('无层覆盖时返回空（而非报错）', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mem-refine2-'))
    try {
      const storage = new FileSummaryStorage(base)
      await storage.save('s1', { level: 1, range: [1, 10], text: 'x', tokens: 3, generatedAt: '2026-01-01T00:00:00.000Z', nonDistillable: true })
      const layers = await loadFineLayers(storage, 's1', 99)
      expect(layers).toEqual([])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
