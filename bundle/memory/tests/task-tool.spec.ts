/**
 * The main-agent `create_task` tool: registered through `ctx.tools`, resolves
 * the `tasks` registry via `ctx.get`, and creates a durable task.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import Tasks from '../src/tasks/index.ts'
import * as taskTool from '../src/tasks/tool.ts'

const testToolSignal = new AbortController().signal

/** A cordis context with the tool registry and an in-memory task registry. */
async function setup(): Promise<{ ctx: Context }> {
  const ctx = new Context()
  // `ToolRuntime` injects `systemPrompt`; load it first so the tools service
  // activates (mirrors the subagent team-tool test).
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(Tasks, { dbPath: ':memory:' })
  await ctx.plugin(taskTool, {})
  return { ctx }
}

let callCounter = 0
function callTool(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`task-call-${++callCounter}`),
    name: 'create_task',
    arguments: args,
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-memory-bundle/tasks/tool', () => {
  it('registers a create_task tool exposing title/goal/roles to the model', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'create_task')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props).sort()).toEqual(['goal', 'roles', 'title'])
  })

  it('creates a task and reports its id', async () => {
    const { ctx } = await setup()
    const result = await callTool(ctx, { title: '接入记忆', goal: '把记忆引擎接进 DSH' })
    expect(result.isError).toBe(false)
    expect(text(result)).toMatch(/created task .+ \(running\)/)
    // The registry now holds the created task.
    const roster = ctx.get('tasks')!.list()
    expect(roster).toHaveLength(1)
    expect(roster[0]!.title).toBe('接入记忆')
    expect(roster[0]!.status).toBe('running')
  })

  it('passes roles through to the created task', async () => {
    const { ctx } = await setup()
    const result = await callTool(ctx, {
      title: 't', goal: 'g',
      roles: [{ roleId: 'lead', division: '方案' }],
    })
    expect(result.isError).toBe(false)
    const roster = ctx.get('tasks')!.list()
    expect(roster[0]!.roles).toEqual([{ roleId: 'lead', division: '方案' }])
  })

  it('fails loud when no task registry is composed', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(taskTool, {})
    const result = await callTool(ctx, { title: 't', goal: 'g' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('no task registry is loaded')
  })
})
