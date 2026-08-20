/**
 * DeepSeek chat-completions wire format (OpenAI-compatible). Types only.
 *
 * Source of truth: the official API docs at
 * `~/repos/deepsuite-docs/apps/docs/docs` (api/create-chat-completion,
 * guides/thinking_mode.mdx, guides/tool_calls.md), cross-checked against
 * live streams from the internal endpoint (2026-06).
 *
 * HARSH-owned delta over the official copy: `WireRequest` gains an index
 * signature so the model-plan `LlmCallConfig.extra` passthrough bag can be
 * spread into the wire request top level verbatim (serialize.ts). The index
 * signature type is `unknown` so the extra bag's JSON values type-check
 * regardless of their runtime shape.
 *
 * @module dsh-llm-deepseek-extra/types
 */
export {};
//# sourceMappingURL=types.js.map