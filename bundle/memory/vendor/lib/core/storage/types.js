/**
 * File Storage Abstraction Layer — Core Types & Interfaces.
 *
 * This module defines the file storage contracts for L2 scenario files,
 * L3 persona files, checkpoints, and (future) media uploads.
 *
 * Design principles:
 * 1. **Backend-agnostic**: Upper layers depend only on IStorageBackend —
 *    never on COS SDK or fs internals directly.
 * 2. **Async-first**: All methods return Promises (COS is inherently async,
 *    local-fs adapter wraps with async for uniformity).
 * 3. **Extensible**: Interface is minimal for v1; future phases add
 *    presigned URLs, STS credential generation, multipart upload, etc.
 *
 * Relationship to IMemoryStore (src/core/store/types.ts):
 *   - IMemoryStore  = database abstraction (L0/L1 structured data → VDB/SQLite)
 *   - IStorageBackend = file storage abstraction (L2/L3 Markdown files → COS/local-fs)
 *   Both are parallel, not replacements of each other.
 */
// ============================
// Storage Path Constants (retained from original design)
// ============================
/**
 * Storage path conventions.
 *
 * COS full path: {pathPrefix}/{key}
 *
 * key directory structure:
 *   conversations/{YYYY-MM-DD}.jsonl   — L0 conversation records
 *   records/{YYYY-MM-DD}.jsonl         — L1 memory records
 *   scene_blocks/{name}.md             — L2 scene blocks
 *   persona.md                         — L3 user persona
 *   .metadata/scene_index.json         — scene index
 *   .metadata/checkpoint.json          — pipeline checkpoint
 *   .metadata/manifest.json            — metadata manifest
 *   .metadata/instance_id              — instance ID
 *   .backup/persona/                   — persona backups
 *   .backup/scene_blocks/              — scene block backups
 */
export const StoragePaths = {
    /** L3 core memory. Chat mode stores persona; code mode stores Team Operating Doctrine in the same file. */
    persona: "persona.md",
    /** L2 scene blocks directory */
    sceneBlocksDir: "scene_blocks/",
    /** L0 conversations directory */
    conversationsDir: "conversations/",
    /** L1 memory records directory */
    recordsDir: "records/",
    /** Metadata directory */
    metadataDir: ".metadata/",
    /** Scene index */
    sceneIndex: ".metadata/scene_index.json",
    /** Pipeline checkpoint */
    checkpoint: ".metadata/checkpoint.json",
    /** Metadata manifest */
    manifest: ".metadata/manifest.json",
    /** Instance ID */
    instanceId: ".metadata/instance_id",
    /** Backup directory */
    backupDir: ".backup/",
    /** Build scene block path */
    sceneBlock: (name) => `scene_blocks/${name}.md`,
    /** Build conversation JSONL path */
    conversation: (date) => `conversations/${date}.jsonl`,
    /** Build memory record JSONL path */
    record: (date) => `records/${date}.jsonl`,
    /** Build persona backup path */
    personaBackup: (index) => `.backup/persona/persona.${index}.md`,
    /** Build scene block backup path */
    sceneBlockBackup: (index, name) => `.backup/scene_blocks/${index}/${name}.md`,
};
