/**
 * Scene Index: maintains a JSON index of all scene blocks for quick lookup.
 */
import type { StorageAdapter } from "../storage/adapter.js";
export interface SceneIndexEntry {
    filename: string;
    summary: string;
    heat: number;
    created: string;
    updated: string;
}
/**
 * Read the scene index from disk.
 *
 * The index is written exclusively by syncSceneIndex() (engineering side).
 * The LLM is sandboxed to scene_blocks/ and cannot access this file.
 */
export declare function readSceneIndex(dataDir: string, storage?: StorageAdapter): Promise<SceneIndexEntry[]>;
/**
 * Write the scene index to disk.
 */
export declare function writeSceneIndex(dataDir: string, entries: SceneIndexEntry[], storage?: StorageAdapter): Promise<void>;
/**
 * Rebuild scene index by scanning all .md files in the scene_blocks directory.
 */
export declare function syncSceneIndex(dataDir: string, storage?: StorageAdapter): Promise<SceneIndexEntry[]>;
