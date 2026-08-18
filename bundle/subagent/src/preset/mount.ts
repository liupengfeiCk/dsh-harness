/**
 * Mount one subagent's plugin tree onto a child agent's scope context.
 *
 * The plugin-tree mounting mechanism is the same one agent presets use — the
 * cordis composition built from `agent.cordis.yml` — so this module reuses
 * `mountPreset` from `dsh-agent-presets` rather than duplicating the loader
 * wiring. The subagent registry stays fully separate from the agent-preset
 * roster: a subagent is resolved here by its OWN id, an `AgentPreset`-shaped
 * value pointing at the subagent's composition file is constructed, and
 * `mountPreset` mounts it onto the child. The subagent never enters the
 * agent-preset list.
 *
 * The tree is owned by the child's scope, so it unwinds with the child and
 * never touches how a session's agent joins its preset.
 * @module dsh-harness-subagent-bundle/preset/mount
 */

import type { Context } from '@deepseek-ai/cordis'
import { mountPreset } from '@deepseek-ai/dsh-agent-presets'
import type { SubagentPreset } from './types.ts'

/**
 * Mount one subagent's plugin tree onto a child agent's own scope.
 *
 * Called from the child's creation window. A broken subagent is refused up
 * front, so a delegation that names one rolls the child creation back rather
 * than publishing a half-composed agent.
 * @param childCtx - the child agent's scoped creation context.
 * @param subagent - the resolved subagent to mount onto the child.
 * @throws when the subagent's composition is unusable, or `childCtx` carries
 * no scope.
 */
export async function mountSubagentOnChild(childCtx: Context, subagent: SubagentPreset): Promise<void> {
  // Construct an agent-preset-shaped value pointing at the subagent's
  // composition file. `mountPreset` only reads `path` (plus `id` for
  // diagnostics) and never consults the agent-preset roster, so the subagent
  // mounts exactly as an agent preset would without entering its list.
  await mountPreset(childCtx, {
    id: subagent.id,
    trust: 'user',
    path: subagent.path,
  })
}
