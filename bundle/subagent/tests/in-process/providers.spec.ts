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
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse, toolCallResponse } from './mock-adapter.ts'
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

  it('seeds a forked child with the parent completed surface', async () => {
    const { ctx, parent } = await setupHost()
    await ctx.plugin(forkPlugin, { providerName: 'fork' })
    // Complete one parent turn so the fork has history to inherit; the seed is
    // the parent's SURFACE (one user + one assistant message), not the raw log
    // (which also holds chunks, boundaries, headers, ...).
    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'parent question' }], source: { kind: 'user' } }))
    await parent.whenIdle()
    const parentSurfaceLen = parent.session.deriveMessages().length
    expect(parentSurfaceLen).toBeGreaterThan(0)

    const run = await ctx.subagents.start('fork', {
      label: 'child task',
      prompt: [{ type: 'text', text: 'child task' }],
      parent,
      signal: new AbortController().signal,
    })
    await run.result
    const child = run.localAgent as Agent
    // The child's header records the seed boundary — one seed event per
    // inherited surface message — so the child inherits the surface verbatim.
    expect(child.session.header.seedLength).toBe(parentSurfaceLen)
    const seedEvents: SessionEvent[] = child.session.events.slice(0, child.session.header.seedLength!)
    expect(seedEvents.length).toBe(parentSurfaceLen)
    expect(seedEvents.every(e => e.type === 'user/message' || e.type === 'assistant/message')).toBe(true)
    // The inherited messages equal the parent's surface at fork time.
    const inherited = child.session.deriveMessages().slice(0, child.session.header.seedLength!)
    expect(inherited).toEqual(parent.session.deriveMessages())
    await run.dispose()
  })

  it('inherits the parent COMPACTED surface (summary), not the full raw history', async () => {
    // A fork that inherits the parent's conversation must inherit what the
    // parent CURRENTLY reasons over — a compaction summary — rather than the
    // full append-only log, whose replaced history compaction never deletes.
    const { ctx, parent } = await setupHost([textResponse('reply one'), textResponse('reply two'), textResponse('child done')])
    await ctx.plugin(forkPlugin, { providerName: 'fork' })

    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'q1' }], source: { kind: 'user' } }))
    await parent.whenIdle()
    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'q2' }], source: { kind: 'user' } }))
    await parent.whenIdle()
    // Manually compact the whole surface down to one summary message, exactly
    // as a compaction backend's `user/message` replace node would.
    const nodes = [...parent.session.surface.nodes]
    const summary = createUserMessage({
      content: [{ type: 'text', text: '[COMPACTED SUMMARY]' }],
      source: { kind: 'plugin', plugin: 'fork-test' },
    })
    parent.session.append('user/message', summary, {
      surfaceOp: { op: 'replace', start: nodes[0], end: nodes[nodes.length - 1] },
      sourceEventSeqs: nodes,
    })
    const parentDerive = parent.session.deriveMessages()
    expect(parentDerive).toHaveLength(1)
    // Sanity: the raw log still holds the full pre-compaction history.
    expect(parent.session.events.length).toBeGreaterThan(parentDerive.length)

    const run = await ctx.subagents.start('fork', {
      label: 'child task',
      prompt: [{ type: 'text', text: 'child task' }],
      parent,
      signal: new AbortController().signal,
    })
    await run.result
    const child = run.localAgent as Agent
    // The child's inherited prefix (its seed, before its own new messages)
    // equals the parent's current surface: the summary, not the full history.
    const inherited = child.session.deriveMessages().slice(0, child.session.header.seedLength!)
    expect(inherited).toEqual(parentDerive)
    expect(inherited.map(m => m.content[0]?.type === 'text' ? m.content[0].text : '?'))
      .toEqual(['[COMPACTED SUMMARY]'])
    await run.dispose()
  })

  it('trims the delegating turn still in flight, inheriting only completed context', async () => {
    // A fork is requested while the parent's DELEGATING turn is executing a
    // tool, so the current turn's user/assistant messages must NOT be inherited
    // — the child sees only the completed turns.
    const ctx = new Context()
    contexts.push(ctx)
    // `mountAgentLoopTestDependencies` already provides the `tools` service.
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(forkPlugin, { providerName: 'fork' })

    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    ctx.tools.register({
      name: 'capture_delegate',
      description: 'capture',
      parameters: { description: { type: 'string', required: true } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {} },
        render: () => [{ type: 'text', text: 'ok' }],
      },
      async execute(_args, exec) {
        await gate
        return { output: [] }
      },
    })

    const adapter = new MockAdapter([
      textResponse('reply one'),
      toolCallResponse('c1', 'capture_delegate', { description: 'd' }),
      textResponse('child done'),
    ])
    ctx.llm.registerAdapter(['mock'], adapter)
    const parent = ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' })

    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'q1' }], source: { kind: 'user' } }))
    await parent.whenIdle()

    // Start a delegating turn whose tool call we hold open; fork inside it.
    const turn2 = (async () => {
      parent.followup(createUserMessage({ content: [{ type: 'text', text: 'delegate' }], source: { kind: 'user' } }))
      await parent.whenIdle()
    })()
    await new Promise<void>((r) => setTimeout(r, 80))
    // The delegating turn is in flight, so the parent's full surface has 4 msgs.
    expect(parent.session.deriveMessages().length).toBeGreaterThan(2)

    const run = await ctx.subagents.start('fork', {
      label: 'child task',
      prompt: [{ type: 'text', text: 'child task' }],
      parent,
      signal: new AbortController().signal,
    })
    await run.result
    const child = run.localAgent as Agent
    const inherited = child.session.deriveMessages().slice(0, child.session.header.seedLength!)
    // Only turn 1 (completed) is inherited; the in-flight delegating turn is cut.
    expect(inherited.map(m => m.content[0]?.type === 'text' ? m.content[0].text : '?')).toEqual(['q1', 'reply one'])
    await run.dispose()
    release()
    await turn2
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
