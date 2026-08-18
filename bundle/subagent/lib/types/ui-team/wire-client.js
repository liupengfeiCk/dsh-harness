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
/** Absolute logical channel the Host serves team management on. */
export const TEAM_PRESET_CHANNEL = '/team-preset';
/** Build the management wire face over one connection RPC caller. */
export function createTeamPresetWire(rpc) {
    return {
        list: (payload, signal) => call('list', payload, signal),
        read: (payload, signal) => call('read', payload, signal),
        create: (payload, signal) => call('create', payload, signal),
        update: (payload, signal) => call('update', payload, signal),
        remove: (payload, signal) => call('remove', payload, signal),
        openLocation: (payload, signal) => call('openLocation', payload, signal),
    };
    /** Call one endpoint, returning the caller's declared result type. */
    function call(endpoint, payload, signal) {
        return rpc.call(TEAM_PRESET_CHANNEL, endpoint, payload, signal);
    }
}
//# sourceMappingURL=wire-client.js.map