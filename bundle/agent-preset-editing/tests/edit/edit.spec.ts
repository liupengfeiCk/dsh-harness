/**
 * Line-scoped composition editing: only the named fields change, comments and
 * sibling rows survive byte-for-byte, and every edit is validated with the
 * loader's own dialect before it is accepted.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { applyEdits, discoverToolPackages, readEditableFields } from '../../src/edit/index.ts'

/** A composition shaped like a real preset: persona, a `!!js` row, a delegation group. */
const SAMPLE = [
  '# The persona: a folded block prompt.',
  '- id: persona',
  "  name: '@deepseek-ai/dsh-persona'",
  '  config:',
  '    text: >-',
  '      You are a coding agent. Your cwd is {{cwd}}.',
  '',
  '- id: shell-gate',
  "  name: '@deepseek-ai/dsh-tool-bash'",
  '  disabled: !!js process.platform === \'win32\'',
  '',
  '- id: delegation',
  '  name: cordis:group',
  '  group: true',
  '  isolate:',
  '    workflowEngine: true',
  '  config:',
  '    - id: tool-subagent',
  "      name: '@deepseek-ai/dsh-tool-subagent'",
  '      config:',
  '        provider: spawn',
  '        toolName: subagent',
  '        backgroundMode: continuable',
  '',
  '    - id: tool-subagent-fork',
  "      name: '@deepseek-ai/dsh-tool-subagent'",
  '      config:',
  '        provider: fork',
  '        toolName: subagent_fork',
  '        backgroundMode: continuable',
  '',
  '',
].join('\n')

