/**
 * The `agent/pre-step` injection handler that realizes the four-stage timing
 * model. Mounted on the agent-scoped context (scope-filtered dispatch), it runs
 * before each step and:
 *
 *   - stage 1 (first turn): installs the static snapshot + one L1 recall.
 *   - stage 2 (pre-compression): injects nothing (system stays constant).
 *   - stage 3 (compression point): runs the hierarchical compaction, then
 *     installs the latest snapshot.
 *   - stage 4 (post-compression): injects L1 every turn.
 *
 * The handler returns a `PreStepDecision` whose `messages` are the step's
 * claimed messages prefixed by any memory-injected messages. The loop appends
 * them to the session log (the logged channel), so injection never touches the
 * request config — keeping the system segment byte-stable and disjoint from the
 * model-plan merge (which owns `agent/request` config).
 *
 * @module dsh-harness-memory-bundle/injection/pre-step
 */
import type { Context } from '@deepseek-ai/cordis';
import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { Session, UserMessage } from '@deepseek-ai/dsh-session';
import type { CompressionCoordinator } from './compaction.ts';
import { StageLedger } from './stage.ts';
/** Everything the pre-step handler needs from the host. */
export interface PreStepDeps {
    /** Memory recall: returns the L1/L3/L2 content for a user text. */
    recall(userText: string, sessionKey: string): Promise<{
        readonly prependContext?: string;
        readonly appendSystemContext?: string;
    }>;
    /** The compression coordinator (stage 3). */
    compression: CompressionCoordinator;
    /** Per-session stage ledger. */
    ledger: StageLedger;
    /** Skip compression entirely (e.g. feature off); still injects per stage. */
    readonly autoCompress: boolean;
    /** Logger seam for compression/recall observability. */
    log?(level: 'info' | 'warn', message: string): void;
}
/**
 * Build an `agent/pre-step` handler bound to the deps. Returns the handler
 * function to register via `ctx.on('agent/pre-step', handler)`.
 */
export declare function createPreStepHandler(deps: PreStepDeps): (payload: {
    agent: {
        session: Session;
        ctx: Context;
    };
    signal: AbortSignal;
    messages: UserMessage[];
}, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>;
//# sourceMappingURL=pre-step.d.ts.map