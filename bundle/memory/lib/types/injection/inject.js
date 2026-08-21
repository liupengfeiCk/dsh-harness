/**
 * Memory message assembly: turn an `InjectionPlan` into concrete `UserMessage`
 * objects that ride the `agent/pre-step` logged surface.
 *
 * Each injected message is tagged `source: { kind: 'plugin', plugin: 'memory',
 * form: 'recall' }` so consumers can recognize (and a downstream pipeline can
 * skip or de-duplicate) memory-injected content. The text is used byte-for-byte
 * from the recall output — no timestamps, session ids, or other dynamic fields
 * are mixed in, satisfying the byte-determinism requirement.
 *
 * @module dsh-harness-memory-bundle/injection/inject
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
/** Stable plugin name carried on every memory-injected message. */
export const MEMORY_PLUGIN = 'memory';
/** The recall-form source tag stamped on memory messages. */
export function memorySource() {
    return { kind: 'plugin', plugin: MEMORY_PLUGIN, form: 'recall' };
}
/**
 * Assemble the ordered `UserMessage[]` for an injection plan.
 * Order matches the design splice: snapshot (L3 + L2 nav) precedes L1, both
 * preceding the turn's real user message (the pre-step caller prefixes them).
 * @param plan - the injection plan decided for the current stage.
 * @returns zero, one, or two messages to prefix onto the step's messages.
 */
export function assembleInjectionMessages(plan) {
    const messages = [];
    if (plan.snapshot !== undefined) {
        messages.push(createUserMessage({
            content: [{ type: 'text', text: plan.snapshot.text }],
            source: memorySource(),
        }));
    }
    if (plan.l1 !== undefined) {
        messages.push(createUserMessage({
            content: [{ type: 'text', text: plan.l1.text }],
            source: memorySource(),
        }));
    }
    return messages;
}
//# sourceMappingURL=inject.js.map