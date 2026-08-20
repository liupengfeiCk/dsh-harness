/**
 * Persisted-role report/settlement dedup through OUR harness continuation
 * manager (`HarnessSubagentRuntime`): when a continuable child already woke its
 * parent with an explicit wake-up report, the settlement's finished-notice is
 * SKIPPED entirely. A persistent role that reports then settles therefore
 * notifies the top-level parent exactly once, so it answers the user once
 * instead of twice. This is a harness deviation from the official manager,
 * which always delivers the settlement regardless of any prior report (official
 * `continuation.spec.ts` pins that with a `quiet` report; the wake-up-report +
 * settle double-notice is the path the harness fixes).
 *
 * A `quiet` report never wakes the parent, so it MUST NOT set the dedup flag:
 * the settlement still wakes the parent once. That keeps the "settlement is
 * always told" contract intact for a child that never woke its parent, and is
 * pinned here too.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import SubagentPresets from '../../src/preset/index.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { textResponse } from './mock-adapter.ts'
import HarnessSubagentRuntime from '../../src/in-process/service.ts'
import * as spawnPlugin from '../../src/in-process/spawn.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ROOTS = [{ path: join(FIXTURES, 'presets'), trust: 'system' as const }]
const SUBAGENT_ROOTS = [{ path: join(FIXTURES, 'subagents'), trust: 'system' as const }]
const testSignal = new AbortController().signal

/**
 * Recording adapter: every model call (across the parent and every continuable
 * child on the shared host) returns the same canned response and is recorded.
 * Counting parent-session requests is how "the parent answered the user once"
 * is observed — a second parent turn would add a second parent-session request.
 */
class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (options.signal?.aborted) throw new Error('aborted')
    for (const chunk of textResponse('ok')) {
      if (options.signal?.aborted) throw new Error('aborted')
      yield chunk
    }
  }
}

function startSpec(parent: Agent) {
  return {
    provider: 'spawn',
    label: 'child task',
    request: {
      prompt: [{ type: 'text' as const, text: 'child task' }],
      parent,
    },
    signal: testSignal,
  }
}

function message(text: string) {
  return [{ type: 'text' as const, text }]
}

/** Wait until the child's Activation is gone, i.e. its handle finished disposal. */
async function waitNoActivation(ctx: Context, childId: SessionId): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.agents.get(childId)).toBeUndefined()
  }, { timeout: 15_000 })
}

/**
 * All distinct `user/message` payloads visible to a session: the logged history
 * plus any delivered-but-unclaimed inbox work. A quiet/injected notice is
 * delivered to the inbox but never claimed into the session history when no
 * turn runs, so reading only `session.events` would miss it. Once a turn claims
 * a message it is logged AND still referenced by the inbox, so results are
 * deduped by message id.
 */
function userMessages(agent: Agent) {
  const seen = new Set<string>()
  const messages = [
    ...agent.session.events.flatMap(event => event.type === 'user/message' ? [event.data] : []),
    ...agent.inbox.nextStep,
    ...agent.inbox.nextTurn,
  ]
  return messages.filter(message => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

describe('report/settlement dedup (harness service)', () => {
  let ctx: Context
  let parent: Agent
  let adapter: RecordingAdapter
  let root: string

  // The shared host's adapter records across the whole suite, so reset it before
  // each test to keep per-test parent-turn counting clean.
  beforeEach(() => {
    adapter.requests = []
  })

  beforeAll(async () => {
    ctx = new Context()
    ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await mountAgentLoopTestDependencies(ctx)
    root = mkdtempSync(join(tmpdir(), 'dsh-report-dedup-'))
    await ctx.plugin(JsonlSessionPersistence, { root })
    await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: root })
    await ctx.plugin(ApprovalService)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, { default: 'coding', roots: ROOTS, includeUserRoot: false })
    await ctx.plugin(SubagentPresets, { roots: SUBAGENT_ROOTS, includeUserRoot: false })
    await ctx.plugin(HarnessSubagentRuntime)
    await ctx.plugin(spawnPlugin, { providerName: 'spawn' })
    adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['mock'], adapter)
    const handle = await ctx.agents.create({
      sessionId: SessionId('parent'),
      agentOptions: { provider: 'mock', model: 'mock' },
      setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, 'coding'),
    })
    parent = handle.agent
  })

  it('wakes the parent exactly once when a child reports (wakeup) then settles', async () => {
    const started = await ctx.subagents.startContinuable(startSpec(parent))
    const child = await vi.waitFor(() => {
      const live = ctx.agents.get(started.childId)
      expect(live).toBeDefined()
      return live!
    })
    // The child reports with the DEFAULT delivery (`wakeup`), which wakes the
    // top-level parent into one turn — the parent answers the user once.
    await ctx.subagents.reportFrom(child, message('an explicit report'), {
      delivery: 'wakeup',
      signal: testSignal,
    })
    await waitNoActivation(ctx, started.childId)

    // The wake-up report is the single notification: the parent was woken into
    // exactly ONE model turn, and the settlement's finished-notice is SKIPPED
    // (a second delivery — wake-up OR inject into a busy turn — would make the
    // parent answer twice).
    const parentRequests = adapter.requests.filter(request => request.sessionId === parent.id)
    expect(parentRequests).toHaveLength(1)

    // The parent session is shared across the whole suite, so count only
    // messages from this test's child.
    const messages = userMessages(parent).filter(message => message.source.senderSessionId === started.childId)
    const reports = messages.filter(message => message.source.kind === 'subagent-report')
    const settlements = messages.filter(message => message.source.kind === 'subagent-settled')
    expect(reports).toHaveLength(1)
    expect(settlements).toHaveLength(0)
    // The relay carries the child's own words.
    const reportText = reports[0]!.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    expect(reportText).toBe(`Background subagent ${started.childId} reported:\nan explicit report`)
  })

  it('still wakes the parent on settlement after a quiet report', async () => {
    const started = await ctx.subagents.startContinuable(startSpec(parent))
    const child = await vi.waitFor(() => {
      const live = ctx.agents.get(started.childId)
      expect(live).toBeDefined()
      return live!
    })
    // A `quiet` report never wakes the parent, so the settlement must still wake
    // it once — the parent would otherwise never learn the child finished.
    await ctx.subagents.reportFrom(child, message('a quiet report'), {
      delivery: 'quiet',
      signal: testSignal,
    })
    await waitNoActivation(ctx, started.childId)

    // Exactly one parent turn, and it is the settlement's (the quiet report was
    // injected without a turn, then the settlement woke the parent once).
    const parentRequests = adapter.requests.filter(request => request.sessionId === parent.id)
    expect(parentRequests).toHaveLength(1)

    const settlements = userMessages(parent)
      .filter(message => message.source.senderSessionId === started.childId)
      .filter(message => message.source.kind === 'subagent-settled')
    expect(settlements).toHaveLength(1)
  })

  afterAll(async () => {
    await ctx.fiber.dispose()
    rmSync(root, { recursive: true, force: true })
  })
})
