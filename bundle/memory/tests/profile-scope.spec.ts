/**
 * T6 三维 profile scope tests.
 *
 * Verifies the vendor profile-scope mechanism (方案 B：直接改 vendor 源码，机制保真)
 * after the three-dimension re-interpretation:
 *   - a `projectId` materializes the independent `project:{p}` scope;
 *   - a team + role (`agentId` = roster role id) → `team:{t}|agent:{role}` scope;
 *   - a bare team (no role) → `team:{t}` scope;
 * and that `parseProfileIsolationScope` round-trips each form.
 *
 * @module dsh-harness-memory-bundle/tests/profile-scope
 */

import { describe, expect, it } from 'vitest'
import {
  buildProfileIsolationScope,
  parseProfileIsolationScope,
  DEFAULT_PROFILE_SCOPE,
} from '../vendor/src/core/profile/profile-sync.ts'

describe('buildProfileIsolationScope (T6 三维)', () => {
  it('defaults to global when no isolation is given', () => {
    expect(buildProfileIsolationScope(undefined)).toBe(DEFAULT_PROFILE_SCOPE)
    expect(buildProfileIsolationScope({})).toBe('team:default')
  })

  it('materializes the independent project scope from a projectId', () => {
    expect(buildProfileIsolationScope({ projectId: '/workspace/app' })).toBe('project:/workspace/app')
  })

  it('materializes the team+role scope (agent = roster role) from teamId + agentId', () => {
    expect(buildProfileIsolationScope({ teamId: 'team-a', agentId: 'lead' }))
      .toBe('team:team-a|agent:lead')
  })

  it('materializes the bare team scope when only a team is given', () => {
    expect(buildProfileIsolationScope({ teamId: 'team-a' })).toBe('team:team-a')
  })

  it('prefers project over team+role when both are present', () => {
    expect(buildProfileIsolationScope({ teamId: 'team-a', agentId: 'lead', projectId: '/p' }))
      .toBe('project:/p')
  })
})

describe('parseProfileIsolationScope (T6 parse 同步)', () => {
  it('round-trips the project scope', () => {
    const parsed = parseProfileIsolationScope('project:/workspace/app')
    expect(parsed).toEqual({ projectId: '/workspace/app' })
  })

  it('round-trips the team+role scope', () => {
    const parsed = parseProfileIsolationScope('team:team-a|agent:lead')
    expect(parsed).toEqual({ teamId: 'team-a', agentId: 'lead' })
  })

  it('round-trips the bare team scope', () => {
    const parsed = parseProfileIsolationScope('team:team-a')
    expect(parsed).toEqual({ teamId: 'team-a' })
  })

  it('decodes percent-encoded session ids', () => {
    const parsed = parseProfileIsolationScope('team:team-a|agent:lead|session:s%2Fx')
    expect(parsed).toEqual({ teamId: 'team-a', agentId: 'lead', sessionId: 's/x' })
  })

  it('returns undefined for a malformed scope', () => {
    expect(parseProfileIsolationScope('nonsense')).toBeUndefined()
  })
})
