import { D as jsonSchema, U as tool } from "./dist-CQsGjAM6.js";
//#region vendor/lib/adapters/standalone/storage-tools.js
/**
* Storage-backed LLM tool definitions — drop-in replacement for the local-FS
* sandboxed tools in `llm-runner.ts`.
*
* Used in service mode (COS) so that L2/L3 LLM agents read/write files via
* StorageAdapter instead of the local filesystem.
*
* Tool names and schemas are **identical** to `createSandboxedTools`, so
* LLM prompts work unchanged.
*/
const TAG = "[memory-tdai] [storage-tools]";
/**
* Resolve a relative path within a storage prefix boundary (sandbox).
*
* Returns the full storage key (prefix + normalized path), or null if the
* path escapes the prefix boundary (e.g. "../" traversal).
*/
function resolveStorageKey(prefix, relativePath) {
	const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	if (normalized.startsWith("/") || normalized.startsWith("..")) return null;
	const key = `${prefix}${normalized}`;
	if (normalized.split("/").includes("..")) return null;
	return key;
}
/**
* Create storage-backed read/write/edit tools.
*
* @param storage    - StorageAdapter instance (COS or local backend)
* @param prefix     - Key prefix acting as sandbox root (e.g. "scene_blocks/")
* @param logger     - Optional logger for diagnostics
*/
function createStorageTools(storage, prefix, logger) {
	return {
		read: tool({
			description: "Read the contents of a file at the given relative path.",
			inputSchema: jsonSchema({
				type: "object",
				properties: { path: {
					type: "string",
					description: "Relative file path to read."
				} },
				required: ["path"]
			}),
			execute: (async (args) => {
				const key = resolveStorageKey(prefix, args.path);
				if (!key) return JSON.stringify({ error: `Path "${args.path}" escapes workspace boundary.` });
				try {
					const content = await storage.readFile(key);
					if (content === null) {
						logger?.debug?.(`${TAG} read: "${args.path}" → not found`);
						return JSON.stringify({ error: `File not found: ${args.path}` });
					}
					logger?.debug?.(`${TAG} read: "${args.path}" → ${content.length} chars`);
					return content;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger?.warn(`${TAG} read failed (key=${key}): ${msg}`);
					return JSON.stringify({ error: msg });
				}
			})
		}),
		write: tool({
			description: "Write content to a file at the given relative path. Creates or overwrites.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "Relative file path to write."
					},
					content: {
						type: "string",
						description: "Content to write."
					}
				},
				required: ["path", "content"]
			}),
			execute: (async (args) => {
				const key = resolveStorageKey(prefix, args.path);
				if (!key) return JSON.stringify({ error: `Path "${args.path}" escapes workspace boundary.` });
				try {
					await storage.writeFile(key, args.content);
					logger?.debug?.(`${TAG} write: "${args.path}" → ${args.content.length} chars`);
					return JSON.stringify({ success: true });
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger?.warn(`${TAG} write failed (key=${key}): ${msg}`);
					return JSON.stringify({ error: msg });
				}
			})
		}),
		edit: tool({
			description: "Apply one or more text replacements to a file. Each edit replaces an exact substring.",
			inputSchema: jsonSchema({
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "Relative file path."
					},
					edits: {
						type: "array",
						description: "Array of replacements to apply sequentially.",
						items: {
							type: "object",
							properties: {
								oldText: {
									type: "string",
									description: "Exact string to find."
								},
								newText: {
									type: "string",
									description: "Replacement string."
								}
							},
							required: ["oldText", "newText"]
						}
					}
				},
				required: ["path", "edits"]
			}),
			execute: (async (args) => {
				const key = resolveStorageKey(prefix, args.path);
				if (!key) return JSON.stringify({ error: `Path "${args.path}" escapes workspace boundary.` });
				if (!args.edits || args.edits.length === 0) return JSON.stringify({ error: "edits array cannot be empty." });
				try {
					const existing = await storage.readFile(key);
					if (existing === null) {
						logger?.debug?.(`${TAG} edit: "${args.path}" → not found`);
						return JSON.stringify({ error: `File not found: ${args.path}` });
					}
					let content = existing;
					for (const edit of args.edits) {
						if (!edit.oldText) return JSON.stringify({ error: "oldText cannot be empty." });
						if (!content.includes(edit.oldText)) return JSON.stringify({ error: `oldText not found in file "${args.path}": ${edit.oldText.slice(0, 80)}` });
						content = content.replace(edit.oldText, edit.newText);
					}
					await storage.writeFile(key, content);
					logger?.debug?.(`${TAG} edit: "${args.path}" → ${args.edits.length} replacement(s), ${content.length} chars`);
					return JSON.stringify({ success: true });
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					logger?.warn(`${TAG} edit failed (key=${key}): ${msg}`);
					return JSON.stringify({ error: msg });
				}
			})
		})
	};
}
//#endregion
export { createStorageTools };
