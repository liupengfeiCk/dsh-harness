/**
 * Scene filename normalizer.
 *
 * Defensive engineering layer that runs *after* the LLM writes scene_blocks/*.md
 * and *before* syncSceneIndex(). Even though the prompt forbids spaces and
 * punctuation in filenames, LLMs occasionally produce names like
 * `Daily Rhythm in Shanghai.md`. Such names break:
 *   - Markdown navigation refs that downstream tools parse with `\S+\.md`
 *     (e.g. health-checker's scene reference detection).
 *   - Shell-based tools that iterate scene files without quoting.
 *   - URL/path encoding consumers (COS object keys etc).
 *
 * This module renames offenders to a canonical form on disk and lets every
 * other consumer (PersonaGenerator, recall, profile-sync) read the already
 * sanitized name from scene_index.json — no additional changes needed.
 */
/**
 * Normalize a single scene filename.
 *
 * Rules:
 *   - Preserves the `.md` extension (case-insensitive match, lowercased).
 *   - Whitespace runs (spaces / tabs) → single hyphen.
 *   - Strips quotes, brackets, and ASCII punctuation that breaks shell/markdown.
 *   - Collapses consecutive separators (`-`, `_`, `.`).
 *   - Trims leading / trailing separators.
 *   - Falls back to `"scene"` if the stem becomes empty.
 *
 * Allowed character set after normalization (informally):
 *   ASCII alphanumerics, CJK ideographs, hyphen, underscore, dot.
 *
 * Examples:
 *   "Daily Rhythm in Shanghai.md"  → "Daily-Rhythm-in-Shanghai.md"
 *   "日常生活 健康管理.md"          → "日常生活-健康管理.md"
 *   "Coffee (Yirgacheffe).md"      → "Coffee-Yirgacheffe.md"
 *   "  spaced  .md"                → "spaced.md"
 *   ".MD"                          → "scene.md"
 *   "已经规范.md"                   → "已经规范.md" (no-op)
 */
export declare function normalizeSceneFilename(name: string): string;
/**
 * Return whether a filename already matches its normalized form.
 * Faster than computing the normalized form when callers only need a yes/no.
 */
export declare function isNormalizedSceneFilename(name: string): boolean;
/**
 * Resolve a non-conflicting target path inside `dir` for the desired filename.
 *
 * If `desired` (e.g. `Daily-Rhythm.md`) already exists in `dir`, append a
 * numeric suffix `-2`, `-3`, ... before the `.md` extension until a free slot
 * is found. Caller may also pass `excludePath` to ignore a known existing file
 * (e.g. the source path of an in-flight rename, when source != target).
 */
export declare function resolveUniqueScenePath(dir: string, desired: string, excludePath?: string): Promise<string>;
export interface NormalizeRenameResult {
    /** Number of files that were actually renamed. */
    renamed: number;
    /** Number of files that were already normalized (no-op). */
    skipped: number;
    /** Per-rename audit entries (oldName → newName). */
    renames: Array<{
        from: string;
        to: string;
    }>;
}
/**
 * Walk a scene_blocks directory and rename any `.md` file whose basename does
 * not match `normalizeSceneFilename(basename)`.
 *
 * Safe to call multiple times: subsequent invocations are no-ops once names
 * have stabilized.
 *
 * Notes:
 *   - Non-`.md` files are ignored (the LLM tool surface is restricted to .md,
 *     but the directory may contain transient artifacts).
 *   - Empty / soft-deleted files are not pre-filtered here; the SceneExtractor
 *     cleanup pass handles those before / after this call as appropriate.
 *   - Failures on individual entries are logged via the optional logger and
 *     do not abort the loop — index sync should still see the remaining files.
 */
export declare function normalizeSceneFilenames(blocksDir: string, logger?: {
    debug?: (m: string) => void;
    warn?: (m: string) => void;
}): Promise<NormalizeRenameResult>;
