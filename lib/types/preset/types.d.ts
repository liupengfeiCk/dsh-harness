/** Sub-agent vocabulary shared by discovery, registry, and consumers. */
import type { SubagentMetadata } from './metadata.ts';
/**
 * Where a subagent's composition came from. A `system` subagent ships with
 * the deployment; a `user` subagent was authored locally, by a person or by an
 * agent, and therefore carries the same trust as shell access.
 */
export type SubagentTrust = 'system' | 'user';
/**
 * Ids a subagent directory may use.
 *
 * The id becomes a path segment, so this is a containment boundary rather than
 * a style rule: `..`, a separator, or an absolute-looking name would place the
 * composition outside the root the deployment authorised.
 */
export declare const SUBAGENT_ID: RegExp;
/** One subagent directory that carries a mountable agent composition. */
export interface SubagentPreset {
    /** Stable identifier; the subagent directory's name. */
    readonly id: string;
    /** Trust recorded from the root this subagent was discovered under. */
    readonly trust: SubagentTrust;
    /** Absolute path of the subagent's agent composition file. */
    readonly path: string;
    /**
     * The subagent's display and product metadata, carried as one object so the
     * roster and every service/assembly layer pass it through whole rather than
     * per-field. Adding a metadata field touches only this object and its
     * parsing, never the service/assembly seams.
     */
    readonly metadata: SubagentMetadata;
    /**
     * Why this subagent cannot compose a child, absent when it can. A broken
     * subagent stays on the roster — hiding it would leave its directory
     * blocking the id with nothing to see or delete — but every mounting path
     * refuses it up front with this reason instead of failing deep inside the
     * loader.
     */
    readonly broken?: string;
}
/** One directory scanned for subagent subdirectories. */
export interface SubagentRoot {
    /** Directory holding one subdirectory per subagent; a leading `~` expands. */
    path: string;
    /** Trust recorded on every subagent discovered under this root. */
    trust: SubagentTrust;
}
/** Plugin config: which roots supply subagents, and where authored ones go. */
export interface Config {
    /**
     * Scanned roots in precedence order; an earlier root wins a duplicate id.
     * When omitted, defaults to the package-shipped factory root
     * (`FACTORY_SUBAGENT_ROOT`, `system` trust) — the factory subagents ship
     * with this package and need no launcher-side injection.
     */
    roots: SubagentRoot[];
    /**
     * Append the harness home's `USER_SUBAGENT_DIR` as a `user` root, after
     * every configured root. False mounts a roster over `roots` alone.
     */
    includeUserRoot: boolean;
}
/**
 * No configured root supplies the requested subagent.
 *
 * Separate from a mount failure because the two mean different things to a
 * caller: an unknown id is a bad request, while an unusable composition is a
 * broken subagent the deployment must fix.
 */
export declare class UnknownSubagentError extends Error {
    /** The id that was requested. */
    readonly subagentId: string;
    /** Ids the roster does supply, for the caller to offer instead. */
    readonly available: readonly string[];
    constructor(
    /** The id that was requested. */
    subagentId: string, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available: readonly string[]);
}
/** A subagent exists but its composition cannot be installed. */
export declare class SubagentMountError extends Error {
    /** The subagent whose composition failed. */
    readonly subagentId: string;
    /** Why it failed, without this package's own message prefix. */
    readonly reason: string;
    constructor(
    /** The subagent whose composition failed. */
    subagentId: string, 
    /** Why it failed, without this package's own message prefix. */
    reason: string, options?: ErrorOptions);
}
//# sourceMappingURL=types.d.ts.map