describe('readEditableFields', () => {
  it('reports the persona text, every delegation instance, and the tool rows', () => {
    const fields = readEditableFields(SAMPLE)

    expect(fields.persona?.text).toBe('You are a coding agent. Your cwd is {{cwd}}.')
    // spawn/fork back depthLimit + prepareContinuable, so they expose the full
    // field set; keys the file omits (enableRunInBackground, maxDepth) carry the
    // loader defaults rather than being absent.
    expect(fields.delegation).toEqual([
      {
        id: 'tool-subagent',
        provider: 'spawn',
        toolName: 'subagent',
        backgroundMode: 'continuable',
        backgroundModeLocked: false,
        enableRunInBackground: true,
        maxDepth: 3,
      },
      {
        id: 'tool-subagent-fork',
        provider: 'fork',
        toolName: 'subagent_fork',
        backgroundMode: 'continuable',
        backgroundModeLocked: false,
        enableRunInBackground: true,
        maxDepth: 3,
      },
    ])
    // The tool inventory covers every @deepseek-ai/dsh-tool-* row: the top-level
    // shell-gate plus the delegation group's tool-subagent instances (a row is
    // both a delegation config and a toggleable tool).
    expect(fields.tools.map(tool => tool.id)).toEqual(['shell-gate', 'tool-subagent', 'tool-subagent-fork'])
  })

  it('reports an empty delegation and tools when the group or rows are absent', () => {
    const bare = [
      '- id: persona',
      '  config:',
      '    text: hello',
      '- id: tool-bash',
      '  name: x',
      '',
    ].join('\n')

    const fields = readEditableFields(bare)
    expect(fields.persona?.text).toBe('hello')
    expect(fields.delegation).toEqual([])
    expect(fields.tools).toEqual([])
  })

  it('locks backgroundMode to one-shot and withholds maxDepth for codex/claude-code', () => {
    // These providers declare NO_START_CAPABILITIES and no prepareContinuable:
    // backgroundMode renders (locked to the loader default) but maxDepth is
    // withheld — no depthLimit capability backs a numeric cap.
    const composition = [
      '- id: delegation',
      '  name: cordis:group',
      '  group: true',
      '  config:',
      '    - id: tool-subagent-codex',
      "      name: '@deepseek-ai/dsh-tool-subagent'",
      '      config:',
      '        provider: codex',
      '        toolName: subagent_codex',
      '',
      '    - id: tool-subagent-claude-code',
      "      name: '@deepseek-ai/dsh-tool-subagent'",
      '      config:',
      '        provider: claude-code',
      '        toolName: subagent_cc',
      '',
    ].join('\n')

    const fields = readEditableFields(composition)
    expect(fields.delegation).toEqual([
      {
        id: 'tool-subagent-codex',
        provider: 'codex',
        toolName: 'subagent_codex',
        backgroundMode: 'one-shot',
        backgroundModeLocked: true,
        enableRunInBackground: true,
      },
      {
        id: 'tool-subagent-claude-code',
        provider: 'claude-code',
        toolName: 'subagent_cc',
        backgroundMode: 'one-shot',
        backgroundModeLocked: true,
        enableRunInBackground: true,
      },
    ])
  })

  it('keeps a file-written value over the loader default', () => {
    const composition = [
      '- id: delegation',
      '  name: cordis:group',
      '  group: true',
      '  config:',
      '    - id: tool-subagent',
      "      name: '@deepseek-ai/dsh-tool-subagent'",
      '      config:',
      '        provider: spawn',
      '        toolName: subagent',
      '        enableRunInBackground: false',
      '        maxDepth: 5',
      '',
    ].join('\n')

    const fields = readEditableFields(composition)
    expect(fields.delegation).toEqual([{
      id: 'tool-subagent',
      provider: 'spawn',
      toolName: 'subagent',
      backgroundMode: 'one-shot',
      backgroundModeLocked: false,
      enableRunInBackground: false,
      maxDepth: 5,
    }])
  })

  it('lists the runtime-discovered catalog with installed marks and prose', () => {
    const fields = readEditableFields(SAMPLE, [
      { name: '@deepseek-ai/dsh-tool-bash', description: 'Run shell commands.' },
      { name: '@deepseek-ai/dsh-tool-fs', description: 'Read and write files.' },
    ])

    // The catalog covers exactly the discovered packages (whether the preset
    // carries them or not); `installed` marks the ones already present.
    // SAMPLE carries shell-gate (tool-bash) and the tool-subagent rows.
    expect(fields.catalog).toEqual([
      { name: '@deepseek-ai/dsh-tool-bash', toolNames: [], description: 'Run shell commands.', installed: true },
      { name: '@deepseek-ai/dsh-tool-fs', toolNames: [], description: 'Read and write files.', installed: false },
    ])
    // The installed tool row's prose rides the discovered package too.
    expect(fields.tools.find(tool => tool.id === 'shell-gate')?.description).toBe('Run shell commands.')
  })

  it('reads no catalog and no prose when the caller discovers no packages', () => {
    const fields = readEditableFields(SAMPLE)

    expect(fields.catalog).toEqual([])
    expect(fields.tools.find(tool => tool.id === 'shell-gate')?.description).toBeUndefined()
  })
})

