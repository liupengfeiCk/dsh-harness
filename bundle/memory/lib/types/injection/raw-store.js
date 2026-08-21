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
/** Deterministic character-based token estimate: ~4 chars per token. */
export function estimateTokens(text) {
    return Math.max(1, Math.ceil(text.length / 4));
}
/** Extract the concatenated text of a derived message's text blocks. */
export function textOfMessage(message) {
    return message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
}
/** The compaction role for a derived message (tool results surface as user). */
export function compactionRole(message) {
    if (message.role === 'assistant')
        return 'assistant';
    // Tool results and ordinary user text both surface as user-role; treat tool
    // results as `tool` so retention never splits a tool call from its result.
    const sourceKind = message.source.kind;
    return sourceKind === 'tool' ? 'tool' : 'user';
}
/**
 * Project one surface-eligible session event into a `CompactionMessage`, using
 * the session's own projection so the text and role match the model-visible
 * history exactly. Non-surface events yield `null`.
 */
export function projectEvent(session, event) {
    if (event.type !== 'user/message' && event.type !== 'assistant/message' && event.type !== 'tool/result') {
        return null;
    }
    const message = session.deriveEventMessage(event);
    if (message === null)
        return null;
    const text = textOfMessage(message);
    return {
        seq: event.seq,
        text,
        tokens: estimateTokens(text),
        role: compactionRole(message),
    };
}
/**
 * Build a live `RawStore` over one session's event log.
 * `read` returns the compactable messages in `range` (inclusive), surface order.
 */
export function sessionRawStore(session) {
    return {
        async read(range) {
            const [start, end] = range;
            const result = [];
            for (const event of session.events) {
                if (event.seq < start)
                    continue;
                if (event.seq > end)
                    break;
                const message = projectEvent(session, event);
                if (message !== null)
                    result.push(message);
            }
            return result;
        },
        async has(seq) {
            return session.events.some((event) => event.seq <= seq);
        },
    };
}
//# sourceMappingURL=raw-store.js.map