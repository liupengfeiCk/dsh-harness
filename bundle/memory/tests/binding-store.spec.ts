/**
 * Role↔asset binding store tests (T14 "装配规则").
 *
 * Verifies the bindings document persists, tolerates a missing/corrupt file,
 * and round-trips bind/unbind/idempotence and role enumeration.
 *
 * @module dsh-harness-memory-bundle/tests/binding-store
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BINDINGS_FILE, RoleBindingStore, loadBindings, saveBindings,
} from '../src/memory/binding-store.ts'

describe('loadBindings / saveBindings', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mem-bindings-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns empty on a missing file', async () => {
    const doc = await loadBindings(join(dir, 'missing.json'))
    expect(doc.roles).toEqual({})
  })

  it('returns empty on a corrupt file', async () => {
    const file = join(dir, 'bad.json')
    await saveBindings(file, { roles: {} })
    await rm(file)
    // Write garbage directly.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(file, '{ not json', 'utf8')
    const doc = await loadBindings(file)
    expect(doc.roles).toEqual({})
  })

  it('round-trips a document through save/load', async () => {
    const file = join(dir, BINDINGS_FILE)
    await saveBindings(file, { roles: { 'role-a': ['record:x', 'profile:p'] } })
    const doc = await loadBindings(file)
    expect(doc.roles['role-a']).toEqual(['record:x', 'profile:p'])
  })
})

describe('RoleBindingStore', () => {
  let dir: string
  let file: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mem-bindings-'))
    file = join(dir, BINDINGS_FILE)
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('binds and reads assets for a role', async () => {
    const store = new RoleBindingStore(file)
    await store.bind('role-a', 'record:1')
    await store.bind('role-a', 'profile:p')
    expect(await store.assetsFor('role-a')).toEqual(['record:1', 'profile:p'])
  })

  it('is idempotent on a repeated bind', async () => {
    const store = new RoleBindingStore(file)
    await store.bind('role-a', 'record:1')
    await store.bind('role-a', 'record:1')
    expect(await store.assetsFor('role-a')).toEqual(['record:1'])
  })

  it('unbinds an asset and drops the role when empty', async () => {
    const store = new RoleBindingStore(file)
    await store.bind('role-a', 'record:1')
    await store.unbind('role-a', 'record:1')
    expect(await store.assetsFor('role-a')).toEqual([])
    expect(await store.roles()).toEqual([])
  })

  it('persists across instances (durable relation)', async () => {
    const a = new RoleBindingStore(file)
    await a.bind('role-a', 'record:1')
    const b = new RoleBindingStore(file)
    expect(await b.assetsFor('role-a')).toEqual(['record:1'])
  })
})
