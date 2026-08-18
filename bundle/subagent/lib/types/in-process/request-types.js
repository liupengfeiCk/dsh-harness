/**
 * Harness-owned delegation request types.
 *
 * The official `@deepseek-ai/dsh-subagent` request types (`SubagentStartRequest`
 * / `ResolvedSubagentStartRequest`) carry no `subagent` field — the official
 * package is restored upstream and stays untouched. This harness ships the
 * user-defined subagent id on its own request types, so the inheritance switch
 * and the named-subagent mount survive without any change to the official
 * request surface.
 *
 * The harness service's public `start`/`startContinuable` signatures keep the
 * OFFICIAL request type (the cordis `Context.subagents` slot is typed by the
 * official `SubagentRuntime`), and the tool carries the extra `subagent` field
 * on the runtime object across that seam. Inside the harness, the provider and
 * engine speak these harness types, so the field is typed end to end.
 *
 * @module dsh-harness-subagent-bundle/in-process/request-types
 */
export {};
//# sourceMappingURL=request-types.js.map