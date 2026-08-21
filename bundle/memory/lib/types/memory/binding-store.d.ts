/**
 * Role↔asset binding relation store (host half, T14 "装配规则").
 *
 * A role (a roster role id) assembles certain memory assets for injection: the
 * bindings decide which L2 scene profiles and L3 personas a role's sessions
 * pull in, alongside its own scoped profiles. This module persists the binding
 * relation as a small JSON document under the memory data dir
 * (`~/.dsh/memory/bindings.json`), keyed by role id, each mapping onto a list
 * of asset references.
 *
 * An asset reference names one asset by its stable identity:
 *   - L1: a record id (`record:{id}`)
 *   - L2/L3: a profile scope + type + filename (`profile:{scope}:{type}:{filename}`)
 *
 * The store is deliberately tiny and dependency-free (only node fs + the home
 * path helpers), so it can be tested in isolation before the wire/UI land.
 *
 * @module dsh-harness-memory-bundle/memory/binding-store
 */
/** The persisted bindings document. */
export interface BindingsDocument {
    /** roleId → the assets bound to that role. */
    readonly roles: Record<string, readonly string[]>;
}
/** The default binding file name under the memory data dir. */
export declare const BINDINGS_FILE = "bindings.json";
/**
 * Load the bindings document, tolerating a missing or corrupt file.
 * @param filePath - the bindings file path.
 * @returns the parsed document (empty on absence/corruption).
 */
export declare function loadBindings(filePath: string): Promise<BindingsDocument>;
/**
 * Persist the bindings document (write-then-rename for atomicity).
 * @param filePath - the bindings file path.
 * @param document - the document to write.
 */
export declare function saveBindings(filePath: string, document: BindingsDocument): Promise<void>;
/**
 * The role↔asset binding controller over one document.
 * @param filePath - the bindings file path (defaults to the memory data dir).
 */
export declare class RoleBindingStore {
    private readonly filePath;
    private document;
    private loaded;
    constructor(filePath: string);
    /** Ensure the document is loaded from disk (idempotent). */
    load(): Promise<void>;
    /** Read the assets bound to one role (empty when none). */
    assetsFor(roleId: string): Promise<readonly string[]>;
    /** Bind one asset to a role (idempotent; keeps the existing order). */
    bind(roleId: string, assetRef: string): Promise<void>;
    /** Remove one asset binding from a role. */
    unbind(roleId: string, assetRef: string): Promise<void>;
    /** Every role that currently has bindings. */
    roles(): Promise<string[]>;
}
//# sourceMappingURL=binding-store.d.ts.map