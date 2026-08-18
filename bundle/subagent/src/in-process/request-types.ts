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

import type {
  ResolvedSubagentStartRequest,
  SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'

/** A one-shot delegation request with the optional user-defined subagent id. */
export interface HarnessSubagentStartRequest extends SubagentStartRequest {
  /** User-defined subagent id whose plugin tree mounts onto the child. */
  readonly subagent?: string
}

/** The provider-facing one-shot request after the harness service resolves the descriptor. */
export interface HarnessResolvedSubagentStartRequest extends ResolvedSubagentStartRequest {
  /** User-defined subagent id whose plugin tree mounts onto the child. */
  readonly subagent?: string
}
