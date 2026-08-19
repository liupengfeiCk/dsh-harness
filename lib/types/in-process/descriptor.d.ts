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
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ToolRestriction } from '@deepseek-ai/dsh-tools';
import type { ContinuableSubagentDescriptorData, OneShotSubagentDescriptorData } from '@deepseek-ai/dsh-subagent';
/**
 * The current descriptor format version, stamped into every appended
 * `subagent/descriptor` event and required verbatim by
 * {@link foldHarnessSubagentDescriptor}. Matches the harness-modified official
 * `SUBAGENT_DESCRIPTOR_VERSION`, so a child authored by either path is
 * foldable by both while the harness modification is still applied.
 */
export declare const HARNESS_SUBAGENT_DESCRIPTOR_VERSION = 3;
/**
 * The harness continuable descriptor: the official fields plus the optional
 * user-defined `subagent` id whose plugin tree is re-mounted on cold resume,
 * and the optional `team`/`role` identity used to re-resolve that subagent from
 * the team's latest definition on cold resume.
 * Extends the official type so a value is assignable wherever the official
 * `ContinuableSubagentDescriptorData` is expected.
 */
export interface HarnessContinuableSubagentDescriptorData extends ContinuableSubagentDescriptorData {
    /** User-defined subagent id whose plugin tree is re-mounted onto the child on resume. */
    readonly subagent?: string;
    /** Team id whose roster the role was delegated from, for cold-resume re-resolution. */
    readonly team?: string;
    /** Role id within the team, for cold-resume re-resolution of the subagent/prompt. */
    readonly role?: string;
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
    readonly team?: string;
    /** Role id within the team (role identity for the gate). */
    readonly role?: string;
}
/** The harness supported durable subagent identity. */
export type HarnessSubagentDescriptorData = HarnessOneShotSubagentDescriptorData | HarnessContinuableSubagentDescriptorData;
/**
 * The harness continuable descriptor input: the official input plus the
 * optional user-defined `subagent` id and the optional `team`/`role` identity.
 */
export interface HarnessContinuableSubagentDescriptorInput {
    readonly mode: 'continuable';
    /** The `ctx.subagents` provider name that will establish the child. */
    readonly provider: string;
    /** Initial delegation `description` used for durable enumeration. */
    readonly label: string;
    /** Requested child `agentOptions.provider`. */
    readonly agentProvider?: string;
    /** Requested child `agentOptions.model`. */
    readonly agentModel?: string;
    /** Requested per-child persona. */
    readonly persona?: string;
    /** Requested child tool scoping. */
    readonly toolFilter?: ToolRestriction;
    /** Requested user-defined subagent to mount onto the child. */
    readonly subagent?: string;
    /** Team id whose roster the role was delegated from. */
    readonly team?: string;
    /** Role id within the team. */
    readonly role?: string;
}
/**
 * Validate and detach a harness continuable descriptor input, before any Task
 * or provider work begins.
 * @param input - the caller-collected continuable composition fields.
 * @returns the versioned, detached descriptor payload.
 * @throws when a field is not losslessly JSON-serializable.
 */
export declare function snapshotHarnessSubagentDescriptor(input: HarnessContinuableSubagentDescriptorInput): HarnessContinuableSubagentDescriptorData;
/** Input for {@link snapshotHarnessOneShotSubagentDescriptor}. */
export interface HarnessOneShotSubagentDescriptorInput {
    mode: 'one-shot';
    provider: string;
    /** Optional: the official one-shot descriptor's label (may be undefined). */
    label?: string;
    /** Team id whose roster the delegation came from (role identity for the gate). */
    team?: string;
    /** Role id within the team (role identity for the gate). */
    role?: string;
}
/**
 * Snapshot a one-shot harness descriptor, optionally carrying the `team`/`role`
 * identity so a one-shot team-role child is foldable by the delegation execution
 * gate. A plain one-shot child (no team context) is unchanged.
 */
export declare function snapshotHarnessOneShotSubagentDescriptor(input: HarnessOneShotSubagentDescriptorInput): HarnessOneShotSubagentDescriptorData;
/**
 * Fold a persisted child log to its supported harness descriptor. The first
 * `subagent/descriptor` event is authoritative.
 * @param events - the loaded child session events.
 * @returns the harness descriptor, or `undefined` when the log has none or its
 *   version is not {@link HARNESS_SUBAGENT_DESCRIPTOR_VERSION}.
 * @throws when a current-version persisted payload does not match its complete
 *   declared schema.
 */
export declare function foldHarnessSubagentDescriptor(events: readonly SessionEvent[]): HarnessSubagentDescriptorData | undefined;
//# sourceMappingURL=descriptor.d.ts.map