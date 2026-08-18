/**
 * Filesystem discovery of user-defined helper subagents. A subagent is a
 * directory holding {@link COMPOSITION_FILE}, optionally beside a
 * {@link METADATA_FILE} carrying its display text and product fields; the
 * directory name is the subagent id. Discovery re-reads the roots on every
 * call so a subagent authored while the process is running is visible without
 * a restart.
 *
 * Discovery also owns subagent HEALTH: a directory whose composition is
 * missing or unloadable is reported as a broken roster row rather than
 * skipped. A skipped directory would still occupy its id on disk — the copy
 * path refuses the name while no surface shows anything to delete — and a
 * malformed composition would otherwise read as an ordinary subagent until
 * the first delegation fails to mount it.
 * @module dsh-harness-subagent-bundle/preset/discovery
 */
import { type SubagentPreset, type SubagentRoot } from './types.ts';
/** The composition file that makes a directory a subagent. */
export declare const COMPOSITION_FILE = "agent.cordis.yml";
/**
 * Harness-home directory holding locally authored subagents.
 *
 * This package owns the writable root the way `dsh-agent-presets` owns
 * `.agent-presets`. An app must assemble the SHIPPED root, whose path only the
 * installed app can resolve; where a person's own subagents go is the same
 * place in every deployment that does not say otherwise.
 */
export declare const USER_SUBAGENT_DIR = "subagents";
/**
 * Scan one root for subagent directories.
 *
 * An absent root yields no subagents rather than throwing: the user root does
 * not exist until the first locally authored subagent, and naming a default
 * that no root supplies already fails loud at resolution.
 *
 * Every directory whose name is a usable subagent id is a roster row — broken
 * when its composition is missing or unloadable. A directory named outside
 * {@link SUBAGENT_ID} is skipped instead: no copy could ever claim that name.
 * @param root - the directory and the trust its subagents inherit.
 * @returns the root's subagents ordered by id.
 */
export declare function scanRoot(root: SubagentRoot): Promise<SubagentPreset[]>;
/**
 * Scan every root in precedence order.
 * @param roots - roots in precedence order; an earlier root wins a duplicate id.
 * @returns every discovered subagent, first-root-wins per id.
 */
export declare function discoverSubagents(roots: readonly SubagentRoot[]): Promise<SubagentPreset[]>;
//# sourceMappingURL=discovery.d.ts.map