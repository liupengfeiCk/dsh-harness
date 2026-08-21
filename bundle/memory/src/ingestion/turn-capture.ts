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

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Message } from '@deepseek-ai/dsh-llm'
import { deriveTurnAttribution, encodeSessionKey, type TurnAttribution } from './attribution.ts'

/** The vendor `ConversationMessage` shape the L0 recorder consumes. */
export interface TurnMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly timestamp: number
}

/** The vendor `CompletedTurn` surface the capture commits. */
export interface CompletedTurnLike {
  readonly userText: string
  readonly assistantText: string
  readonly messages: TurnMessage[]
  readonly sessionKey: string
  readonly sessionId: string
  readonly startedAt?: number
  /** Isolation coordinates propagated into every L0 record (T5/T6). */
  readonly teamId?: string
  readonly agentId?: string
  readonly taskId?: string
}

/** The commit seam the capture drives (satisfied by `Memory.onTurnCommitted`). */
export type TurnCommitter = (turn: CompletedTurnLike) => Promise<unknown>

/** The `Memory` service surface needed (structural, not imported). */
export interface MemoryLike {
  onTurnCommitted(turn: CompletedTurnLike): Promise<unknown>
}

/** Concatenate the text of a derived message's text blocks (mirrors raw-store). */
export function textOf(message: Message): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

/**
 * Project one surface-eligible session event into a `TurnMessage`, using the
 * session's own projection so text/role match the model-visible history exactly.
 * Non user/assistant events yield `null`.
 * @param session - the live session (for `deriveEventMessage`).
 * @param event - the session event to project.
 * @returns the message, or `null` when the event produces no user/assistant text.
 */
export function projectTurnMessage(
  session: Session,
  event: SessionEvent,
): TurnMessage | null {
  if (event.type !== 'user/message' && event.type !== 'assistant/message') return null
  const message = session.deriveEventMessage(event)
  if (message === null) return null
  const text = textOf(message).trim()
  if (text.length === 0) return null
  const role = message.role === 'assistant' ? 'assistant' as const : 'user' as const
  return {
    id: `msg_${event.seq}`,
    role,
    content: text,
    timestamp: (event as { time?: number }).time ?? Date.now(),
  }
}

/**
 * Fold a session's user/assistant surface into `TurnMessage[]` (log order).
 * @param session - the live session.
 * @returns the projected messages.
 */
export function projectTurnMessages(session: Session): TurnMessage[] {
  const result: TurnMessage[] = []
  for (const event of session.events) {
    const message = projectTurnMessage(session, event)
    if (message !== null) result.push(message)
  }
  return result
}

/** The current turn's user text and assistant text from a message list. */
function turnTexts(messages: TurnMessage[]): { userText: string; assistantText: string } {
  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n')
  const assistantText = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .join('\n')
  return { userText, assistantText }
}

/**
 * Build a vendor `CompletedTurn` from a live session by deriving its identity
 * coordinates and projecting its user/assistant surface.
 * @param ctx - the harness context (for attribution's tasks registry).
 * @param session - the live session whose turn just committed.
 * @returns the turn to commit.
 */
export function buildCompletedTurn(ctx: Context, session: Session): CompletedTurnLike {
  const attribution: TurnAttribution = deriveTurnAttribution(ctx, session)
  const messages = projectTurnMessages(session)
  const { userText, assistantText } = turnTexts(messages)
  // The capture cursor (`afterTimestamp`) is a strict floor: only messages with
  // `timestamp > afterTimestamp` are recorded on cold start. Use a time before
  // the first message so the whole turn's messages — including the first — pass
  // the floor. Prefer the current turn's `turn/start` boundary time when the
  // event stream exposes it; otherwise back off by one millisecond from the
  // first message.
  let startedAt: number | undefined
  if (messages.length > 0) {
    const turnStart = session.events
      .filter((e): e is SessionEvent & { time?: number } => e.type === 'turn/start')
      .map((e) => e.time)
      .find((t): t is number => typeof t === 'number' && t > 0)
    const first = messages[0]
    startedAt = turnStart !== undefined ? turnStart : first !== undefined ? first.timestamp - 1 : Date.now()
  }
  return {
    userText,
    assistantText,
    messages,
    sessionKey: encodeSessionKey(attribution),
    sessionId: attribution.session,
    ...(startedAt !== undefined ? { startedAt } : {}),
    // Propagate the isolation coordinates (agentId = roster role) so every L0
    // record this turn carries the team/role/project tags (T6 L0/L1 归属标签).
    teamId: attribution.team,
    agentId: attribution.role,
    ...(attribution.task === undefined ? {} : { taskId: attribution.task }),
  }
}

/**
 * Install the T5 turn-capture wiring: subscribe the session event stream and
 * commit each committed turn to the memory engine. Scope-filtered dispatch
 * delivers every live agent's events to this root listener (`global: true`),
 * so both main and subagent sessions are captured.
 * @param ctx - the harness context.
 * @param memory - the memory engine service (its `onTurnCommitted`).
 * @returns a disposer that unsubscribes.
 */
export function installTurnCapture(ctx: Context, memory: MemoryLike): () => void {
  const onSessionEvent = (session: Session | undefined, event: SessionEvent): void => {
    if (event.type !== 'turn/end' || session === undefined) return
    // Best-effort: a projection/commit failure must never break the loop.
    void (async () => {
      try {
        const turn = buildCompletedTurn(ctx, session)
        await memory.onTurnCommitted(turn)
      } catch (error) {
        ctx.logger.warn(
          `[memory] turn capture failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })()
  }
  ctx.on('session/event', onSessionEvent as never, { global: true })
  return () => {
    // The listener is removed when the owning context unloads; the disposer is
    // provided for symmetry with the effect lifecycle.
  }
}
