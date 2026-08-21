/**
 * Task-entity wire tests: every `/memory-task` endpoint dispatches against the
 * registry service, maps its failure vocabulary onto wire codes, and answers an
 * empty roster when no registry is composed.
 */

import { describe, expect, it } from 'vitest'
import { TASK_WIRE_CHANNEL, dispatchTask } from '../src/tasks/wire/index.ts'
import { InvalidTaskInputError, UnknownTaskError } from '../src/tasks/types.ts'

/** A canned abort signal for wire calls. */
function signal(): AbortSignal {
  return new AbortController().signal
}

/** A task-shaped service response. */
function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1', title: '迁移', goal: '接入', status: 'running',
    roles: [{ roleId: 'lead', division: '方案' }], createdAt: 'now', completedAt: null, sessions: [],
    ...overrides,
  }
}

describe('memory-task wire', () => {
  it('serves the loopback /memory-task channel', () => {
    expect(TASK_WIRE_CHANNEL).toBe('/memory-task')
  })

  it('lists tasks through the registry', async () => {
    const list = () => [taskRow()]
    const tasks = { list } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(tasks, 'list', {}, signal())
    expect(result).toEqual({ ok: true, value: { tasks: [taskRow()] } })
  })

  it('passes includeCompleted through to the registry', async () => {
    let seen: unknown
    const list = (filter: unknown) => { seen = filter; return [taskRow()] }
    const tasks = { list } as unknown as Parameters<typeof dispatchTask>[0]
    await dispatchTask(tasks, 'list', { includeCompleted: true }, signal())
    expect(seen).toEqual({ includeCompleted: true })
  })

  it('answers an empty roster when no registry is composed', async () => {
    const result = await dispatchTask(undefined, 'list', {}, signal())
    expect(result).toEqual({ ok: true, value: { tasks: [] } })
  })

  it('reads one task through the registry', async () => {
    const read = () => taskRow()
    const tasks = { read } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(tasks, 'read', { id: 't1' }, signal())
    expect(result).toEqual({ ok: true, value: { task: taskRow() } })
  })

  it('creates a task through the registry', async () => {
    const create = (input: unknown) => { expect(input).toEqual({ title: 'a', goal: 'b' }); return taskRow() }
    const tasks = { create } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(tasks, 'create', { title: 'a', goal: 'b' }, signal())
    expect(result).toEqual({ ok: true, value: { task: taskRow() } })
  })

  it('completes a task through the registry', async () => {
    const complete = () => taskRow({ status: 'completed', completedAt: 'now2' })
    const tasks = { complete } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(tasks, 'complete', { id: 't1' }, signal())
    expect(result).toEqual({ ok: true, value: { task: taskRow({ status: 'completed', completedAt: 'now2' }) } })
  })

  it('attaches a session through the registry', async () => {
    let args: unknown[] = []
    const attachSession = (...a: unknown[]) => { args = a; return taskRow() }
    const tasks = { attachSession } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(
      tasks, 'attachSession', { taskId: 't1', sessionId: 's1', roleId: 'lead', kind: 'delegation' }, signal(),
    )
    expect(result).toEqual({ ok: true, value: { task: taskRow() } })
    expect(args).toEqual(['t1', 's1', 'lead', 'delegation'])
  })

  it('rejects an endpoint the channel does not serve', async () => {
    const result = await dispatchTask(undefined, 'explode', {}, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('maps a malformed payload to bad-request', async () => {
    const result = await dispatchTask(undefined, 'create', {}, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('bad-request')
  })

  it('maps an UnknownTaskError onto memory-task-not-found (typed)', async () => {
    const read = () => { throw new UnknownTaskError('t1', []) }
    const tasks = { read } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(tasks, 'read', { id: 't1' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('memory-task-not-found')
  })

  it('maps an InvalidTaskInputError onto memory-task-invalid (typed)', async () => {
    const create = () => { throw new InvalidTaskInputError('title must not be empty') }
    const tasks = { create } as unknown as Parameters<typeof dispatchTask>[0]
    const result = await dispatchTask(tasks, 'create', { title: 'a', goal: 'b' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('memory-task-invalid')
  })

  it('answers memory-task-not-found when no registry is composed', async () => {
    const result = await dispatchTask(undefined, 'read', { id: 't1' }, signal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('memory-task-not-found')
  })
})
