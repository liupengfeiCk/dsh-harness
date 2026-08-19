/**
 * Harness-owned durable subagent descriptor, carrying the extra `subagent`
 * composition field that the official descriptor loses when the official
 * package is restored upstream (task 3).
 *
 * UPSTREAM-SYNC NOTE: copied from
 * `@deepseek-ai/dsh-subagent/src/descriptor.ts` so the persisted payload
 * stays byte-identical with the official seam while the harness is shipping
 * the inheritance switch. The ONE deliberate deviation is that this module
 * also persists the user-defined `subagent` id (the official upstream
 * descriptor does not carry it), so a cold-resumed continuable child can
 * re-mount that subagent's plugin tree with the inheritance switch intact.
 * When the official descriptor changes upstream, re-sync this file.
 *
 * Because the official descriptor's `assertKnownKeys` rejects fields it does
 * not declare, our continuation manager folds through THIS module, never the
 * official `foldSubagentDescriptor` — otherwise a persisted `subagent` field
 * would be rejected as unknown.
 *
 * @module dsh-harness-subagent-bundle/in-process/descriptor
 */

import { snapshotJsonValue } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolRestriction } from '@deepseek-ai/dsh-tools'
import type {
  ContinuableSubagentDescriptorData,
  OneShotSubagentDescriptorData,
} from '@deepseek-ai/dsh-subagent'

/**
 * The current descriptor format version, stamped into every appended
 * `subagent/descriptor` event and required verbatim by
 * {@link foldHarnessSubagentDescriptor}. Matches the harness-modified official
 * `SUBAGENT_DESCRIPTOR_VERSION`, so a child authored by either path is
 * foldable by both while the harness modification is still applied.
 */
export const HARNESS_SUBAGENT_DESCRIPTOR_VERSION = 3

/**
 * The harness continuable descriptor: the official fields plus the optional
 * user-defined `subagent` id whose plugin tree is re-mounted on cold resume,
 * and the optional `team`/`role` identity used to re-resolve that subagent from
 * the team's latest definition on cold resume.
 * Extends the official type so a value is assignable wherever the official
 * `ContinuableSubagentDescriptorData` is expected.
 */
export interface HarnessContinuableSubagentDescriptorData
  extends ContinuableSubagentDescriptorData {
  /** User-defined subagent id whose plugin tree is re-mounted onto the child on resume. */
  readonly subagent?: string
  /** Team id whose roster the role was delegated from, for cold-resume re-resolution. */
  readonly team?: string
  /** Role id within the team, for cold-resume re-resolution of the subagent/prompt. */
  readonly role?: string
}

/**
 * The harness one-shot descriptor: the official fields plus the optional
 * `team`/`role` identity used by the team hierarchy to fold a child caller's
 * level on the delegation execution gate. A one-shot team-role child that never
 * gets to delegate carries no identity anyway; a one-shot role at level >= 2
 * (rule 7 warns but does not refuse) needs it so the gate can authorise its one
 * hop.
 */
export interface HarnessOneShotSubagentDescriptorData extends OneShotSubagentDescriptorData {
  /** Team id whose roster the delegation came from (role identity for the gate). */
  readonly team?: string
  /** Role id within the team (role identity for the gate). */
  readonly role?: string
}

/** The harness supported durable subagent identity. */
export type HarnessSubagentDescriptorData =
  | HarnessOneShotSubagentDescriptorData
  | HarnessContinuableSubagentDescriptorData

/**
 * The harness continuable descriptor input: the official input plus the
 * optional user-defined `subagent` id and the optional `team`/`role` identity.
 */
export interface HarnessContinuableSubagentDescriptorInput {
  readonly mode: 'continuable'
  /** The `ctx.subagents` provider name that will establish the child. */
  readonly provider: string
  /** Initial delegation `description` used for durable enumeration. */
  readonly label: string
  /** Requested child `agentOptions.provider`. */
  readonly agentProvider?: string
  /** Requested child `agentOptions.model`. */
  readonly agentModel?: string
  /** Requested per-child persona. */
  readonly persona?: string
  /** Requested child tool scoping. */
  readonly toolFilter?: ToolRestriction
  /** Requested user-defined subagent to mount onto the child. */
  readonly subagent?: string
  /** Team id whose roster the role was delegated from. */
  readonly team?: string
  /** Role id within the team. */
  readonly role?: string
}

