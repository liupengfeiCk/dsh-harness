import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
const INITIAL = {
    groups: [], failures: [], status: 'idle', error: null,
};
/** The session-independent model-catalog controller shared by every editor. */
export class ModelCatalogController {
    models;
    /** The snapshot the renderer subscribes to. */
    store = createSnapshotStore(INITIAL);
    constructor(models) {
        this.models = models;
    }
    /**
     * Refresh the catalog. Failure preserves the last good groups and surfaces
     * on the store.
     */
    async load() {
        const before = this.store.getSnapshot();
        if (before.status === 'loading')
            return;
        this.store.set({ ...before, status: 'loading', error: null });
        try {
            const { result } = await this.models.models({});
            if (!result.ok) {
                this.store.set({ ...before, status: 'error', error: `${result.error.code}: ${result.error.message}` });
                return;
            }
            this.store.set({
                groups: result.value.groups,
                failures: result.value.failures,
                status: 'ready',
                error: null,
            });
        }
        catch (error) {
            this.store.set({ ...before, status: 'error', error: error instanceof Error ? error.message : String(error) });
        }
    }
}
//# sourceMappingURL=directory.js.map