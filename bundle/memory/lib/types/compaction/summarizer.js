/**
 * Summarizer seam and a default `ctx.llm.stream()`-backed implementation.
 *
 * The engine is unit-tested with a fake summarizer; the production default
 * follows the official compaction prefix-reuse technique (see
 * official/packages/compaction/compaction-basic/src/summarizer.ts): replay the
 * conversation's own system prompt, tools, and leading messages, then append
 * only the condensation instruction as the final user message, so the auxiliary
 * call is a genuine prefix of the last routed request and reuses the provider's
 * warm KV cache. The compression model may follow the current route (eating the
 * prefix cache) or be pinned to a configured plan.
 *
 * @module dsh-harness-memory-bundle/compaction/summarizer
 */
import { CompactionConfigError } from "./types.js";
/** Instruction delivered as the FINAL user message after the replayed span. */
const CONDENSE_INSTRUCTION = [
    'You are condensing an earlier span of a coding session into a terse engineering summary so another model can resume the work with no loss of essential context.',
    '',
    'Use concise bullets, not prose. Preserve exact file paths, identifiers, numeric values, function signatures, command strings, and error strings verbatim.',
    'Capture: the original request and intent, key technical concepts, files and code, errors and fixes, pending jobs, current work, and the single next step.',
    'Write "(none)" for any empty section; never drop a section.',
    'Do not mention this condensation request.',
    'Output only the summary text — no tool calls, no other action.',
].join('\n');
/**
 * Default summarizer backed by a streaming LLM seam. Constructed with an
 * `llm.stream` callable and a route-resolver that supplies provider/model and
 * (optionally) the replayed system/tools prefix for cache alignment.
 */
export class LlmSummarizer {
    llm;
    resolveOptions;
    constructor(llm, resolveOptions) {
        this.llm = llm;
        this.resolveOptions = resolveOptions;
    }
    async summarize(span, _fromLevel, ctx) {
        const options = this.resolveOptions(ctx);
        if (options.provider.length === 0 || options.model.length === 0) {
            throw new CompactionConfigError('summarizer: no provider/model resolved for compression');
        }
        // Replay the span's messages in surface order, then append the instruction.
        const replay = span.messages.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : message.role === 'tool' ? 'tool' : 'user',
            content: message.text,
        }));
        const request = {
            ...options,
            messages: [
                ...replay,
                { role: 'user', content: CONDENSE_INSTRUCTION },
            ],
        };
        let text = '';
        for await (const chunk of this.llm.stream(request)) {
            const piece = chunk?.text;
            if (typeof piece === 'string')
                text += piece;
        }
        if (text.trim().length === 0)
            return null;
        // Heuristic token estimate: the engine's caller re-prices precisely; here we
        // provide a rough count for cap accounting.
        return {
            text,
            tokens: Math.max(1, Math.ceil(text.length / 4)),
            model: options.model,
        };
    }
}
/**
 * Build a prefix-cache-aligned summarizer from an `llm.stream` callable plus a
 * function that resolves the effective compression route (follow the current
 * route, or a pinned plan). The route resolver returns the provider/model and
 * the cache-aligned prefix (system/tools), matching `resolveOptions`.
 */
export function createPrefixAlignedSummarizer(llm, resolveRoute) {
    return new LlmSummarizer(llm, resolveRoute);
}
//# sourceMappingURL=summarizer.js.map