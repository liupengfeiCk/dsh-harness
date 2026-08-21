/**
 * BackupManager: generic file/directory backup utility.
 *
 * Provides two backup modes:
 *   - `backupFile(src, category, tag, maxKeep)` — copy a single file
 *   - `backupDirectory(src, category, tag, maxKeep)` — copy an entire directory
 *
 * All backups land under `<backupRoot>/<category>/` with timestamped names.
 * After each backup, entries beyond `maxKeep` are automatically pruned
 * (oldest first, by lexicographic order on the timestamp-embedded name).
 */
export declare class BackupManager {
    private backupRoot;
    /**
     * @param backupRoot - Absolute path to the root backup directory
     *                     (e.g. `<dataDir>/.backup`).
     */
    constructor(backupRoot: string);
    /**
     * Backup a single file.
     *
     * Destination: `<backupRoot>/<category>/<category>_<timestamp>_<tag>.<ext>`
     *
     * @param srcFile   - Absolute path to the source file
     * @param category  - Logical grouping (e.g. "persona")
     * @param tag       - Additional identifier (e.g. "offset42")
     * @param maxKeep   - Max backup files to retain in this category (0 = unlimited)
     */
    backupFile(srcFile: string, category: string, tag: string, maxKeep: number): Promise<void>;
    /**
     * Backup an entire directory (shallow copy of all files).
     *
     * Destination: `<backupRoot>/<category>/<category>_<timestamp>_<tag>/`
     *
     * @param srcDir    - Absolute path to the source directory
     * @param category  - Logical grouping (e.g. "scene_blocks")
     * @param tag       - Additional identifier (e.g. "offset42")
     * @param maxKeep   - Max backup directories to retain in this category (0 = unlimited)
     */
    backupDirectory(srcDir: string, category: string, tag: string, maxKeep: number): Promise<void>;
    /**
     * Find the latest backup directory for a category.
     *
     * Backup directory names are `<category>_<timestamp>_<tag>` where the
     * timestamp is `YYYYMMDD_HHmmss` (lexicographic order = chronological order),
     * so the lexicographically largest entry is the most recent one.
     *
     * @param category - Logical grouping (e.g. "scene_blocks")
     * @returns Absolute path to the latest backup directory, or undefined if none.
     */
    findLatestBackup(category: string): Promise<string | undefined>;
    /**
     * Restore the latest backup of `category` into `destDir`.
     *
     * Strategy:
     *   1. Find the latest backup directory; if none exists, do nothing
     *      (fail-soft: never clobber the destination when there is no
     *      ground truth to restore from).
     *   2. Wipe `destDir` and recreate it.
     *   3. Copy every regular file from the backup directory into `destDir`.
     *
     * @param category - Logical grouping (e.g. "scene_blocks")
     * @param destDir  - Absolute path to the directory to restore into
     * @returns `{ restored: true, from }` when a backup was applied,
     *          `{ restored: false }` when no backup was found.
     * @throws  Lets fs errors during wipe/copy propagate so callers can decide
     *          whether to fail-soft (log) or fail-hard.
     */
    restoreLatestDirectory(category: string, destDir: string): Promise<{
        restored: boolean;
        from?: string;
    }>;
}
