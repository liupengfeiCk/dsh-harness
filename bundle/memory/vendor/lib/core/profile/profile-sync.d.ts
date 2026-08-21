import type { IMemoryStore, ProfileRecord } from "../store/types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Logger } from "../types.js";
export declare const DEFAULT_PROFILE_SCOPE = "global";
/**
 * The isolation coordinates for one profile scope (design §4.1 三维正交).
 *
 * Three orthogonal scope dimensions, each materializing an independent
 * `profiles/{scope}/` tree (scene_blocks + persona.md + scene_index):
 *   - team scope        — `team:{teamId}`                          (team-level memory)
 *   - team+role scope   — `team:{teamId}|agent:{roleId}`           (role-level memory)
 *   - project scope     — `project:{projectId}`                    (project facts)
 *
 * `agentId` carries the roster ROLE id (semantic re-interpretation — the vendor
 * column name is KEPT, its meaning becomes the 编制表 role, per the user's
 * direction to make our coordinate system primary). `userId`/`sessionId` are
 * retained for backwards compatibility with old scope forms; new profile
 * writes leave them empty.
 */
export type ProfileIsolation = {
    teamId?: string;
    /** Roster role id (semantic reinterpretation of the vendor `agentId` column). */
    agentId?: string;
    userId?: string;
    /** Project id — the working directory the session belongs to. */
    projectId?: string;
    sessionId?: string;
};
export interface ProfileScopeOptions {
    scope?: string;
    isolation?: ProfileIsolation;
}
/**
 * Build the profile scope key for one isolation coordinate. Priority order:
 *   1. a `projectId` → the independent `project:{projectId}` scope;
 *   2. a team + role (`agentId`) → `team:{teamId}|agent:{agentId}` (the
 *      team+role level, reusing the vendor team+agent spine — the `agent` key
 *      name is kept, its value is the roster role id);
 *   3. a bare team (no role) → `team:{teamId}` (the team level).
 * `userId`/`sessionId`/`taskId` never enter a profile scope: L0/L1 keep those
 * dimensions, but L2/L3 profiles accumulate across sessions.
 */
export declare function buildProfileIsolationScope(ctx?: ProfileIsolation): string;
export declare function parseProfileIsolationScope(scope: string): ProfileIsolation | undefined;
export interface ProfileBaseline {
    version: number;
    contentMd5: string;
    createdAtMs: number;
}
export declare function buildProfileStableId(scope: string, type: "l2" | "l3", filename: string): string;
export declare function listLocalProfiles(dataDir: string, storage?: StorageAdapter, options?: ProfileScopeOptions): Promise<ProfileRecord[]>;
export declare function pullProfilesToLocal(dataDir: string, store: IMemoryStore, logger: Logger, storage?: StorageAdapter, options?: ProfileScopeOptions): Promise<Map<string, ProfileBaseline>>;
export declare function syncLocalProfilesToStore(dataDir: string, store: IMemoryStore, baselineMap: Map<string, ProfileBaseline>, logger: Logger, storage?: StorageAdapter, options?: ProfileScopeOptions): Promise<ProfileRecord[]>;
export declare function ensureL2L3Local(dataDir: string, store: IMemoryStore, logger: Logger, storage?: StorageAdapter, options?: ProfileScopeOptions): Promise<Map<string, ProfileBaseline>>;
