/**
 * Browser transport for the agent-preset editing wire channel.
 *
 * The withdrawn apiproxy `agentPreset.readEditable` / `agentPreset.update`
 * methods reached the browser as methods on the shared `IApiClient`; that
 * editing surface now lives on the connection's dedicated
 * `/agent-preset-edit` channel, so this module adapts
 * {@link ClientConnectionRpc.call} into the editing face the section
 * controller consumes. Each method mints the payload the Host handler
 * validates against its zod schema and returns the Host's `RpcResult` — the
 * same success/failure shape the withdrawn `IApiClient` methods returned.
 * @module dsh-harness-agent-preset-editing-bundle/ui/wire-client
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client';
/** Absolute logical channel the Host serves agent-preset editing on. */
export declare const AGENT_PRESET_EDIT_CHANNEL = "/agent-preset-edit";
/** One delegation instance a form may edit. */
export interface WireDelegationRow {
    readonly id: string;
    readonly disabled?: boolean;
    readonly provider?: string;
    readonly backgroundMode?: string;
    readonly backgroundModeLocked: boolean;
    readonly enableRunInBackground?: boolean;
    readonly maxDepth?: unknown;
    readonly toolName?: string;
}
/** One tool row in the inventory, with its enabled state and optional prose. */
export interface WireToolRow {
    readonly id: string;
    readonly name: string;
    readonly disabled: boolean | 'expr';
    readonly description?: string;
}
/** One installable tool package in the available-tools directory. */
export interface WireCatalogTool {
    readonly name: string;
    readonly toolNames: readonly string[];
    readonly description?: string;
    readonly installed: boolean;
}
/** The browser-side editing face over the `/agent-preset-edit` channel. */
export interface AgentPresetEditWire {
    readEditable(payload: {
        agentPreset: string;
    }, signal?: AbortSignal): Promise<RpcResult<{
        agentPreset: string;
        persona?: {
            text: string;
        };
        delegation: readonly WireDelegationRow[];
        tools: readonly WireToolRow[];
        catalog: readonly WireCatalogTool[];
        name?: string;
        description?: string;
    }>>;
    update(payload: {
        agentPreset: string;
        persona?: {
            text?: string;
        };
        delegation?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
        tools?: Readonly<Record<string, {
            disabled: boolean;
        }>>;
        installTools?: readonly string[];
        removeTools?: readonly string[];
        metadata?: {
            name?: string;
            description?: string;
        };
    }, signal?: AbortSignal): Promise<RpcResult<{
        agentPreset: string;
    }>>;
}
/** Build the editing wire face over one connection RPC caller. */
export declare function createAgentPresetEditWire(rpc: ClientConnectionRpc): AgentPresetEditWire;
//# sourceMappingURL=wire-client.d.ts.map