const CONTINUABLE_HARNESS_DESCRIPTOR_KEYS = new Set([
  'version',
  'mode',
  'provider',
  'label',
  'agentProvider',
  'agentModel',
  'persona',
  'toolFilter',
  'subagent',
  'team',
  'role',
])
const TOOL_FILTER_KEYS = new Set(['allow', 'deny'])

/** Whether a persisted JSON value is an object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reject fields outside one versioned record's declared schema. */
function assertKnownKeys(value: Record<string, unknown>, keys: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(value).find(key => !keys.has(key))
  if (unknown !== undefined) {
    throw new Error(`persisted subagent descriptor ${path} has unknown field "${unknown}"`)
  }
}

/** Read one optional string field from a persisted descriptor record. */
function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  if (!Object.hasOwn(value, key)) return undefined
  const field = value[key]
  if (typeof field !== 'string') {
    throw new Error(`persisted subagent descriptor ${key} must be a string`)
  }
  return field
}

/** Read one optional string-array field from a persisted tool restriction. */
function optionalStringArray(value: Record<string, unknown>, key: string): string[] | undefined {
  if (!Object.hasOwn(value, key)) return undefined
  const field = value[key]
  if (!Array.isArray(field)) {
    throw new Error(`persisted subagent descriptor toolFilter.${key} must be an array of strings`)
  }
  const items: unknown[] = field
  if (items.some(item => typeof item !== 'string')) {
    throw new Error(`persisted subagent descriptor toolFilter.${key} must be an array of strings`)
  }
  return items as string[]
}

/** Validate and reconstruct a persisted tool restriction. */
function parseToolFilter(value: unknown): ToolRestriction {
  if (!isRecord(value)) {
    throw new Error('persisted subagent descriptor toolFilter must be an object')
  }
  assertKnownKeys(value, TOOL_FILTER_KEYS, 'toolFilter')
  const allow = optionalStringArray(value, 'allow')
  const deny = optionalStringArray(value, 'deny')
  if (allow === undefined && deny === undefined) {
    throw new Error('persisted subagent descriptor toolFilter must declare allow and/or deny')
  }
  return {
    ...allow !== undefined ? { allow } : {},
    ...deny !== undefined ? { deny } : {},
  }
}

/** Validate one persisted descriptor payload for the harness runtime. */
function parseHarnessSubagentDescriptor(value: unknown): HarnessSubagentDescriptorData | undefined {
  if (!isRecord(value)) {
    throw new Error('persisted subagent descriptor payload must be an object')
  }
  const version = value['version']
  if (typeof version !== 'number') {
    throw new Error('persisted subagent descriptor version must be a number')
  }
  if (version !== HARNESS_SUBAGENT_DESCRIPTOR_VERSION) return undefined

  const mode = value['mode']
  if (mode !== 'one-shot' && mode !== 'continuable') {
    throw new Error('persisted subagent descriptor mode must be "one-shot" or "continuable"')
  }
  assertKnownKeys(value, CONTINUABLE_HARNESS_DESCRIPTOR_KEYS, 'payload')
  const provider = value['provider']
  if (typeof provider !== 'string') {
    throw new Error('persisted subagent descriptor provider must be a string')
  }
  if (mode === 'one-shot') {
    const label = optionalString(value, 'label')
    const team = optionalString(value, 'team')
    const role = optionalString(value, 'role')
    const result: HarnessOneShotSubagentDescriptorData = {
      version: HARNESS_SUBAGENT_DESCRIPTOR_VERSION,
      mode,
      provider,
      ...label !== undefined ? { label } : {},
      ...team !== undefined ? { team } : {},
      ...role !== undefined ? { role } : {},
    }
    return result
  }
  const label = value['label']
  if (typeof label !== 'string') {
    throw new Error('persisted subagent descriptor label must be a string')
  }
  const agentProvider = optionalString(value, 'agentProvider')
  const agentModel = optionalString(value, 'agentModel')
  const persona = optionalString(value, 'persona')
  const toolFilter = Object.hasOwn(value, 'toolFilter')
    ? parseToolFilter(value['toolFilter'])
    : undefined
  const subagent = optionalString(value, 'subagent')
  const team = optionalString(value, 'team')
  const role = optionalString(value, 'role')
  const result: HarnessContinuableSubagentDescriptorData = {
    version: HARNESS_SUBAGENT_DESCRIPTOR_VERSION,
    mode,
    provider,
    label,
    ...agentProvider !== undefined ? { agentProvider } : {},
    ...agentModel !== undefined ? { agentModel } : {},
    ...persona !== undefined ? { persona } : {},
    ...toolFilter !== undefined ? { toolFilter } : {},
    ...subagent !== undefined ? { subagent } : {},
    ...team !== undefined ? { team } : {},
    ...role !== undefined ? { role } : {},
  }
  return result
}

