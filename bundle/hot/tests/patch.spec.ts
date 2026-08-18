/**
 * Bundle-patch parsing for the hot mount surface. The parser must accept the
 * same `entryListSchema` dialect a boot loads, extract only the hot-mountable
 * rows (plain `insert` with static config, and boolean `disabled` overrides),
 * and refuse anything that can only activate on restart — `!!js` expressions,
 * nested groups, non-key-value config, and structural keys.
 */

import { describe, expect, it } from 'vitest'
import { parsePatch, RestartRequiredError, type HotRow } from '../src/patch.ts'

describe('parsePatch: plain insert rows', () => {
  it('parses a bare id/name insert row', () => {
    const rows = parsePatch('- insert:\n    - id: foo\n      name: \'@scope/pkg\'\n')
    expect(rows).toEqual([
      { kind: 'insert', id: 'foo', name: '@scope/pkg' },
    ])
  })

  it('parses an insert row with a static key-value config', () => {
    const rows = parsePatch([
      '- insert:',
      '    - id: foo',
      '      name: \'@scope/pkg\'',
      '      config:',
      '        providerName: spawn',
      '        toolName: delegate',
      '',
    ].join('\n'))
    expect(rows).toEqual([
      { kind: 'insert', id: 'foo', name: '@scope/pkg', config: { providerName: 'spawn', toolName: 'delegate' } },
    ])
  })

  it('parses multiple insert rows and preserves order', () => {
    const rows = parsePatch([
      '- insert:',
      '    - id: a',
      "      name: 'pkg/a'",
      '    - id: b',
      "      name: 'pkg/b'",
      '',
    ].join('\n'))
    expect(rows.map(row => row.kind === 'insert' ? row.id : '')).toEqual(['a', 'b'])
  })

  it('parses a nested numeric/bool config value', () => {
    const rows = parsePatch([
      '- insert:',
      '    - id: foo',
      "      name: 'pkg'",
      '      config:',
      '        maxDepth: 3',
      '        enabled: true',
      '',
    ].join('\n'))
    expect(rows[0]).toMatchObject({ kind: 'insert', id: 'foo', config: { maxDepth: 3, enabled: true } })
  })
})

describe('parsePatch: disabled override rows', () => {
  it('parses a boolean disabled override by id', () => {
    const rows = parsePatch('- id: official-row\n  disabled: true\n')
    expect(rows).toEqual([{ kind: 'disable', id: 'official-row' }])
  })

  it('parses a false disabled override', () => {
    const rows = parsePatch('- id: official-row\n  disabled: false\n')
    expect(rows).toEqual([{ kind: 'disable', id: 'official-row', }])
  })
})

describe('parsePatch: rejection (restart required)', () => {
  it('rejects a patch that is not a top-level array', () => {
    expect(() => parsePatch('foo: bar\n')).toThrow(RestartRequiredError)
  })

  it('rejects an empty patch', () => {
    expect(() => parsePatch('[]\n')).toThrow(RestartRequiredError)
  })

  it('rejects a !!js expression in an insert row config', () => {
    const patch = [
      '- insert:',
      '    - id: foo',
      "      name: 'pkg'",
      '      config:',
      '        threshold: !!js `ctx.loader.envData.startTime`',
      '',
    ].join('\n')
    expect(() => parsePatch(patch)).toThrow(RestartRequiredError)
  })

  it('rejects a !!js expression in an insert row disabled field', () => {
    const patch = [
      '- insert:',
      '    - id: foo',
      "      name: 'pkg'",
      '      disabled: !!js `ctx.loader.envData.startTime`',
      '',
    ].join('\n')
    expect(() => parsePatch(patch)).toThrow(RestartRequiredError)
  })

  it('rejects a !!js expression in a disabled override', () => {
    const patch = '- id: foo\n  disabled: !!js `ctx.loader.envData.startTime`\n'
    expect(() => parsePatch(patch)).toThrow(RestartRequiredError)
  })

  it('rejects a disabled override without a boolean', () => {
    expect(() => parsePatch('- id: foo\n  disabled: maybe\n')).toThrow(RestartRequiredError)
  })

  it('rejects an insert row with a non-object config', () => {
    const patch = [
      '- insert:',
      '    - id: foo',
      "      name: 'pkg'",
      '      config: just-a-string',
      '',
    ].join('\n')
    expect(() => parsePatch(patch)).toThrow(RestartRequiredError)
  })

  it('rejects an insert row with a structural key (group/inject)', () => {
    const patch = [
      '- insert:',
      '    - id: foo',
      "      name: 'pkg'",
      '      group: true',
      '',
    ].join('\n')
    expect(() => parsePatch(patch)).toThrow(/unsupported key "group"/)
  })

  it('rejects a disabled override with a name restating the target', () => {
    const patch = '- id: foo\n  name: \'@scope/pkg\'\n  disabled: true\n'
    expect(() => parsePatch(patch)).toThrow(/unsupported key "name"/)
  })

  it('rejects an insert row missing id or name', () => {
    expect(() => parsePatch('- insert:\n    - name: \'pkg\'\n')).toThrow(RestartRequiredError)
    expect(() => parsePatch('- insert:\n    - id: foo\n')).toThrow(RestartRequiredError)
  })
})

describe('parsePatch: row shape helper', () => {
  it('yields rows whose kind distinguishes insert from disable', () => {
    const rows = parsePatch([
      '- insert:',
      '    - id: a',
      "      name: 'pkg'",
      '- id: official',
      '  disabled: true',
      '',
    ].join('\n'))
    const kinds = rows.map(row => row.kind)
    expect(kinds).toEqual(['insert', 'disable'])
    const disable = rows[1] as Extract<HotRow, { kind: 'disable' }>
    expect(disable.id).toBe('official')
  })
})
