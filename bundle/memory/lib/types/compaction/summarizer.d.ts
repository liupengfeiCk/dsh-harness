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
import type { LayerSummary, RawSpan, Summarizer } from './types.ts';
/** The LLM service surface this summarizer needs from the harness context. */
export interface LlmStream {
    stream(options: unknown): AsyncIterable<{
        type?: string;
        text?: string;
    }>;
}
/**
 * Default summarizer backed by a streaming LLM seam. Constructed with an
 * `llm.stream` callable and a route-resolver that supplies provider/model and
 * (optionally) the replayed system/tools prefix for cache alignment.
 */
export declare class LlmSummarizer implements Summarizer {
    private readonly llm;
    private readonly resolveOptions;
    constructor(llm: {
        stream: (options: unknown) => AsyncIterable<{
            type?: string;
            text?: string;
        }>;
    }, resolveOptions: (ctx?: {
        readonly system?: string;
        readonly tools?: unknown;
    }) => {
        readonly provider: string;
        readonly model: string;
        readonly maxTokens: number;
        readonly system?: string;
        readonly tools?: unknown;
        readonly sessionId?: string;
        readonly signal?: AbortSignal;
    });
    summarize(span: RawSpan, _fromLevel: number, ctx?: {
        readonly system?: string;
        readonly tools?: unknown;
    }): Promise<Pick<LayerSummary, 'text' | 'tokens' | 'model'> | null>;
}
/**
 * Build a prefix-cache-aligned summarizer from an `llm.stream` callable plus a
 * function that resolves the effective compression route (follow the current
 * route, or a pinned plan). The route resolver returns the provider/model and
 * the cache-aligned prefix (system/tools), matching `resolveOptions`.
 */
export declare function createPrefixAlignedSummarizer(llm: LlmStream, resolveRoute: (ctx?: {
    readonly system?: string;
    readonly tools?: unknown;
}) => {
    readonly provider: string;
    readonly model: string;
    readonly maxTokens: number;
    readonly system?: string;
    readonly tools?: unknown;
    readonly sessionId?: string;
    readonly signal?: AbortSignal;
}): Summarizer;
//# sourceMappingURL=summarizer.d.ts.map