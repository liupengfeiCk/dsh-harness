/**
 * Subagent registry: discovery, broken detection, enabled persistence,
 * resolution, and mount-on-child via the shared plugin-tree mechanism.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import {
  mkdir as mkdirPromise, readFile as readFilePromise, writeFile as writeFilePromise,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { pathToFileURL } from 'node:url'
import SubagentPresets from '../../src/preset/index.ts'
import { createSubagent, updateSubagent } from '../../src/preset/authoring.ts'

/** A temp root holding one subagent per call. */
function makeRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-subagent-preset-'))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

/** Mount a context with the loader and the subagent registry over `root`. */
async function makeCtx(root: string, trust: 'system' | 'user' = 'system'): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(SubagentPresets, { roots: [{ path: root, trust }], includeUserRoot: false })
  return ctx
}

/** Write a mountable subagent directory. */
async function writeSubagent(root: string, id: string, enabled = true): Promise<void> {
  const dir = join(root, id)
  await mkdirPromise(dir, { recursive: true })
  await writeFilePromise(join(dir, 'agent.cordis.yml'),
    "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a helper.\n")
  await writeFilePromise(join(dir, 'subagent.yml'), `enabled: ${String(enabled)}\n`)
}

describe('dsh-subagent-preset discovery', () => {
  afterEach(() => {})

  it('discovers mountable subagents and reads their metadata', async () => {
    const { root, cleanup } = makeRoot()
    await writeSubagent(root, 'reviewer')
    const ctx = await makeCtx(root)
    try {
      const rows = await ctx.subagentPresets.list()
      expect(rows).toHaveLength(1)
      const reviewer = rows[0]
      expect(reviewer!.id).toBe('reviewer')
      expect(reviewer!.trust).toBe('system')
      expect(reviewer!.broken).toBeUndefined()
      expect(reviewer!.metadata.enabled).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('discards an old-format bare model string while parsing the rest of the metadata', async () => {
    const { root, cleanup } = makeRoot()
    const dir = join(root, 'reviewer')
    await mkdirPromise(dir, { recursive: true })
    await writeFilePromise(join(dir, 'agent.cordis.yml'),
      "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a helper.\n")
    // Pre-release storage may hold a bare model string (no provider); the
    // metadata reader must tolerate it by discarding it rather than crashing.
    await writeFilePromise(join(dir, 'subagent.yml'),
      'description: Reviews the change.\nenabled: true\nmodel: deepseek-v4\n')
    const ctx = await makeCtx(root)
    try {
      const reviewer = (await ctx.subagentPresets.list())[0]
      expect(reviewer!.metadata.model).toBeUndefined()
      expect(reviewer!.metadata.description).toBe('Reviews the change.')
      expect(reviewer!.metadata.enabled).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('marks a missing or malformed composition as broken rather than skipping it', async () => {
    const { root, cleanup } = makeRoot()
    await mkdirPromise(join(root, 'ghost'), { recursive: true })
    const dir = join(root, 'broken')
    await mkdirPromise(dir, { recursive: true })
    await writeFilePromise(join(dir, 'agent.cordis.yml'), 'not: [valid yaml')
    const ctx = await makeCtx(root)
    try {
      const rows = await ctx.subagentPresets.list()
      expect(rows.map(r => r.id).sort()).toEqual(['broken', 'ghost'])
      expect(rows.find(r => r.id === 'ghost')!.broken).toContain('is missing')
      expect(rows.find(r => r.id === 'broken')!.broken).toContain('not valid YAML')
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('resolves a subagent by id and refuses an unknown one', async () => {
    const { root, cleanup } = makeRoot()
    await writeSubagent(root, 'helper')
    const ctx = await makeCtx(root)
    try {
      const resolved = await ctx.subagentPresets.resolve('helper')
      expect(resolved.id).toBe('helper')
      await expect(ctx.subagentPresets.resolve('nope')).rejects.toThrow('not found')
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('reads an explicit inheritParent: true as inheritance-on', async () => {
    const { root, cleanup } = makeRoot()
    const dir = join(root, 'inheriting')
    await mkdirPromise(dir, { recursive: true })
    await writeFilePromise(join(dir, 'agent.cordis.yml'),
      "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a helper.\n")
    await writeFilePromise(join(dir, 'subagent.yml'),
      'description: Inherits the parent.\nenabled: true\ninheritParent: true\n')
    const ctx = await makeCtx(root)
    try {
      const row = (await ctx.subagentPresets.list())[0]
      expect(row!.metadata.inheritParent).toBe(true)
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('reads an explicit inheritParent: false as inheritance-off', async () => {
    const { root, cleanup } = makeRoot()
    const dir = join(root, 'standalone')
    await mkdirPromise(dir, { recursive: true })
    await writeFilePromise(join(dir, 'agent.cordis.yml'),
      "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: I am a helper.\n")
    await writeFilePromise(join(dir, 'subagent.yml'),
      'description: Standalone.\nenabled: true\ninheritParent: false\n')
    const ctx = await makeCtx(root)
    try {
      const row = (await ctx.subagentPresets.list())[0]
      expect(row!.metadata.inheritParent).toBe(false)
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('defaults an absent inheritParent to undefined (no inheritance)', async () => {
    const { root, cleanup } = makeRoot()
    // `writeSubagent` writes only `enabled`, so the metadata carries no
    // `inheritParent` key — the default for a self-contained subagent.
    await writeSubagent(root, 'plain')
    const ctx = await makeCtx(root)
    try {
      const row = (await ctx.subagentPresets.list())[0]
      expect(row!.metadata.inheritParent).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })
})

describe('dsh-subagent-preset authoring and persistence', () => {
  it('persists the enabled toggle through updateSubagent', async () => {
    const { root, cleanup } = makeRoot()
    await writeSubagent(root, 'helper', true)
    const ctx = await makeCtx(root)
    const userRoot = join(root, 'user')
    await mkdirPromise(userRoot, { recursive: true })
    const authoringCtx = await makeCtx(userRoot, 'user')
    try {
      const source = await ctx.subagentPresets.resolve('helper')
      await createSubagent([{ path: userRoot, trust: 'user' }], source, 'copy')
      await updateSubagent(
        [{ path: userRoot, trust: 'user' }],
        await authoringCtx.subagentPresets.resolve('copy'),
        { enabled: false },
      )
      const after = await authoringCtx.subagentPresets.resolve('copy')
      expect(after.metadata.enabled).toBe(false)
    } finally {
      await authoringCtx.fiber.dispose()
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('persists inheritParent: true and omits the key for the default (false)', async () => {
    const { root, cleanup } = makeRoot()
    await writeSubagent(root, 'helper', true)
    const ctx = await makeCtx(root)
    const userRoot = join(root, 'user')
    await mkdirPromise(userRoot, { recursive: true })
    const authoringCtx = await makeCtx(userRoot, 'user')
    try {
      const source = await ctx.subagentPresets.resolve('helper')
      await createSubagent([{ path: userRoot, trust: 'user' }], source, 'copy')
      const copy = await authoringCtx.subagentPresets.resolve('copy')

      // Opting in writes the key.
      await updateSubagent(
        [{ path: userRoot, trust: 'user' }], copy, { enabled: true, inheritParent: true },
      )
      expect((await authoringCtx.subagentPresets.resolve('copy')).metadata.inheritParent).toBe(true)
      expect(await readFilePromise(join(userRoot, 'copy', 'subagent.yml'), 'utf8')).toContain('inheritParent: true')

      // Turning it back off clears the key (absent reads as no inheritance).
      await updateSubagent(
        [{ path: userRoot, trust: 'user' }],
        await authoringCtx.subagentPresets.resolve('copy'),
        { enabled: true, inheritParent: false },
      )
      const after = await authoringCtx.subagentPresets.resolve('copy')
      expect(after.metadata.inheritParent).toBeUndefined()
      expect(await readFilePromise(join(userRoot, 'copy', 'subagent.yml'), 'utf8')).not.toContain('inheritParent')
    } finally {
      await authoringCtx.fiber.dispose()
      await ctx.fiber.dispose()
      cleanup()
    }
  })

  it('refuses to delegate to a disabled subagent', async () => {
    const { root, cleanup } = makeRoot()
    await writeSubagent(root, 'helper', false)
    const ctx = await makeCtx(root)
    try {
      // mountOnChild refuses a disabled subagent.
      await expect(ctx.subagentPresets.mountOnChild(new Context() as never, 'helper')).rejects.toThrow('disabled')
    } finally {
      await ctx.fiber.dispose()
      cleanup()
    }
  })
})

describe('dsh-subagent-preset shipped enabled override', () => {
  const previousHome = process.env.DSH_HOME

  afterEach(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  })

  it('toggles a shipped subagent through a harness-home override, leaving its install untouched', async () => {
    const { root, cleanup } = makeRoot()
    const home = mkdtempSync(join(tmpdir(), 'dsh-subagent-home-'))
    process.env.DSH_HOME = home
    await writeSubagent(root, 'reviewer', true)
    const ctx = await makeCtx(root, 'system')
    try {
      expect((await ctx.subagentPresets.resolve('reviewer')).metadata.enabled).toBe(true)
      await ctx.subagentPresets.setEnabled('reviewer', false)
      // The row now reads disabled, so delegation refuses it like a locally
      // authored disabled subagent.
      expect((await ctx.subagentPresets.resolve('reviewer')).metadata.enabled).toBe(false)
      await expect(ctx.subagentPresets.mountOnChild(new Context() as never, 'reviewer')).rejects.toThrow('disabled')
      // The shipped install was not rewritten: the override lives beside the
      // harness home, and the factory file still declares enabled.
      expect(await readFilePromise(join(root, 'reviewer', 'subagent.yml'), 'utf8')).toContain('enabled: true')
    } finally {
      await ctx.fiber.dispose()
      cleanup()
      rmSync(home, { recursive: true, force: true })
    }
  })
})
