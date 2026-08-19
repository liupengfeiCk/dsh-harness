/**
 * UPSTREAM-SYNC NOTE: copied from @deepseek-ai/dsh-subagent/src/projection.ts.
 * Official tarballs ship lib/ only, so deep src imports 404 on registry
 * installs; this copy makes the package self-contained. Keep in sync with the
 * upstream file when the vendored checkout advances.
 *
 * DELIBERATE DEVIATION: `descriptorIdentity` folds a descriptor through BOTH
 * the harness descriptor fold (`foldHarnessSubagentDescriptor`) and the
 * official fold (`foldSubagentDescriptor`). The harness writes version-3
 * descriptors that carry the extra `subagent`/`team`/`role` fields; the
 * official fold only accepts version-2. Folding only the official version
 * would classify every harness-authored (version-3) child as `corrupt` even
 * when its transcript is healthy — the identity classification must agree
 * with the descriptor the running runtime actually wrote.
 */
/**
 * Pure session projections for subagent identity (mode/label) and active-turn
 * duration.
 *
 * @module @deepseek-ai/dsh-subagent/projection
 */
import { z } from 'zod';
import { foldHarnessSubagentDescriptor } from "../descriptor.js";
import { foldSubagentDescriptor } from "./descriptor.js";
// Zod's optional output includes explicit `undefined`; with
// exactOptionalPropertyTypes the public interface permits omission only.
const projectionSchema = z.object({
    settledMs: z.number().int().nonnegative(),
    active: z.object({
        since: z.number().int().nonnegative(),
        through: z.number().int().nonnegative(),
    }).strict().optional(),
}).strict();
/**
 * Fold turn boundaries around the child's own durable descriptor.
 *
 * A fork seed may contain an ancestor descriptor and completed turns. Every
 * descriptor therefore resets the accumulated state; the healthy catalog
 * admits only a child with exactly one descriptor in its own suffix, making
 * the final reset the child's authoritative timing origin.
 */
export const subagentTimingProjectionDefinition = {
    key: 'subagentTiming',
    schema: projectionSchema,
    init: () => ({ descriptorSeen: false, settledMs: 0 }),
    apply: (state, event) => {
        if (event.type === 'turn/start') {
            return state.descriptorSeen
                ? { ...state, active: { since: event.time, through: event.time } }
                : { ...state, pendingTurnStart: event.time };
        }
        if (event.type === 'subagent/descriptor') {
            const activeSince = state.active?.since ?? state.pendingTurnStart;
            return {
                descriptorSeen: true,
                settledMs: 0,
                ...(activeSince === undefined
                    ? {}
                    : { active: { since: activeSince, through: event.time } }),
            };
        }
        if (event.type === 'turn/end') {
            if (!state.descriptorSeen) {
                if (state.pendingTurnStart === undefined)
                    return state;
                const { pendingTurnStart: _closed, ...next } = state;
                return next;
            }
            if (state.active === undefined)
                return state;
            const { active, ...rest } = state;
            return {
                ...rest,
                settledMs: state.settledMs + Math.max(0, event.time - active.since),
            };
        }
        if (state.active === undefined)
            return state;
        return { ...state, active: { ...state.active, through: event.time } };
    },
    view: state => ({
        settledMs: state.settledMs,
        ...(state.active === undefined ? {} : { active: state.active }),
    }),
    stateVersion: 2,
};
// The cast bridges only the optional-label arm: Zod's optional output
// includes explicit `undefined`, which exactOptionalPropertyTypes excludes
// from the public interface. The no-value state itself is the serializable
// `null` arm — never `undefined` — so every registry read and push frame
// survives JSON.stringify losslessly.
const identitySchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('one-shot'),
        label: z.string().optional(),
        seq: z.number().int().nonnegative(),
    }).strict(),
    z.object({
        mode: z.literal('continuable'),
        label: z.string(),
        seq: z.number().int().nonnegative(),
    }).strict(),
]).nullable();
/** Interpret one `subagent/descriptor` event's identity; no value when the payload cannot be trusted. */
function descriptorIdentity(event) {
    // The harness writes version-3 descriptors carrying the extra `subagent`/
    // `team`/`role` fields; the official fold only accepts version-2. Fold a
    // harness-authored descriptor through the harness fold and fall back to the
    // official fold for a version-2 child, so either authoring path yields an
    // identity — otherwise every harness-authored (version-3) child would fold
    // to no value and the catalog would misreport a healthy transcript as
    // corrupt. Each fold is version-exclusive (it returns `undefined` for the
    // other's version), so the order is unambiguous; a version-3 one-shot is
    // handled by the harness fold's one-shot arm.
    let descriptor;
    try {
        descriptor = foldHarnessSubagentDescriptor([event]);
        if (descriptor === undefined)
            descriptor = foldSubagentDescriptor([event]);
    }
    catch {
        // Only a malformed current-version payload throws in descriptor parsing;
        // a projection fold must never throw, so damage folds to no value.
        descriptor = undefined;
    }
    if (descriptor === undefined)
        return undefined;
    return descriptor.mode === 'one-shot'
        ? {
            mode: 'one-shot',
            ...descriptor.label !== undefined ? { label: descriptor.label } : {},
            seq: event.seq,
        }
        : { mode: 'continuable', label: descriptor.label, seq: event.seq };
}
/**
 * Fold the durable mode/label identity from `subagent/descriptor` events,
 * last-wins: a fork seed may replay an ancestor's descriptor, and the child's
 * own descriptor must override it — the same reset discipline as
 * {@link subagentTimingProjectionDefinition}. A malformed or unknown-version
 * payload resets to the `null` sentinel instead of throwing, so a fork of a
 * healthy ancestor never inherits an identity its own descriptor failed to
 * establish — and the reset survives every JSON push frame, so a consumer
 * holding the earlier identity replaces it instead of keeping it stale;
 * `null` ⟺ no valid descriptor, with the causes deliberately undistinguished.
 */
export const subagentIdentityProjectionDefinition = {
    key: 'subagent',
    schema: identitySchema,
    init: () => ({}),
    apply: (state, event) => {
        if (event.type !== 'subagent/descriptor')
            return state;
        const identity = descriptorIdentity(event);
        return identity === undefined ? {} : { identity };
    },
    view: state => state.identity ?? null,
    // Bumped when the identity gained its `seq` field: an older checkpoint row
    // would replay into a value the schema rejects, so it must refold instead.
    stateVersion: 2,
};
//# sourceMappingURL=projection.js.map