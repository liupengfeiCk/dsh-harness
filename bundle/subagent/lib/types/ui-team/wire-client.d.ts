/**
 * Browser transport for the team-management wire channel.
 *
 * The team roster ("编制表") management rides the connection's dedicated
 * `/team-preset` channel, so this module adapts
 * {@link ClientConnectionRpc.call} into the management surface the team
 * section controller consumes. Each method mints the payload the Host handler
 * validates against its zod schema and returns the Host's `RpcResult` — the
 * same success/failure shape the subagent-management wire returns.
 * @module dsh-harness-subagent-bundle/ui-team/wire-client
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client';
/** Absolute logical channel the Host serves team management on. */
export declare const TEAM_PRESET_CHANNEL = "/team-preset";
/** A team's display metadata on the wire. */
export interface WireTeamMetadata {
    readonly name?: string;
    readonly description?: string;
    readonly enabled?: boolean;
}
/** A role summary on the roster. */
export interface WireRoleSummary {
    readonly id: string;
    /** The role's hierarchy level (positive integer, default 1). */
    readonly level: number;
    readonly broken?: string;
}
/** One team roster row. */
export interface WireTeamEntry {
    readonly id: string;
    readonly trust: 'system' | 'user';
    readonly metadata: WireTeamMetadata;
    readonly roles: readonly WireRoleSummary[];
    readonly broken?: string;
}
/** A role's memory policy. */
export type WireRoleMemory = 'one-shot' | 'persistent';
/** One full role definition (as read, and as staged for create/update). */
export interface WireRole {
    readonly id: string;
    readonly description?: string;
    readonly prompt?: string;
    readonly subagent: string;
    /** The role's hierarchy level (positive integer, default 1). */
    readonly level: number;
    readonly memory: WireRoleMemory;
}
/** One fully-read team. */
export interface WireTeamDetail {
    readonly id: string;
    readonly trust: 'system' | 'user';
    readonly metadata: WireTeamMetadata;
    readonly roles: readonly WireRole[];
    readonly broken?: string;
    /** A config-hygiene advisory (e.g. one-shot role at level >= 2). */
    readonly warning?: string;
}
/** The session-level delegation surface a session may select. */
export type WireTeamMode = 'standard' | 'team';
/** The session's folded mode state as the wire reports it. */
export interface WireTeamModeState {
    readonly mode: WireTeamMode;
    readonly team?: string;
}
/** The browser-side management face over the `/team-preset` channel. */
export interface TeamPresetWire {
    /**
     * Read one session's current delegation surface (`standard` or a team).
     * @param payload - the session whose mode to read.
     * @param signal - caller/connection lifetime.
     */
    modeRead(payload: {
        sessionId: string;
    }, signal?: AbortSignal): Promise<RpcResult<WireTeamModeState>>;
    /**
     * Set one session's delegation surface (and its team in team mode). The
     * host refuses the swap once the session has started, returning
     * `team-mode-locked`.
     * @param payload - the session, the target mode, and the team in team mode.
     * @param signal - caller/connection lifetime.
     */
    modeSelect(payload: {
        sessionId: string;
        mode: WireTeamMode;
        team?: string;
    }, signal?: AbortSignal): Promise<RpcResult<WireTeamModeState>>;
    list(payload: Record<string, never>, signal?: AbortSignal): Promise<RpcResult<{
        teams: readonly WireTeamEntry[];
        authorable: boolean;
        hasDocument: boolean;
        subagents: readonly string[];
    }>>;
    read(payload: {
        id: string;
    }, signal?: AbortSignal): Promise<RpcResult<{
        team: WireTeamDetail;
    }>>;
    create(payload: {
        id: string;
        name?: string;
        description?: string;
        roles: readonly WireRole[];
    }, signal?: AbortSignal): Promise<RpcResult<{
        id: string;
    }>>;
    update(payload: {
        id: string;
        metadata?: WireTeamMetadata;
        roles?: readonly WireRole[];
    }, signal?: AbortSignal): Promise<RpcResult<{
        id: string;
    }>>;
    remove(payload: {
        id: string;
    }, signal?: AbortSignal): Promise<RpcResult<{}>>;
    openLocation(payload: {
        id: string;
    }, signal?: AbortSignal): Promise<RpcResult<{
        opened: true;
    } | {
        opened: false;
        path: string;
    }>>;
}
/** Build the management wire face over one connection RPC caller. */
export declare function createTeamPresetWire(rpc: ClientConnectionRpc): TeamPresetWire;
//# sourceMappingURL=wire-client.d.ts.map