describe('discoverToolPackages', () => {
  it('enumerates dsh-tool-* packages with their manifest descriptions', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-tool-scan-'))
    try {
      const scope = join(root, 'node_modules', '@deepseek-ai')
      mkdirSync(join(scope, 'dsh-tool-fake'), { recursive: true })
      writeFileSync(
        join(scope, 'dsh-tool-fake', 'package.json'),
        JSON.stringify({ name: '@deepseek-ai/dsh-tool-fake', description: 'A fake tool.' }),
      )
      mkdirSync(join(scope, 'dsh-tool-bare'), { recursive: true })
      // No manifest at all: still lists by name, without prose.
      mkdirSync(join(scope, 'dsh-not-a-tool'), { recursive: true })

      expect(discoverToolPackages([root])).toEqual([
        { name: '@deepseek-ai/dsh-tool-bare' },
        { name: '@deepseek-ai/dsh-tool-fake', description: 'A fake tool.' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('answers an empty list where no scope directory exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-tool-scan-empty-'))
    try {
      expect(discoverToolPackages([root])).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('applyEdits', () => {
  it('rewrites the persona text and keeps every other line byte-for-byte', () => {
    const edited = applyEdits(SAMPLE, { persona: { text: 'A sharper persona.' } }, 'p')

    expect(edited).toContain('text: A sharper persona.')
    // Comments, the `!!js` expression, and the delegation group survive.
    expect(edited).toContain('# The persona: a folded block prompt.')
    expect(edited).toContain('!!js process.platform')
    expect(edited).toContain('- id: tool-subagent-fork')
    // Loadable under the loader's own dialect.
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('rewrites a present delegation key and leaves the untouched sibling rows alone', () => {
    const edited = applyEdits(SAMPLE, { delegation: { 'tool-subagent': { backgroundMode: 'one-shot', enableRunInBackground: false } } }, 'p')

    expect(edited).toContain('backgroundMode: one-shot')
    expect(edited).toContain('enableRunInBackground: false')
    // The row's provider (identity) and the secondary instance are untouched.
    expect(edited).toContain('provider: spawn')
    expect(edited).toContain('toolName: subagent_fork')
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('inserts a capability field the target row does not carry', () => {
    // enableRunInBackground is absent from SAMPLE's tool-subagent row, but it is
    // a capability-supported field with a default, so editing it INSERTS the key
    // rather than being refused.
    const edited = applyEdits(SAMPLE, { delegation: { 'tool-subagent': { enableRunInBackground: false } } }, 'p')

    expect(edited).toContain('enableRunInBackground: false')
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('inserts several absent keys on one row in the order they were declared', () => {
    // SAMPLE's tool-subagent row omits enableRunInBackground and maxDepth, so
    // editing both INSERTS both. They land in the config block in the same
    // order the caller staged them, not reversed by the bottom-up splice.
    const edited = applyEdits(
      SAMPLE,
      { delegation: { 'tool-subagent': { enableRunInBackground: false, maxDepth: 5 } } },
      'p',
    )

    const row = edited.slice(edited.indexOf('- id: tool-subagent'), edited.indexOf('- id: tool-subagent-fork'))
    expect(row.indexOf('enableRunInBackground: false')).toBeLessThan(row.indexOf('maxDepth: 5'))
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('refuses an edit to the read-only provider (no edit path)', () => {
    expect(() => applyEdits(SAMPLE, { delegation: { 'tool-subagent': { provider: 'fork' } } }, 'p'))
      .toThrow(/provider key is not editable/)
  })

  it('refuses an edit to the read-only toolName', () => {
    expect(() => applyEdits(SAMPLE, { delegation: { 'tool-subagent-fork': { toolName: 'subagent' } } }, 'p'))
      .toThrow(/toolName key is not editable/)
  })

  it('refuses an edit to a preset with no persona row', () => {
    const noPersona = [
      '- id: tool-bash',
      '  name: x',
      '- id: delegation',
      '  name: cordis:group',
      '  group: true',
      '  config:',
      '    - id: tool-subagent',
      '      name: y',
      '      config:',
      '        provider: spawn',
      '',
    ].join('\n')
    expect(() => applyEdits(noPersona, { persona: { text: 'x' } }, 'p'))
      .toThrow(/no persona row/)
  })

  it('refuses an edit to a composition that cannot parse', () => {
    const broken = SAMPLE + '- id: [unclosed\n'
    expect(() => applyEdits(broken, { persona: { text: 'x' } }, 'p'))
      .toThrow(/not valid YAML/)
  })

  it('accepts a persona text with line breaks without breaking the file', () => {
    const edited = applyEdits(SAMPLE, { persona: { text: 'Line one.\nLine two.' } }, 'p')

    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
    expect(edited).toContain('Line two.')
  })

  it('edits a SECOND delegation instance by id, leaving the first alone', () => {
    const edited = applyEdits(SAMPLE, { delegation: { 'tool-subagent-fork': { backgroundMode: 'one-shot' } } }, 'p')

    expect(edited).toContain('backgroundMode: one-shot')
    // The primary instance keeps its continuable background mode.
    expect(edited).toContain('backgroundMode: continuable')
    // The other instance's toolName is untouched.
    expect(edited).toContain('toolName: subagent_fork')
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('refuses to edit a delegation instance id that does not exist', () => {
    expect(() => applyEdits(SAMPLE, { delegation: { 'tool-subagent-nope': { backgroundMode: 'one-shot' } } }, 'p'))
      .toThrow(/no tool-subagent row "tool-subagent-nope"/)
  })

  it('inserts a maxDepth on a spawn row that omits it, leaving provider alone', () => {
    const edited = applyEdits(SAMPLE, { delegation: { 'tool-subagent': { maxDepth: 5 } } }, 'p')

    expect(edited).toContain('maxDepth: 5')
    // The read-only provider (identity) is untouched.
    expect(edited).toContain('provider: spawn')
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('toggles a tool row\'s disabled on and off', () => {
    // SAMPLE's shell-gate has no disabled literal (it is a `!!js` expr), so use
    // a fresh composition with a plain toggleable tool row.
    const composition = [
      '- id: tool-fs',
      "  name: '@deepseek-ai/dsh-tool-fs'",
      '',
    ].join('\n')

    const off = applyEdits(composition, { tools: { 'tool-fs': { disabled: true } } }, 'p')
    expect(off).toContain('disabled: true')

    const backOn = applyEdits(off, { tools: { 'tool-fs': { disabled: false } } }, 'p')
    expect(backOn).toContain('disabled: false')
    expect(() => load(backOn, { schema: entryListSchema })).not.toThrow()
  })

  it('refuses to toggle a tool row whose disabled is a loader expression', () => {
    expect(() => applyEdits(SAMPLE, { tools: { 'shell-gate': { disabled: true } } }, 'p'))
      .toThrow(/loader expression, not a user toggle/)
  })

  it('refuses to toggle a tool row that does not exist', () => {
    expect(() => applyEdits(SAMPLE, { tools: { 'tool-nope': { disabled: true } } }, 'p'))
      .toThrow(/no tool row "tool-nope"/)
  })

  it('installs a tool package the preset does not carry, minting a loadable row', () => {
    const edited = applyEdits(SAMPLE, { installTools: ['@deepseek-ai/dsh-tool-fs'] }, 'p')

    expect(edited).toContain('- id: tool-fs')
    expect(edited).toContain("name: '@deepseek-ai/dsh-tool-fs'")
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
    // The row is now readable back as an installed tool.
    expect(readEditableFields(edited, [{ name: '@deepseek-ai/dsh-tool-fs' }]).catalog
      .find(entry => entry.name === '@deepseek-ai/dsh-tool-fs')?.installed).toBe(true)
  })

  it('refuses to install a tool the preset already carries', () => {
    expect(() => applyEdits(SAMPLE, { installTools: ['@deepseek-ai/dsh-tool-bash'] }, 'p'))
      .toThrow(/already installed/)
  })

  it('refuses to install a package whose derived id collides with an existing row', () => {
    // SAMPLE already has a top-level `shell-gate` row for tool-bash; minting
    // `tool-bash` from the package name collides with nothing here, but a
    // preset with an explicit row id clash is refused rather than overwritten.
    const composition = [
      '- id: tool-fs',
      "  name: '@deepseek-ai/dsh-tool-str-replace-editor'",
      '',
    ].join('\n')
    expect(() => applyEdits(composition, { installTools: ['@deepseek-ai/dsh-tool-fs'] }, 'p'))
      .toThrow(/a tool row id "tool-fs" already exists/)
  })

  it('removes a tool row and its config block, leaving the rest loadable', () => {
    const composition = [
      '- id: persona',
      '  config:',
      '    text: hello',
      '- id: tool-fs',
      "  name: '@deepseek-ai/dsh-tool-fs'",
      '  config:',
      '    maxFiles: 5',
      '',
    ].join('\n')

    const edited = applyEdits(composition, { removeTools: ['tool-fs'] }, 'p')

    expect(edited).not.toContain('- id: tool-fs')
    expect(edited).not.toContain('maxFiles')
    expect(edited).toContain('- id: persona')
    expect(() => load(edited, { schema: entryListSchema })).not.toThrow()
  })

  it('refuses to remove a tool row disabled by a loader expression', () => {
    // SAMPLE's shell-gate is `disabled: !!js process.platform === 'win32'`.
    expect(() => applyEdits(SAMPLE, { removeTools: ['shell-gate'] }, 'p'))
      .toThrow(/loader expression, not a user toggle/)
  })

  it('refuses to remove a tool row that does not exist', () => {
    expect(() => applyEdits(SAMPLE, { removeTools: ['tool-nope'] }, 'p'))
      .toThrow(/no tool row "tool-nope" to remove/)
  })
})