/**
 * Validate and detach a harness continuable descriptor input, before any Task
 * or provider work begins.
 * @param input - the caller-collected continuable composition fields.
 * @returns the versioned, detached descriptor payload.
 * @throws when a field is not losslessly JSON-serializable.
 */
export function snapshotHarnessSubagentDescriptor(
  input: HarnessContinuableSubagentDescriptorInput,
): HarnessContinuableSubagentDescriptorData {
  const candidate: HarnessContinuableSubagentDescriptorData = {
    version: HARNESS_SUBAGENT_DESCRIPTOR_VERSION,
    mode: input.mode,
    provider: input.provider,
    label: input.label,
    ...input.agentProvider !== undefined ? { agentProvider: input.agentProvider } : {},
    ...input.agentModel !== undefined ? { agentModel: input.agentModel } : {},
    ...input.persona !== undefined ? { persona: input.persona } : {},
    ...input.toolFilter !== undefined ? { toolFilter: input.toolFilter } : {},
    ...input.subagent !== undefined ? { subagent: input.subagent } : {},
    ...input.team !== undefined ? { team: input.team } : {},
    ...input.role !== undefined ? { role: input.role } : {},
  }
  const snapshot = snapshotJsonValue(candidate)
  if (snapshot === undefined) {
    throw new Error('subagent descriptor is not losslessly JSON-serializable')
  }
  return snapshot
}

/** Input for {@link snapshotHarnessOneShotSubagentDescriptor}. */
export interface HarnessOneShotSubagentDescriptorInput {
  mode: 'one-shot'
  provider: string
  label: string
  /** Team id whose roster the delegation came from (role identity for the gate). */
  team?: string
  /** Role id within the team (role identity for the gate). */
  role?: string
}

/**
 * Snapshot a one-shot harness descriptor, optionally carrying the `team`/`role`
 * identity so a one-shot team-role child is foldable by the delegation execution
 * gate. A plain one-shot child (no team context) is unchanged.
 */
export function snapshotHarnessOneShotSubagentDescriptor(
  input: HarnessOneShotSubagentDescriptorInput,
): HarnessOneShotSubagentDescriptorData {
  const candidate: HarnessOneShotSubagentDescriptorData = {
    version: HARNESS_SUBAGENT_DESCRIPTOR_VERSION,
    mode: input.mode,
    provider: input.provider,
    label: input.label,
    ...input.team !== undefined ? { team: input.team } : {},
    ...input.role !== undefined ? { role: input.role } : {},
  }
  const snapshot = snapshotJsonValue(candidate)
  if (snapshot === undefined) {
    throw new Error('subagent descriptor is not losslessly JSON-serializable')
  }
  return snapshot
}

/**
 * Fold a persisted child log to its supported harness descriptor. The first
 * `subagent/descriptor` event is authoritative.
 * @param events - the loaded child session events.
 * @returns the harness descriptor, or `undefined` when the log has none or its
 *   version is not {@link HARNESS_SUBAGENT_DESCRIPTOR_VERSION}.
 * @throws when a current-version persisted payload does not match its complete
 *   declared schema.
 */
export function foldHarnessSubagentDescriptor(
  events: readonly SessionEvent[],
): HarnessSubagentDescriptorData | undefined {
  const event = events.find(
    (candidate): candidate is SessionEvent<'subagent/descriptor'> => candidate.type === 'subagent/descriptor',
  )
  if (event === undefined) return undefined
  return parseHarnessSubagentDescriptor(event.data)
}
