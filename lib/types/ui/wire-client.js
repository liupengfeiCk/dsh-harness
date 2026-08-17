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
/** Absolute logical channel the Host serves agent-preset editing on. */
export const AGENT_PRESET_EDIT_CHANNEL = '/agent-preset-edit';
/** Build the editing wire face over one connection RPC caller. */
export function createAgentPresetEditWire(rpc) {
    return {
        readEditable: (payload, signal) => call('readEditable', payload, signal),
        update: (payload, signal) => call('update', payload, signal),
    };
    /** Call one endpoint, returning the caller's declared result type. */
    function call(endpoint, payload, signal) {
        return rpc.call(AGENT_PRESET_EDIT_CHANNEL, endpoint, payload, signal);
    }
}
//# sourceMappingURL=wire-client.js.map