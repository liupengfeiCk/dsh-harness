/**
 * Browser transport for the subagent-management wire channel.
 *
 * The withdrawn apiproxy `subagentPreset.*` domain reached the browser as
 * methods on the shared `IApiClient`; that domain now lives on the connection's
 * dedicated `/subagent-preset` channel, so this module adapts
 * {@link ClientConnectionRpc.call} into the same management surface the section
 * controller consumes. Each method mints the payload the Host handler
 * validates against its zod schema and returns the Host's `RpcResult` — the
 * same success/failure shape the withdrawn `IApiClient` methods returned
 * (minus the echoed rpcId, which the section never used).
 * @module dsh-harness-subagent-bundle/ui/wire-client
 */
/** Absolute logical channel the Host serves subagent management on. */
export const SUBAGENT_PRESET_CHANNEL = '/subagent-preset';
/** Build the management wire face over one connection RPC caller. */
export function createSubagentPresetWire(rpc) {
    return {
        list: (payload, signal) => call('list', payload, signal),
        read: (payload, signal) => call('read', payload, signal),
        create: (payload, signal) => call('create', payload, signal),
        openDocument: (payload, signal) => call('openDocument', payload, signal),
        remove: (payload, signal) => call('remove', payload, signal),
        readEditable: (payload, signal) => call('readEditable', payload, signal),
        update: (payload, signal) => call('update', payload, signal),
    };
    /** Call one endpoint, returning the caller's declared result type. */
    function call(endpoint, payload, signal) {
        return rpc.call(SUBAGENT_PRESET_CHANNEL, endpoint, payload, signal);
    }
}
//# sourceMappingURL=wire-client.js.map