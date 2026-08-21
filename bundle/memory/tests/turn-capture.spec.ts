/**
 * T5 turn-capture wiring tests.
 *
 * Verifies that committed turns are projected from the live session into a
 * vendor `CompletedTurn` (identity coordinates folded into the session key,
 * user/assistant surface projected in log order), and that `installTurnCapture`
 * subscribes the session event stream and commits on each `turn/end`.
 *
 * The commit seam (`MemoryLike.onTurnCommitted`) is stubbed here; the real
 * engine round-trip (message → L0 row) is covered by the memory engine
 * integration, which mounts `Memory` with a mock LLM adapter.
 *
 * @module dsh-harness-memory-bundle/tests/turn-capture
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import {
  buildCompletedTurn,
  installTurnCapture,
  projectTurnMessage,
  projectTurnMessages,
  type CompletedTurnLike,
} from '../src/ingestion/turn-capture.ts'
import { MAIN_AGENT_ROLE, DEFAULT_TEAM, DEFAULT_USER_ID } from '../src/ingestion/attribution.ts'

function userMsg(text: string): ReturnType<typeof createUserMessage> {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

function assistantMsg(text: string): { turn: number; step: number; message: ReturnType<typeof createAssistantMessage> } {
  return {
    turn: 1,
    step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text }], model: 'test' }),
  }
}

async function makeSession(id = 's-turn'): Promise<import('@deepseek-ai/dsh-session').Session> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  return ctx.sessions.create(SessionId(id))
}

function tasksMock(sessions: { sessionId: string; roleId?: string }[]): unknown {
  return {
    list: () => [{ id: 'task-1', sessions }],
  }
}

describe('projectTurnMessage / projectTurnMessages', () => {
  it('projects a user message with its text', async () => {
    const session = await makeSession()
    session.append('user/message', userMsg('hello world'), { surfaceOp: 'append' })
    const event = session.events.find((e) => e.type === 'user/message')
    expect(event).toBeDefined()
    const message = projectTurnMessage(session, event!)
    expect(message?.role).toBe('user')
    expect(message?.content).toBe('hello world')
    expect(message?.timestamp).toBeGreaterThan(0)
  })

  it('projects assistant messages with their text', async () => {
    const session = await makeSession()
    session.append('assistant/message', assistantMsg('hi there'), { surfaceOp: 'append' })
    const event = session.events.find((e) => e.type === 'assistant/message')
    const message = projectTurnMessage(session, event!)
    expect(message?.role).toBe('assistant')
    expect(message?.content).toBe('hi there')
  })

  it('ignores non user/assistant events and blank text', async () => {
    const session = await makeSession()
    session.append('user/message', userMsg('  '), { surfaceOp: 'append' })
    const userEvent = session.events.find((e) => e.type === 'user/message')
    expect(projectTurnMessage(session, userEvent!)).toBeNull()
    // An arbitrary event (turn/start) is not projected.
    const turnStart = { type: 'turn/start', seq: 1, data: { turn: 1 } } as never
    expect(projectTurnMessage(session, turnStart)).toBeNull()
  })

  it('projects messages in log order', async () => {
    const session = await makeSession()
    session.append('user/message', userMsg('one'), { surfaceOp: 'append' })
    session.append('assistant/message', assistantMsg('two'), { surfaceOp: 'append' })
    session.append('user/message', userMsg('three'), { surfaceOp: 'append' })
    const messages = projectTurnMessages(session)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages.map((m) => m.content)).toEqual(['one', 'two', 'three'])
  })
})

describe('buildCompletedTurn', () => {
  it('builds a CompletedTurn with identity coordinates for a main session', async () => {
    const ctx = new Context()
    const session = await makeSession('s-main')
    session.append('user/message', userMsg('who are you'), { surfaceOp: 'append' })
    session.append('assistant/message', assistantMsg('I am memory'), { surfaceOp: 'append' })
    const turn = buildCompletedTurn(ctx, session)
    expect(turn.sessionId).toBe('s-main')
    // project '' and no task → the key folds as `team/role///session`.
    expect(turn.sessionKey).toBe(`${DEFAULT_TEAM}/${MAIN_AGENT_ROLE}///s-main`)
    expect(turn.userText).toContain('who are you')
    expect(turn.assistantText).toContain('I am memory')
    expect(turn.messages).toHaveLength(2)
    expect(turn.startedAt).toBeTypeOf('number')
  })

  it('encodes team + role + task + session for a delegated subagent', async () => {
    const ctx = new Context()
    ctx.provide('tasks', tasksMock([{ sessionId: 's-sub', roleId: 'lead' }]))
    const session = await makeSession('s-sub')
    session.append('user/message', userMsg('build the feature'), { surfaceOp: 'append' })
    const turn = buildCompletedTurn(ctx, session)
    // team default + role lead + project '' + task-1 + session s-sub
    expect(turn.sessionKey).toBe('default/lead//task-1/s-sub')
    // T6 L0/L1 归属标签: agentId carries the roster role, teamId the team, and
    // taskId stays independent — these feed the L0 record so the L2 profile
    // scope `team:{t}|agent:{lead}` can materialize.
    expect(turn.agentId).toBe('lead')
    expect(turn.teamId).toBe(DEFAULT_TEAM)
    expect(turn.taskId).toBe('task-1')
  })

  it('omits taskId when the session belongs to no task', async () => {
    const ctx = new Context()
    const session = await makeSession('s-standalone')
    session.append('user/message', userMsg('hi'), { surfaceOp: 'append' })
    const turn = buildCompletedTurn(ctx, session)
    expect(turn.agentId).toBe(MAIN_AGENT_ROLE)
    expect(turn.taskId).toBeUndefined()
  })

  it('uses the roster role for a delegated subagent', async () => {
    const ctx = new Context()
    ctx.provide('tasks', tasksMock([{ sessionId: 's-sub', roleId: 'memory' }]))
    const session = await makeSession('s-sub')
    session.append('user/message', userMsg('x'), { surfaceOp: 'append' })
    const turn = buildCompletedTurn(ctx, session)
    expect(turn.sessionKey.startsWith('default/memory/')).toBe(true)
  })
})

describe('installTurnCapture', () => {
  it('commits a CompletedTurn on turn/end', async () => {
    const ctx = new Context()
    const session = await makeSession('s-cap')
    session.append('user/message', userMsg('remember this'), { surfaceOp: 'append' })
    session.append('assistant/message', assistantMsg('sure'), { surfaceOp: 'append' })
    const committed: CompletedTurnLike[] = []
    const memory = { onTurnCommitted: async (t: CompletedTurnLike) => { committed.push(t) } }
    installTurnCapture(ctx, memory)
    ctx.emit('session/event' as never, session, { type: 'turn/end', seq: 99, data: { turn: 1, reason: { kind: 'completed' } } } as never)
    // The commit runs best-effort in a microtask.
    await vi.waitFor(() => {
      expect(committed).toHaveLength(1)
    })
    expect(committed[0]?.sessionId).toBe('s-cap')
    expect(committed[0]?.userText).toBe('remember this')
    expect(committed[0]?.assistantText).toBe('sure')
  })

  it('ignores events that are not turn/end', async () => {
    const ctx = new Context()
    const session = await makeSession('s-ign')
    const committed: CompletedTurnLike[] = []
    const memory = { onTurnCommitted: async (t: CompletedTurnLike) => { committed.push(t) } }
    installTurnCapture(ctx, memory)
    ctx.emit('session/event' as never, session, { type: 'user/message', seq: 1, data: { turn: 1, step: 0, content: [] } } as never)
    await new Promise((r) => setTimeout(r, 20))
    expect(committed).toHaveLength(0)
  })
})
