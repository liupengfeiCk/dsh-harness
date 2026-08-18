/**
 * The harness-owned spawn/fork providers: they register `spawn` and `fork` on
 * `ctx.subagents`, drive our engine (`startInProcessRun`), and mirror the
 * official provider contracts (capabilities, `inheritsParentContext`, fork
 * seed from the parent's completed-turn prefix). This verifies the provider
 * plugin boundary on the replacement code path.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse } from './mock-adapter.ts'
import * as spawnPlugin from '../../src/in-process/spawn.ts'
import * as forkPlugin from '../../src/in-process/fork.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

async function setupHost(): Promise<{ ctx: Context; parent: Agent }> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('parent idle'), textResponse('child done')]))
  const parent = ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { ctx, parent }
}

describe('harness spawn provider', () => {
  it('registers the `spawn` provider with a fresh-context contract', async () => {
    const { ctx } = await setupHost()
    await ctx.plugin(spawnPlugin, { providerName: 'spawn' })

    const provider = ctx.subagents.getProvider('spawn')
    expect(provider).toBeDefined()
    expect(provider?.inheritsParentContext).toBe(false)
    expect(provider?.capabilities).toEqual({ outputSchema: true, depthLimit: true, toolFilter: true, persona: true })
  })

  it('drives a fresh child through our engine and returns its output', async () => {
    const { ctx, parent } = await setupHost()
    await ctx.plugin(spawnPlugin, { providerName: 'spawn' })

    const run = await ctx.subagents.start('spawn', {
      label: 'child task',
      prompt: [{ type: 'text', text: 'child task' }],
      parent,
      signal: new AbortController().signal,
    })
    const result = await run.result
    expect(result.stopReason).toBe('completed')
    await run.dispose()
    expect(ctx.agents.get(run.id)).toBeUndefined()
  })
})

describe('harness fork provider', () => {
  it('registers the `fork` provider with an inherited-context contract', async () => {
    const { ctx } = await setupHost()
    await ctx.plugin(forkPlugin, { providerName: 'fork' })

    const provider = ctx.subagents.getProvider('fork')
    expect(provider).toBeDefined()
    expect(provider?.inheritsParentContext).toBe(true)
    expect(provider?.capabilities).toEqual({ outputSchema: true, depthLimit: true, toolFilter: true, persona: true })
  })

  it('seeds a forked child with the parent completed-turn prefix', async () => {
    const { ctx, parent } = await setupHost()
    await ctx.plugin(forkPlugin, { providerName: 'fork' })
    // Complete one parent turn so the fork has history to inherit; the in-flight
    // state is excluded, so the seed ends at the last turn/end.
    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'parent question' }], source: { kind: 'user' } }))
    await parent.whenIdle()
    const parentPrefixLen = parent.session.events.length

    const run = await ctx.subagents.start('fork', {
      label: 'child task',
      prompt: [{ type: 'text', text: 'child task' }],
      parent,
      signal: new AbortController().signal,
    })
    await run.result
    const child = run.localAgent as Agent
    // The child's header records the seed boundary from the parent's completed
    // turn; a non-empty seed means the fork inherited history.
    expect(child.session.header.seedLength).toBe(parentPrefixLen)
    expect(child.session.header.seedLength).toBeGreaterThan(0)
    const seedEvents: SessionEvent[] = child.session.events.slice(0, child.session.header.seedLength!)
    expect(seedEvents.length).toBeGreaterThan(0)
    expect(seedEvents.at(-1)?.type).toBe('turn/end')
    await run.dispose()
  })

  it('fails loud when no provider matches a requested name', async () => {
    const { ctx } = await setupHost()
    await expect(ctx.subagents.start('nope', {
      label: 'x',
      prompt: [{ type: 'text', text: 'x' }],
      parent: {} as Agent,
      signal: new AbortController().signal,
    })).rejects.toThrow(/no subagent provider registered for "nope"/)
  })
})
