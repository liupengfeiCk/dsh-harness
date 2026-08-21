import type { IMemoryStore, ProfileRecord } from "../store/types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Logger } from "../types.js";
export declare const DEFAULT_PROFILE_SCOPE = "global";
export type ProfileIsolation = {
    teamId?: string;
    userId?: string;
    agentId?: string;
    sessionId?: string;
};
export interface ProfileScopeOptions {
    scope?: string;
    isolation?: ProfileIsolation;
}
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
