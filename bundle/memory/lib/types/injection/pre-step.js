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
import { assembleInjectionMessages } from "./inject.js";
import { planForStage } from "./stage.js";
/** The session's key for the memory engine (shared session id). */
function sessionKey(session) {
    return String(session.id);
}
/** The effective injection stage for one pre-step, before this step advances. */
function stageBeforeAdvance(ledger, session) {
    return ledger.get(sessionKey(session));
}
/** Whether this is the session's first turn (no user history committed yet). */
function isFirstTurn(session) {
    return session.events.every((event) => event.type !== 'user/message');
}
/**
 * Build an `agent/pre-step` handler bound to the deps. Returns the handler
 * function to register via `ctx.on('agent/pre-step', handler)`.
 */
export function createPreStepHandler(deps) {
    const { ledger, compression } = deps;
    return async (payload, next) => {
        const { agent, signal } = payload;
        const session = agent.session;
        const key = sessionKey(session);
        if (signal.aborted)
            return next();
        try {
            // Stage 3: compression point — run hierarchical compaction when the raw
            // history crosses the line, then advance to post-compression.
            if (deps.autoCompress && deps.compression.shouldCompress(session)) {
                const { layers } = await compression.compress(session);
                deps.log?.('info', `[memory] compressed into ${layers.length} summary layers`);
                ledger.enterPostCompression(key);
            }
        }
        catch (error) {
            deps.log?.('warn', `[memory] compression failed; continuing the turn: ${error instanceof Error ? error.message : String(error)}`);
        }
        // First turn detection: a session with no user history yet is at stage 1.
        const stage = stageBeforeAdvance(ledger, session);
        const effectiveStage = stage === 'pre-compression' && isFirstTurn(session) ? 'first-turn' : stage;
        // Recall the memory content for the current user message (only when the
        // stage calls for it — pre-compression recalls nothing).
        let plan = {};
        if (effectiveStage === 'first-turn' || effectiveStage === 'post-compression') {
            const userText = payload.messages.map((m) => textOf(m)).join('\n');
            try {
                const recall = await deps.recall(userText, key);
                plan = planForStage(effectiveStage, recall);
            }
            catch (error) {
                deps.log?.('warn', `[memory] recall failed; injecting nothing this turn: ${error instanceof Error ? error.message : String(error)}`);
                plan = {};
            }
        }
        else if (effectiveStage === 'compression') {
            // After a compression the snapshot is refreshed once.
            const recall = await safeRecall(deps, '', key);
            plan = planForStage('compression', recall);
        }
        // After the first turn runs, advance to pre-compression.
        if (effectiveStage === 'first-turn')
            ledger.enterPreCompression(key);
        const injected = assembleInjectionMessages(plan);
        if (injected.length === 0)
            return next();
        return {
            kind: 'enter',
            messages: [...injected, ...payload.messages],
        };
    };
}
async function safeRecall(deps, userText, key) {
    try {
        return await deps.recall(userText, key);
    }
    catch (error) {
        deps.log?.('warn', `[memory] recall failed: ${error instanceof Error ? error.message : String(error)}`);
        return {};
    }
}
/** Extract the text content of a user message (its blocks' text, joined). */
function textOf(message) {
    return message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
}
//# sourceMappingURL=pre-step.js.map