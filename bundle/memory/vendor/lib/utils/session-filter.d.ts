/**
 * Session filtering for memory-tdai.
 *
 * Decides whether a session should be ignored by the memory plugin
 * (capture, recall, pipeline scheduling). All skip rules are compiled
 * into a flat list of matchers at construction time — zero per-call overhead.
 */
export interface AgentHookContext {
    sessionKey?: string;
    sessionId?: string;
    trigger?: string;
}
/**
 * Returns true when the hook was fired by a non-interactive trigger
 * (heartbeat, cron job, automation, etc.) — these produce no meaningful
 * user conversation and should not be captured or counted.
 */
export declare function isNonInteractiveTrigger(trigger?: string, sessionKey?: string): boolean;
/**
 * Unified filter: construct once at plugin startup, then call
 * `shouldSkip(sessionKey)` or `shouldSkipCtx(ctx)` at each gate.
 */
export declare class SessionFilter {
    private readonly matchers;
    constructor(excludeAgents?: string[]);
    /** Should this sessionKey be skipped? */
    shouldSkip(sessionKey: string): boolean;
    /** Should this hook context be skipped? */
    shouldSkipCtx(ctx: AgentHookContext): boolean;
}
