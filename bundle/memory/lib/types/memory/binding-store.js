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
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
/** The default binding file name under the memory data dir. */
export const BINDINGS_FILE = 'bindings.json';
/**
 * Load the bindings document, tolerating a missing or corrupt file.
 * @param filePath - the bindings file path.
 * @returns the parsed document (empty on absence/corruption).
 */
export async function loadBindings(filePath) {
    try {
        const text = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(text);
        if (parsed !== null && typeof parsed === 'object' && typeof parsed.roles === 'object') {
            return { roles: parsed.roles };
        }
        return { roles: {} };
    }
    catch {
        return { roles: {} };
    }
}
/**
 * Persist the bindings document (write-then-rename for atomicity).
 * @param filePath - the bindings file path.
 * @param document - the document to write.
 */
export async function saveBindings(filePath, document) {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(document, null, 2), 'utf8');
    await writeFile(filePath, JSON.stringify(document, null, 2), 'utf8');
    try {
        await rm(tmp, { force: true });
    }
    catch { /* non-fatal */ }
}
/**
 * The role↔asset binding controller over one document.
 * @param filePath - the bindings file path (defaults to the memory data dir).
 */
export class RoleBindingStore {
    filePath;
    document = { roles: {} };
    loaded = false;
    constructor(filePath) {
        this.filePath = filePath;
    }
    /** Ensure the document is loaded from disk (idempotent). */
    async load() {
        if (this.loaded)
            return;
        this.document = await loadBindings(this.filePath);
        this.loaded = true;
    }
    /** Read the assets bound to one role (empty when none). */
    async assetsFor(roleId) {
        await this.load();
        return this.document.roles[roleId] ?? [];
    }
    /** Bind one asset to a role (idempotent; keeps the existing order). */
    async bind(roleId, assetRef) {
        await this.load();
        const current = this.document.roles[roleId] ?? [];
        if (current.includes(assetRef))
            return;
        this.document = {
            roles: { ...this.document.roles, [roleId]: [...current, assetRef] },
        };
        await saveBindings(this.filePath, this.document);
    }
    /** Remove one asset binding from a role. */
    async unbind(roleId, assetRef) {
        await this.load();
        const current = this.document.roles[roleId];
        if (current === undefined)
            return;
        const next = current.filter(ref => ref !== assetRef);
        const roles = { ...this.document.roles };
        if (next.length === 0) {
            delete roles[roleId];
        }
        else {
            roles[roleId] = next;
        }
        this.document = { roles };
        await saveBindings(this.filePath, this.document);
    }
    /** Every role that currently has bindings. */
    async roles() {
        await this.load();
        return Object.keys(this.document.roles);
    }
}
//# sourceMappingURL=binding-store.js.map