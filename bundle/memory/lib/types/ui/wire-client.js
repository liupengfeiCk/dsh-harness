/**
 * Browser transport for the memory-management wire channel.
 *
 * The "记忆" settings section rides the connection's dedicated `/memory`
 * channel, so this module adapts {@link ClientConnectionRpc.call} into the
 * management surface the section controller consumes. Each method mints the
 * payload the Host handler validates against its zod schema and returns the
 * Host's `RpcResult` — the same success/failure shape the model-plan and
 * task-management wires return.
 * @module dsh-harness-memory-bundle/ui/wire-client
 */
/** Absolute logical channel the Host serves memory management on. */
export const MEMORY_CHANNEL = '/memory';
/** Build the management wire face over one connection RPC caller. */
export function createMemoryWire(rpc) {
    return {
        assets: (payload, signal) => call('assets', payload, signal),
        assetRead: (payload, signal) => call('assetRead', payload, signal),
        assetDelete: (payload, signal) => call('assetDelete', payload, signal),
        bindRole: (payload, signal) => call('bindRole', payload, signal),
        unbindRole: (payload, signal) => call('unbindRole', payload, signal),
        roleBindings: (payload, signal) => call('roleBindings', payload, signal),
        status: (payload, signal) => call('status', payload, signal),
        config: (payload, signal) => call('config', payload, signal),
    };
    /** Call one endpoint, returning the caller's declared result type. */
    function call(endpoint, payload, signal) {
        return rpc.call(MEMORY_CHANNEL, endpoint, payload, signal);
    }
}
//# sourceMappingURL=wire-client.js.map