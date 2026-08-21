/**
 * T10 查记忆工具 `query_memory`：注册/调用/限次。
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { MemoryToolBudget } from '../../src/tools/budget.ts'
import * as memoryTool from '../../src/tools/memory-tool.ts'

const testToolSignal = new AbortController().signal

/** 带会话 id 的 mock 调用者 agent。 */
function agent(sessionId: string): Agent {
  return { session: { id: sessionId } } as unknown as Agent
}

/** mock 记忆服务：searchMemories 返回固定文本。 */
function mockMemory(overrides: { text?: string; total?: number; strategy?: string } = {}) {
  return {
    searchMemories: async () => ({
      text: overrides.text ?? '记忆：偏好 venus-flash 模型',
      total: overrides.total ?? 1,
      strategy: 'hybrid',
    }),
  }
}

async function setup(budget?: MemoryToolBudget) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  ctx.provide('memory', mockMemory())
  await ctx.plugin(memoryTool, { budget: budget ?? new MemoryToolBudget() })
  return { ctx }
}

let callCounter = 0
function callTool(ctx: Context, args: unknown, caller?: Agent) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`mem-${++callCounter}`),
    name: 'query_memory',
    arguments: args,
    ...caller !== undefined ? { agent: caller } : {},
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-harness-memory-bundle/tools/memory-tool', () => {
  it('注册 query_memory 工具，暴露 query/limit/type/scene 参数', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'query_memory')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['limit', 'query', 'scene', 'type'])
  })

  it('描述声明触发场景与调用上限', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'query_memory')!
    expect(schema.description).toContain('最多 3 次')
    expect(schema.description).toContain('长期记忆库')
  })

  it('调用返回记忆检索结果', async () => {
    const { ctx } = await setup()
    const result = await callTool(ctx, { query: '我的偏好' }, agent('s1'))
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('记忆：偏好 venus-flash 模型')
  })

  it('未加载记忆引擎时失败并给出明确信息', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(memoryTool, { budget: new MemoryToolBudget() })
    const result = await callTool(ctx, { query: 'x' }, agent('s1'))
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('记忆引擎未加载')
  })

  it('每会话超限后拒绝后续调用', async () => {
    const { ctx } = await setup()
    // 第 1-3 次成功，第 4 次失败。
    for (let i = 0; i < 3; i++) {
      const ok = await callTool(ctx, { query: 'x' }, agent('s1'))
      expect(ok.isError).toBe(false)
    }
    const denied = await callTool(ctx, { query: 'x' }, agent('s1'))
    expect(denied.isError).toBe(true)
    expect(text(denied)).toContain('调用上限')
  })

  it('两个不同会话的限次互相独立', async () => {
    const { ctx } = await setup()
    await callTool(ctx, { query: 'a' }, agent('s1'))
    await callTool(ctx, { query: 'a' }, agent('s1'))
    await callTool(ctx, { query: 'a' }, agent('s1'))
    // s1 已耗尽；s2 仍可用。
    const s2ok = await callTool(ctx, { query: 'b' }, agent('s2'))
    expect(s2ok.isError).toBe(false)
    const s1denied = await callTool(ctx, { query: 'a' }, agent('s1'))
    expect(s1denied.isError).toBe(true)
  })
})
