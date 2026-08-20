/**
 * Browser transport for the model-plan management wire channel.
 *
 * The model-plan registry ("模型方案") rides the connection's dedicated
 * `/model-plan` channel, so this module adapts
 * {@link ClientConnectionRpc.call} into the management surface the settings
 * section controller and the composer model-seat controller consume. Each
 * method mints the payload the Host handler validates against its zod schema
 * and returns the Host's `RpcResult` — the same success/failure shape the
 * team-management wire returns.
 * @module dsh-harness-model-plan-bundle/ui/wire-client
 */
/** Absolute logical channel the Host serves model-plan management on. */
export const MODEL_PLAN_CHANNEL = '/model-plan';
/** Build the management wire face over one connection RPC caller. */
export function createModelPlanWire(rpc) {
    return {
        list: (payload, signal) => call('list', payload, signal),
        read: (payload, signal) => call('read', payload, signal),
        readSelection: (payload, signal) => call('readSelection', payload, signal),
        create: (payload, signal) => call('create', payload, signal),
        update: (payload, signal) => call('update', payload, signal),
        remove: (payload, signal) => call('remove', payload, signal),
        select: (payload, signal) => call('select', payload, signal),
    };
    /** Call one endpoint, returning the caller's declared result type. */
    function call(endpoint, payload, signal) {
        return rpc.call(MODEL_PLAN_CHANNEL, endpoint, payload, signal);
    }
}
//# sourceMappingURL=wire-client.js.map