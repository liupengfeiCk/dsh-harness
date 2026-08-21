/**
 * Task-store unit tests: entity CRUD, session association (委派挂任务 /
 * 会话挂任务), task filtering, and the completion downweighting rule.
 *
 * Every suite opens an isolated `:memory:` store, so tests never touch the
 * real `~/.dsh/memory/tasks/tasks.db`.
 */

import { describe, expect, it } from 'vitest'
import { TaskStore } from '../src/tasks/store.ts'
import { InvalidTaskInputError, UnknownTaskError } from '../src/tasks/types.ts'

/** A fresh in-memory store per test. */
function openStore(): TaskStore {
  return TaskStore.openMemory()
}

describe('task store — create', () => {
  it('creates a running task with the given fields', () => {
    const store = openStore()
    const task = store.create({
      title: '迁移记忆引擎',
      goal: '把腾讯记忆引擎接入 DSH',
      roles: [{ roleId: 'lead', division: '整体方案与验收' }, { roleId: 'memory', division: 'L0/L1 提炼' }],
    })
    expect(task.id).toBeTypeOf('string')
    expect(task.id.length).toBeGreaterThan(0)
    expect(task.status).toBe('running')
    expect(task.title).toBe('迁移记忆引擎')
    expect(task.goal).toBe('把腾讯记忆引擎接入 DSH')
    expect(task.roles).toEqual([
      { roleId: 'lead', division: '整体方案与验收' },
      { roleId: 'memory', division: 'L0/L1 提炼' },
    ])
    expect(task.completedAt).toBeNull()
    expect(task.sessions).toEqual([])
    expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false)
    store.close()
  })

  it('rejects an empty title', () => {
    const store = openStore()
    expect(() => store.create({ title: '   ', goal: 'anything' })).toThrow(InvalidTaskInputError)
    store.close()
  })

  it('rejects an empty goal', () => {
    const store = openStore()
    expect(() => store.create({ title: 'x', goal: '  ' })).toThrow(InvalidTaskInputError)
    store.close()
  })

  it('rejects a role missing a division', () => {
    const store = openStore()
    expect(() => store.create({ title: 'x', goal: 'y', roles: [{ roleId: 'lead', division: ' ' }] }))
      .toThrow(InvalidTaskInputError)
    store.close()
  })

  it('defaults to no roles when none are given', () => {
    const store = openStore()
    const task = store.create({ title: 'x', goal: 'y' })
    expect(task.roles).toEqual([])
    store.close()
  })
})

describe('task store — read and update', () => {
  it('reads a task back by id', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    const read = store.read(created.id)
    expect(read.id).toBe(created.id)
    expect(read.title).toBe('x')
    store.close()
  })

  it('updates title/goal/roles', () => {
    const store = openStore()
    const created = store.create({ title: 'a', goal: 'b', roles: [{ roleId: 'r1', division: 'd1' }] })
    const updated = store.update(created.id, { title: 'a2', goal: 'b2', roles: [{ roleId: 'r2', division: 'd2' }] })
    expect(updated.title).toBe('a2')
    expect(updated.goal).toBe('b2')
    expect(updated.roles).toEqual([{ roleId: 'r2', division: 'd2' }])
    expect(updated.id).toBe(created.id)
    store.close()
  })

  it('throws UnknownTaskError reading a missing task', () => {
    const store = openStore()
    expect(() => store.read('nope')).toThrow(UnknownTaskError)
    store.close()
  })

  it('throws UnknownTaskError updating a missing task', () => {
    const store = openStore()
    expect(() => store.update('nope', { title: 'x' })).toThrow(UnknownTaskError)
    store.close()
  })
})

describe('task store — completion and downweighting', () => {
  it('completes a task and stamps completedAt', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    expect(store.isCompleted(created.id)).toBe(false)
    const completed = store.complete(created.id)
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeTypeOf('string')
    expect(store.isCompleted(created.id)).toBe(true)
    store.close()
  })

  it('completing is idempotent (keeps the original completedAt)', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    const first = store.complete(created.id)
    const second = store.complete(created.id)
    expect(second.completedAt).toBe(first.completedAt)
    store.close()
  })

  it('list excludes completed tasks by default (downweighting)', () => {
    const store = openStore()
    const running = store.create({ title: 'r', goal: 'active' })
    const done = store.create({ title: 'd', goal: 'done' })
    store.complete(done.id)
    const active = store.list()
    expect(active.map(t => t.id)).toEqual([running.id])
    expect(active.map(t => t.title)).toEqual(['r'])
    store.close()
  })

  it('list surfaces completed tasks only with includeCompleted (explicit query)', () => {
    const store = openStore()
    const running = store.create({ title: 'r', goal: 'active' })
    const done = store.create({ title: 'd', goal: 'done' })
    store.complete(done.id)
    const all = store.list({ includeCompleted: true })
    expect(all.map(t => t.title).sort()).toEqual(['d', 'r'])
    expect(all.map(t => t.id)).toContain(running.id)
    store.close()
  })

  it('activeTaskIds excludes completed tasks', () => {
    const store = openStore()
    const running = store.create({ title: 'r', goal: 'active' })
    const done = store.create({ title: 'd', goal: 'done' })
    store.complete(done.id)
    expect(store.activeTaskIds()).toEqual([running.id])
    store.close()
  })

  it('isCompleted returns false for a missing task', () => {
    const store = openStore()
    expect(store.isCompleted('nope')).toBe(false)
    store.close()
  })
})

describe('task store — association (委派挂任务 / 会话挂任务)', () => {
  it('attaches a session and lists it on the task', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    const task = store.attachSession(created.id, 'session-1', undefined, 'session')
    expect(task.sessions).toEqual([
      { sessionId: 'session-1', kind: 'session', attachedAt: expect.any(String) },
    ])
    store.close()
  })

  it('attaches a delegation with a role id', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    const task = store.attachSession(created.id, 'session-2', 'lead', 'delegation')
    expect(task.sessions).toEqual([
      { sessionId: 'session-2', roleId: 'lead', kind: 'delegation', attachedAt: expect.any(String) },
    ])
    store.close()
  })

  it('persists multiple associations across reads', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    store.attachSession(created.id, 's1', undefined, 'session')
    store.attachSession(created.id, 's2', 'memory', 'delegation')
    const read = store.read(created.id)
    expect(read.sessions.map(s => s.sessionId)).toEqual(['s1', 's2'])
    expect(read.sessions.map(s => s.kind)).toEqual(['session', 'delegation'])
    store.close()
  })

  it('throws UnknownTaskError attaching to a missing task', () => {
    const store = openStore()
    expect(() => store.attachSession('nope', 's1', undefined, 'session')).toThrow(UnknownTaskError)
    store.close()
  })

  it('rejects an empty session id', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    expect(() => store.attachSession(created.id, '  ', undefined, 'session')).toThrow(InvalidTaskInputError)
    store.close()
  })

  it('detaches a session', () => {
    const store = openStore()
    const created = store.create({ title: 'x', goal: 'y' })
    store.attachSession(created.id, 's1', undefined, 'session')
    store.detachSession(created.id, 's1')
    expect(store.read(created.id).sessions).toEqual([])
    store.close()
  })
})
