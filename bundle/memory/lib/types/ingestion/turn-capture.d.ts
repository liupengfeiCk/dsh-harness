/**
 * dsh-harness-memory-bundle/ingestion/turn-capture — the T5 trigger wiring:
 * subscribe the DSH session event stream and, on each committed turn (`turn/end`),
 * project the session's user/assistant surface into a vendor `CompletedTurn` and
 * commit it to the engine (L0 record + pipeline scheduling).
 *
 * Wiring (design §7 F2/F3 + the T5 decision):
 *   - subscribe `ctx.on('session/event', (session, event) => …, { global: true })`
 *     so both top-level (main) and delegated subagent sessions are captured;
 *   - on `event.type === 'turn/end'`, derive the identity coordinates via
 *     {@link deriveTurnAttribution} (team/role/project/task/session/user), fold
 *     the session's user/assistant messages into `ConversationMessage[]`, and
 *     build a `CompletedTurn` with `sessionKey = encodeSessionKey(attribution)`;
 *   - commit through the `Memory.onTurnCommitted` seam (L0 + scheduler notify).
 *
 * Incrementality is the vendor's job: `recordConversation` keeps a per-session
 * timestamp checkpoint cursor, so handing the whole live surface each turn only
 * records messages newer than the cursor. This deliberately avoids per-turn
 * cursor bookkeeping on our side and lets the vendor's checkpointing drive.
 *
 * @module dsh-harness-memory-bundle/ingestion/turn-capture
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import type { Message } from '@deepseek-ai/dsh-llm';
/** The vendor `ConversationMessage` shape the L0 recorder consumes. */
export interface TurnMessage {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly timestamp: number;
}
/** The vendor `CompletedTurn` surface the capture commits. */
export interface CompletedTurnLike {
    readonly userText: string;
    readonly assistantText: string;
    readonly messages: TurnMessage[];
    readonly sessionKey: string;
    readonly sessionId: string;
    readonly startedAt?: number;
    /** Isolation coordinates propagated into every L0 record (T5/T6). */
    readonly teamId?: string;
    readonly agentId?: string;
    readonly taskId?: string;
}
/** The commit seam the capture drives (satisfied by `Memory.onTurnCommitted`). */
export type TurnCommitter = (turn: CompletedTurnLike) => Promise<unknown>;
/** The `Memory` service surface needed (structural, not imported). */
export interface MemoryLike {
    onTurnCommitted(turn: CompletedTurnLike): Promise<unknown>;
}
/** Concatenate the text of a derived message's text blocks (mirrors raw-store). */
export declare function textOf(message: Message): string;
/**
 * Project one surface-eligible session event into a `TurnMessage`, using the
 * session's own projection so text/role match the model-visible history exactly.
 * Non user/assistant events yield `null`.
 * @param session - the live session (for `deriveEventMessage`).
 * @param event - the session event to project.
 * @returns the message, or `null` when the event produces no user/assistant text.
 */
export declare function projectTurnMessage(session: Session, event: SessionEvent): TurnMessage | null;
/**
 * Fold a session's user/assistant surface into `TurnMessage[]` (log order).
 * @param session - the live session.
 * @returns the projected messages.
 */
export declare function projectTurnMessages(session: Session): TurnMessage[];
/**
 * Build a vendor `CompletedTurn` from a live session by deriving its identity
 * coordinates and projecting its user/assistant surface.
 * @param ctx - the harness context (for attribution's tasks registry).
 * @param session - the live session whose turn just committed.
 * @returns the turn to commit.
 */
export declare function buildCompletedTurn(ctx: Context, session: Session): CompletedTurnLike;
/**
 * Install the T5 turn-capture wiring: subscribe the session event stream and
 * commit each committed turn to the memory engine. Scope-filtered dispatch
 * delivers every live agent's events to this root listener (`global: true`),
 * so both main and subagent sessions are captured.
 * @param ctx - the harness context.
 * @param memory - the memory engine service (its `onTurnCommitted`).
 * @returns a disposer that unsubscribes.
 */
export declare function installTurnCapture(ctx: Context, memory: MemoryLike): () => void;
//# sourceMappingURL=turn-capture.d.ts.map