/**
 * Manifest — self-describing metadata for a memory-tdai data directory.
 *
 * Lives at `<dataDir>/.metadata/manifest.json`.
 *
 * - **store**: written once on first successful store init; never overwritten.
 *   On subsequent starts the current config is compared against the persisted
 *   store binding — mismatches are logged at debug level (informational only).
 * - **seed**: written once when a seed run completes; null for live-runtime dirs.
 *
 * This file is informational / read-only from the user's perspective.
 * The plugin reads it on startup for consistency checks.
 */
export interface ManifestStoreInfo {
    type: "sqlite" | "tcvdb";
    sqlite?: {
        /** Relative path to the SQLite DB file (relative to dataDir). */
        path: string;
    };
    tcvdb?: {
        url: string;
        database: string;
        /** User-friendly alias (optional). */
        alias?: string;
    };
}
export interface ManifestSeedInfo {
    /** Original input file name (basename only). */
    inputFile?: string;
    sessions: number;
    rounds: number;
    messages: number;
    startedAt: string;
    completedAt: string;
}
export interface Manifest {
    /** Schema version for future migrations. */
    version: 1;
    /** Timestamp when the manifest was first created. */
    createdAt: string;
    /** Store binding — written once on first init. */
    store: ManifestStoreInfo;
    /** Seed run info — null for live-runtime directories. */
    seed: ManifestSeedInfo | null;
}
export declare function manifestPath(dataDir: string): string;
/**
 * Read an existing manifest from disk. Returns `null` if not found or unparseable.
 */
export declare function readManifest(dataDir: string): Manifest | null;
/**
 * Write a manifest to disk (creates `.metadata/` if needed).
 */
export declare function writeManifest(dataDir: string, manifest: Manifest): void;
export interface StoreConfigSnapshot {
    type: "sqlite" | "tcvdb";
    sqlitePath?: string;
    tcvdbUrl?: string;
    tcvdbDatabase?: string;
    tcvdbAlias?: string;
}
/**
 * Build a ManifestStoreInfo from the current store config snapshot.
 */
export declare function buildStoreInfo(snapshot: StoreConfigSnapshot): ManifestStoreInfo;
/**
 * Compare the persisted store binding against the current config.
 * Returns a list of human-readable mismatch descriptions (empty = all good).
 */
export declare function diffStoreBinding(persisted: ManifestStoreInfo, current: ManifestStoreInfo): string[];
