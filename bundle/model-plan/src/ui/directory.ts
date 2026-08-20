/**
 * Session-independent model catalog for the plan editor's model pool.
 *
 * The settings surface has no session, so it reads the host-scoped catalog
 * (`llm.models`, the same provider-grouped model directory the session model
 * selector reads, but without a per-session selection). This gives the plan
 * editor the provider-grouped model list plus each exact route's reasoning
 * metadata (`reasoningEffort` dropdown sources from it).
 *
 * The host stays the single fact source; failures preserve the last good
 * groups so an editor already open keeps working through a transient catalog
 * hiccup.
 */
import type {
  IApiClient, ModelCatalogFailure, ModelProviderGroup,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Catalog snapshot the plan editor renders from. */
export interface ModelCatalogState {
  /** Successfully loaded provider groups (last good load). */
  groups: readonly ModelProviderGroup[]
  /** Provider-local failures from the last load; usable groups stay usable. */
  failures: readonly ModelCatalogFailure[]
  /** Lifecycle of the in-flight load. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-request failure text; null when none. */
  error: string | null
}

const INITIAL: ModelCatalogState = {
  groups: [], failures: [], status: 'idle', error: null,
}

/** The session-independent model-catalog controller shared by every editor. */
export class ModelCatalogController {
  /** The snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<ModelCatalogState> = createSnapshotStore(INITIAL)

  constructor(
    private readonly models: Pick<IApiClient['llm'], 'models'>,
  ) {}

  /**
   * Refresh the catalog. Failure preserves the last good groups and surfaces
   * on the store.
   */
  async load(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.status === 'loading') return
    this.store.set({ ...before, status: 'loading', error: null })
    try {
      const { result } = await this.models.models({})
      if (!result.ok) {
        this.store.set({ ...before, status: 'error', error: `${result.error.code}: ${result.error.message}` })
        return
      }
      this.store.set({
        groups: result.value.groups,
        failures: result.value.failures,
        status: 'ready',
        error: null,
      })
    } catch (error) {
      this.store.set({ ...before, status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }
}
