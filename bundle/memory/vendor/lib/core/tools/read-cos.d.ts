/**
 * read_cos tool: Agent-callable tool for reading files from COS (or local storage).
 *
 * This tool allows the Agent to read Markdown scenario files, persona files,
 * or any other text content stored via IStorageBackend.
 *
 * The Agent provides a full relative key (e.g. "scene_blocks/work/2026Q1.md"
 * or "persona.md"), and the tool returns the file content as text.
 *
 * Path convention (方案 B — 通用文件接口):
 *   - v2 API /scenario/* and /persona/* are semantic interfaces that auto-add
 *     StoragePaths prefixes (e.g. "scene_blocks/"). Users pass short paths.
 *   - This tool is a generic file interface. Users pass the FULL relative key
 *     including the directory prefix. This allows reading any layer's files.
 *
 * Use cases:
 * - Agent reads L2 scenario files: "scene_blocks/work/2026Q1.md"
 * - Agent reads L3 persona file: "persona.md"
 * - Future: Agent reads any stored document
 *
 * The tool is registered via `api.registerTool()` in index.ts.
 */
import type { IStorageBackend, StorageLogger } from "../storage/types.js";
export interface ReadCosParams {
    /** File path to read, e.g. "scenes/work/2026Q1.md" or "persona/persona.md". */
    path: string;
    /** Optional: encoding hint. Default is "utf-8". */
    encoding?: string;
}
export interface ReadCosResult {
    /** Whether the file was found and read successfully. */
    success: boolean;
    /** File path that was requested. */
    path: string;
    /** File content (text). Empty string if not found. */
    content: string;
    /** File size in bytes. */
    size: number;
    /** Error message if the read failed. */
    error?: string;
}
/**
 * Execute the read_cos tool: read a file from storage by path.
 *
 * @param params  Tool parameters from the LLM
 * @param storage IStorageBackend instance (injected from plugin context)
 * @param logger  Logger instance
 * @returns ReadCosResult
 */
export declare function executeReadCos(params: ReadCosParams, storage: IStorageBackend, logger?: StorageLogger): Promise<ReadCosResult>;
/** JSON Schema for the read_cos tool parameters. */
export declare const READ_COS_TOOL_SCHEMA: {
    type: "object";
    properties: {
        path: {
            type: "string";
            description: string;
        };
    };
    required: readonly ["path"];
};
/** Tool name constant. */
export declare const READ_COS_TOOL_NAME = "tdai_read_cos";
/** Tool description visible to the LLM. */
export declare const READ_COS_TOOL_DESCRIPTION: string;
