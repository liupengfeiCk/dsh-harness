/** Sub-agent vocabulary shared by discovery, registry, and consumers. */
/**
 * Ids a subagent directory may use.
 *
 * The id becomes a path segment, so this is a containment boundary rather than
 * a style rule: `..`, a separator, or an absolute-looking name would place the
 * composition outside the root the deployment authorised.
 */
export const SUBAGENT_ID = /^[a-z0-9][a-z0-9-]*$/;
/**
 * No configured root supplies the requested subagent.
 *
 * Separate from a mount failure because the two mean different things to a
 * caller: an unknown id is a bad request, while an unusable composition is a
 * broken subagent the deployment must fix.
 */
export class UnknownSubagentError extends Error {
    subagentId;
    available;
    constructor(
    /** The id that was requested. */
    subagentId, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available) {
        super(`subagent-presets: subagent "${subagentId}" not found (available: ${available.join(', ') || 'none'})`);
        this.subagentId = subagentId;
        this.available = available;
    }
}
/** A subagent exists but its composition cannot be installed. */
export class SubagentMountError extends Error {
    subagentId;
    reason;
    constructor(
    /** The subagent whose composition failed. */
    subagentId, 
    /** Why it failed, without this package's own message prefix. */
    reason, options) {
        super(`subagent-presets: subagent "${subagentId}" failed to mount: ${reason}`, options);
        this.subagentId = subagentId;
        this.reason = reason;
    }
}
//# sourceMappingURL=types.js.map