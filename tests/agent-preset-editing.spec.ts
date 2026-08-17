/**
 * The bundle's substance is its patch file: the `dsh.bundle.patch` manifest
 * field must name a real, parseable patch list that disables the official
 * main-preset settings row and mounts the enhanced editing surface plus the
 * editing wire channel. Every inserted row's module resolves from the bundle's
 * OWN exports (self-contained single package), never from another
 * @deepseek-ai scope package.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('dsh-harness-agent-preset-editing-bundle', () => {
  it('declares a parseable patch list through the dsh.bundle.patch manifest field', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
  })

  it('disables the official ui-agent-preset row and mounts the enhanced surface plus the editing wire', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    if (!Array.isArray(parsed)) throw new TypeError('agent-preset-editing patch must parse to a patch list')

    const disables = parsed.filter((patch): patch is { id?: string; disabled?: boolean } =>
      typeof patch === 'object' && patch !== null && 'disabled' in patch,
    )
    const disabledIds = new Set(disables.map(d => d.id))
    expect(disabledIds.has('ui-agent-preset'), 'must disable official row ui-agent-preset').toBe(true)
    // Disables never restate a name: a mismatching name would be skipped by the Loader.
    for (const d of disables) {
      expect(d, 'disable patch must not name a row').not.toHaveProperty('name')
    }

    const inserted = parsed.flatMap(
      patch => (typeof patch === 'object' && patch !== null && 'insert' in patch
        ? (patch as { insert?: { id?: string; name?: string }[] }).insert ?? []
        : []),
    )
    const byId = new Map(inserted.map(row => [row.id, row.name]))
    expect(byId.get('ui-agent-preset-editing')).toBe('dsh-harness-agent-preset-editing-bundle')
    expect(byId.get('agent-preset-edit')).toBe('dsh-harness-agent-preset-editing-bundle/edit/wire')
  })

  it('resolves every inserted row from the bundle\'s own exports (self-contained)', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; exports?: Record<string, { types?: string; default?: string }> }
    expect(manifest.exports).toBeDefined()
    for (const subpath of ['.', './edit/wire']) {
      expect(manifest.exports, `bundle must expose ${subpath} through its exports`).toHaveProperty(subpath)
    }
    // Every inserted row in the patch is a bundle-internal module (the specifier
    // starts with the bundle's own name), so the package is self-contained and
    // never resolves an absorbed package from the registry.
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    ) as { insert?: { name?: string }[] }[]
    const insertedNames = parsed.flatMap(
      patch => (patch.insert ?? []).map(row => row.name).filter((name): name is string => name !== undefined),
    )
    expect(insertedNames.length).toBeGreaterThan(0)
    for (const name of insertedNames) {
      expect(name, 'inserted row must resolve from this bundle').toMatch(/^dsh-harness-agent-preset-editing-bundle(\/|$)/)
    }
  })
})
