/**
 * The agent-preset editing wire dispatch: the `/agent-preset-edit` channel's
 * `readEditable` and `update` endpoints, exercised against a fake
 * `agentPresets` registry. The dispatch must keep the withdrawn apiproxy
 * domain's semantics — a `user` preset's structured fields are read and
 * rewritten line-scoped, a shipped preset is refused on update and answers no
 * fields on read, and every authoring failure maps onto the withdrawn domain's
 * wire codes (`agent-preset-not-found`, `agent-preset-read-only`,
 * `agent-preset-invalid`).
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  dispatchAgentPresetEdit, AGENT_PRESET_EDIT_CHANNEL,
} from '../../src/edit/wire/index.ts'
import { UnknownPresetError, type AgentPresets } from '@deepseek-ai/dsh-agent-presets'

/** A fake `agentPresets` registry double over a real composition on disk. */
async function fakeRegistry(opts: {
  trust: 'system' | 'user'
  composition?: string
  name?: string
}): Promise<{
  registry: AgentPresets
  dir: string
  roots: { path: string; trust: 'user' }[]
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-preset-edit-wire-'))
  const presetDir = join(root, 'mine')
  await mkdir(presetDir)
  const path = join(presetDir, 'agent.cordis.yml')
  const composition = opts.composition ?? '- id: persona\n  config:\n    text: original persona\n'
  await writeFile(path, composition, 'utf8')
  const registry = {
    resolve: async (id: string) => {
      if (id !== 'mine') throw new UnknownPresetError(id, [])
      return {
        id: 'mine',
        trust: opts.trust,
        path,
        ...opts.name === undefined ? {} : { name: opts.name },
      }
    },
    read: async (id: string) => {
      if (id !== 'mine') throw new Error('not found')
      return await readFile(path, 'utf8')
    },
    roots: [{ path: root, trust: 'user' as const }],
  } as unknown as AgentPresets
  return { registry, dir: presetDir, roots: [{ path: root, trust: 'user' }] }
}

const signal = new AbortController().signal

describe('agent-preset-edit wire readEditable', () => {
  it('reads a locally authored preset\'s structured fields', async () => {
    const { registry } = await fakeRegistry({
      trust: 'user',
      composition: [
        '- id: persona',
        '  config:',
        '    text: hello',
        '- id: tool-bash',
        "  name: '@deepseek-ai/dsh-tool-bash'",
        '',
      ].join('\n'),
      name: 'Mine',
    })

    const result = await dispatchAgentPresetEdit(registry, 'readEditable', { agentPreset: 'mine' }, signal)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toMatchObject({
      agentPreset: 'mine',
      persona: { text: 'hello' },
      tools: [{ id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: false }],
      name: 'Mine',
    })
  })

  it('answers no fields for a shipped preset', async () => {
    const { registry } = await fakeRegistry({ trust: 'system' })

    const result = await dispatchAgentPresetEdit(registry, 'readEditable', { agentPreset: 'mine' }, signal)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.value).toMatchObject({ agentPreset: 'mine', delegation: [], tools: [], catalog: [] })
  })

  it('reports an unknown id as agent-preset-not-found', async () => {
    const { registry } = await fakeRegistry({ trust: 'user' })

    const result = await dispatchAgentPresetEdit(registry, 'readEditable', { agentPreset: 'ghost' }, signal)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('agent-preset-not-found')
  })
})

describe('agent-preset-edit wire update', () => {
  it('rewrites the persona text line-scoped', async () => {
    const { registry, dir } = await fakeRegistry({ trust: 'user' })

    const result = await dispatchAgentPresetEdit(
      registry,
      'update',
      { agentPreset: 'mine', persona: { text: 'new persona' } },
      signal,
    )

    expect(result.ok).toBe(true)
    const edited = await readFile(join(dir, 'agent.cordis.yml'), 'utf8')
    expect(edited).toContain('text: new persona')
  })

  it('updates the display metadata and clears it when empty', async () => {
    const { registry, dir } = await fakeRegistry({ trust: 'user' })

    await dispatchAgentPresetEdit(
      registry,
      'update',
      { agentPreset: 'mine', metadata: { name: 'Renamed', description: 'A preset' } },
      signal,
    )
    const metadata = await readFile(join(dir, 'preset.yml'), 'utf8')
    expect(metadata).toContain('name: Renamed')

    await dispatchAgentPresetEdit(
      registry,
      'update',
      { agentPreset: 'mine', metadata: { name: '', description: '' } },
      signal,
    )
    await expect(readFile(join(dir, 'preset.yml'), 'utf8')).rejects.toThrow()
  })

  it('refuses to update a shipped preset', async () => {
    const { registry } = await fakeRegistry({ trust: 'system' })

    const result = await dispatchAgentPresetEdit(
      registry,
      'update',
      { agentPreset: 'mine', persona: { text: 'nope' } },
      signal,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('agent-preset-read-only')
  })

  it('maps an invalid edit to agent-preset-invalid, not internal', async () => {
    const { registry } = await fakeRegistry({
      trust: 'user',
      composition: '- id: persona\n  config:\n    text: x\n',
    })

    // A delegation edit naming a row the composition does not carry is refused
    // by the line-scoped editor with InvalidPresetEditsError.
    const result = await dispatchAgentPresetEdit(
      registry,
      'update',
      { agentPreset: 'mine', delegation: { 'tool-subagent': { provider: 'fork' } } },
      signal,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('agent-preset-invalid')
    expect((result.error.details as { reason?: string }).reason).toContain('no delegation group')
  })

  it('rejects an unknown endpoint', async () => {
    const { registry } = await fakeRegistry({ trust: 'user' })

    const result = await dispatchAgentPresetEdit(registry, 'nope', {}, signal)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe('bad-request')
  })

  it('exports the channel constant for registration', () => {
    expect(AGENT_PRESET_EDIT_CHANNEL).toBe('/agent-preset-edit')
  })
})
