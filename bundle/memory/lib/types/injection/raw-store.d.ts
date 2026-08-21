/**
 * Real `RawStore` implementation (T9): reads the session's raw original
 * history (L0) from the event-sourced session log.
 *
 * T8 left `RawStore` as an injectable seam; this module fills it with the
 * durable realization — project each surface-eligible session event into a
 * `CompactionMessage` via `session.deriveEventMessage`, preserving the event
 * `seq` as the immutable coordinate and pricing tokens with a deterministic
 * character-based estimate (dependency-light; the compaction subsystem's
 * budgets are ratios over the window, so a consistent estimator suffices).
 *
 * @module dsh-harness-memory-bundle/injection/raw-store
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { Message } from '@deepseek-ai/dsh-llm';
import type { CompactionMessage, RawStore } from '../compaction/types.ts';
/** Deterministic character-based token estimate: ~4 chars per token. */
export declare function estimateTokens(text: string): number;
/** Extract the concatenated text of a derived message's text blocks. */
export declare function textOfMessage(message: Message): string;
/** The compaction role for a derived message (tool results surface as user). */
export declare function compactionRole(message: Message): CompactionMessage['role'];
/**
 * Project one surface-eligible session event into a `CompactionMessage`, using
 * the session's own projection so the text and role match the model-visible
 * history exactly. Non-surface events yield `null`.
 */
export declare function projectEvent(session: Session, event: import('@deepseek-ai/dsh-session').SessionEvent): CompactionMessage | null;
/**
 * Build a live `RawStore` over one session's event log.
 * `read` returns the compactable messages in `range` (inclusive), surface order.
 */
export declare function sessionRawStore(session: Session): RawStore;
//# sourceMappingURL=raw-store.d.ts.map