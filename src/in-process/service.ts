/**
 * Harness-owned subagent capability seam (`ctx.subagents`): the named-provider
 * registry plus the capability-validating start API. This replaces the official
 * `@deepseek-ai/dsh-subagent` service in the shipped composition (the base
 * bundle's `subagent` plugin row points here), so the harness inheritance
 * switch and the durable `subagent` id survive when the official package is
 * restored upstream (task 3).
 *
 * UPSTREAM-SYNC NOTE: the service surface below — the constructor wiring, the
 * provider registry, the one-shot `start`, and the continuable verbs — is
 * copied from `@deepseek-ai/dsh-subagent/src/index.ts` so behaviour stays
 * byte-identical with the official seam. The DELIBERATE deviations are:
 *   - the manager installed in the `agents` binding is OUR
 *     `SubagentContinuationManager` (`./continuation.ts`), which composes
 *     children through OUR `setupChildComposition` and folds/snapshots through
 *     OUR harness descriptor, so neither the `inheritParent` switch nor the
 *     persisted `subagent` id is lost when the official package is restored;
 *   - the class is named {@link HarnessSubagentRuntime} (not the official
 *     `SubagentRuntime`), so the two can coexist while the switch ships;
 *   - the provider registry is last-write-wins with conditional removal
 *     (same-name re-registration supersedes instead of throwing
 *     `DUPLICATE_PROVIDER`), which the official seam does not — required for
 *     hot-recomposition where a reconciling layer re-mounts a provider into a
 *     still-active registry. See {@link HarnessSubagentRuntime.registerProvider}.
 * Every tool helper is imported from the official package, never copied.
 * When the official service changes upstream, re-sync this file.
 *
 * @module dsh-harness-subagent-bundle/in-process/service
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type { ContentBlock, MessageId } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  assertSubagentMaxDepth,
  snapshotSubagentDescriptor,
  SubagentError,
} from '@deepseek-ai/dsh-subagent'
import type {
  ContinuableCreateRequest,
  ContinuableCreateSpec,
  SubagentCapabilities,
  SubagentProvider,
  SubagentRun,
  SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'
import type {
  HarnessResolvedSubagentStartRequest,
  HarnessSubagentStartRequest,
} from './request-types.ts'
import {
  createActivationObserver,
  createLifecycleEmitter,
  observeRun,
} from './upstream/lifecycle.ts'
import type { ActivationObserver, LifecycleEmitter } from './upstream/lifecycle.ts'
import {
  listChildren as listSubagentChildren,
  listDescendants as listSubagentDescendants,
} from './upstream/list-children.ts'
import type { SubagentDescendantListEntry, SubagentListEntry } from './upstream/list-children.ts'
import SubagentActivationSetupRegistry from './upstream/activation-setup-registry.ts'
import type { ContinuableSetupContribution } from './upstream/activation-setup-registry.ts'
import {
  subagentIdentityProjectionDefinition,
  subagentTimingProjectionDefinition,
} from './upstream/projection.ts'
import SubagentContinuationManager from './continuation.ts'
import type {
  ContinuableStart,
  ContinuableStartSpec,
  SubagentFollowupOptions,
  SubagentInterruptAuthority,
  SubagentReportOptions,
} from './continuation.ts'

/**
 * The subagent capability seam (`ctx.subagents`) for the harness composition.
 *
 * TYPE-NOTE on `ctx.subagents`: the official `@deepseek-ai/dsh-subagent`
 * declares `Context.subagents: SubagentRuntime`, and that class carries private
 * fields, so our {@link HarnessSubagentRuntime} is not a structural subtype of
 * it. We do NOT re-declare the cordis module here (a second augmentation would
 * collide), so at compile time `ctx.subagents` keeps the official type while at
 * runtime `super(ctx, 'subagents')` registers THIS instance. Because the public
 * method set below mirrors the official one exactly, every caller that reads
 * `ctx.subagents` through the official type still type-checks and dispatches to
 * this harness manager. Where code must hold OUR instance in a slot typed as
 * the official `SubagentRuntime` (e.g. a fixture booting this service), cast it
 * with `as unknown as SubagentRuntime` and note that the private fields are
 * declaration-only and never read across the seam.
 */
/**
 * One named-provider registration slot. A registry entry is keyed by the
 * provider name and holds the provider plus a unique token so a later
 * same-name registration can supersede an earlier one (last-write-wins), while
 * the earlier disposer can tell — by token identity — whether it still owns the
 * slot before conditionally deleting it.
 */
interface ProviderRecord {
  provider: SubagentProvider
  token: string
}

export class HarnessSubagentRuntime extends Service {
  private providers = new Map<string, ProviderRecord>()
  private continuations: SubagentContinuationManager | undefined
  /** Deployment contributions composed into unpublished continuable children. */
  private readonly setupRegistry = new SubagentActivationSetupRegistry()
  /**
   * The contained lifecycle-edge publisher. Built here because scoped dispatch
   * keys its carrier by this exact service instance, whose own context filter
   * composes into the carrier.
   */
  private readonly emitLifecycle: LifecycleEmitter

  constructor(ctx: Context) {
    super(ctx, 'subagents')
    this.emitLifecycle = createLifecycleEmitter(this.ctx, parent => scopeTarget(this, parent))
    // Both bindings use the official `ctx.inject` form (identical to the
    // upstream SubagentRuntime), so the harness hot loader drives them exactly
    // as boot does — no get+event workaround needed.
    ctx.inject(['agents'], (childCtx: Context) => {
      // OUR continuation manager, not the official one: it composes children
      // through OUR engine's `setupChildComposition` and folds/snapshots the
      // harness descriptor, keeping the inheritance switch and the persisted
      // `subagent` id after the official package is restored upstream.
      const manager = new SubagentContinuationManager(childCtx, {
        prepareContinuable: (name, request) => this.prepareContinuable(name, request),
        observeActivation: (provider, childId, parent) => this.observeActivation(provider, childId, parent),
      }, this.setupRegistry)
      this.continuations = manager
      childCtx.effect(() => () => {
        /* v8 ignore else -- one injected binding owns the slot until its fiber disposes. */
        if (this.continuations === manager) this.continuations = undefined
      }, 'subagents.continuationBinding()')
    })
    ctx.inject(['sessionProjections'], (projectionCtx) => {
      projectionCtx.sessionProjections.register(subagentTimingProjectionDefinition)
      projectionCtx.sessionProjections.register(subagentIdentityProjectionDefinition)
    })
  }

  /**
   * Establish one durable continuable child and deliver its initial prompt.
   * Resolves when the child's inbox accepts that prompt, without waiting for the
   * turn to start or for the message to reach the Session log; any earlier
   * failure rejects with no ids and rolls back the child entirely.
   * @param spec - provider, delegation request, and caller cancellation.
   * @returns the durable child id and the accepted prompt's message id.
   * @throws when continuation services are unavailable or materialization fails.
   */
  async startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart> {
    return this.requireContinuations().startContinuable(spec)
  }

  /**
   * Deliver one later message to a continuable child as its next FIFO turn. A
   * resident child's Agent inbox accepts it directly (waking a `waiting`
   * Activation), while an absent one is cold-resumed from its persisted
   * Session. The Agent inbox is the only queue, so every accepted message has
   * one observable order.
   * @param parent - the exact live direct parent authorizing this delivery.
   * @param childId - durable child session id.
   * @param content - user-role content to deliver.
   * @param options - the message source fields and caller cancellation, which stops the
   *   operation only before inbox acceptance.
   * @returns the accepted message's inbox id.
   * @throws when continuation services are unavailable, parent authority is
   *   rejected, or the message was not admitted.
   */
  async followup(
    parent: Agent,
    childId: SessionId,
    content: ContentBlock[],
    options: SubagentFollowupOptions,
  ): Promise<MessageId> {
    return this.requireContinuations().followup(parent, childId, content, options)
  }

  /**
   * Interrupt one live continuable child's current turn under a human parent
   * address or an exact live ancestor Agent. Fire-and-return: the cancel
   * signal is issued before this returns, but the target may keep running
   * until it observes the signal. Unclaimed pending inbox work, the Activation,
   * and published descendants are preserved; claimed work is not requeued.
   * An absent target — including a one-shot or unknown id — is an accepted
   * no-op, as is a manager-less composition, which cannot own a live
   * Activation.
   * @param targetSessionId - the durable child session id to interrupt.
   * @param authority - the human parent address or exact live ancestor Agent.
   * @throws {SubagentError} `UNAUTHORIZED` when the authority does not own the
   *   live target.
   */
  interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void {
    this.continuations?.interrupt(targetSessionId, authority)
  }

  /**
   * Deliver selected content from one live continuable child to its durable
   * direct parent. The child is the authority credential; callers cannot name a
   * recipient. Reporting does not conclude the child's turn or Activation.
   * @param child - exact live reporting child.
   * @param content - selected model-facing content.
   * @param options - parent scheduling and pre-acceptance cancellation.
   * @returns the stable identity of the parent-accepted message.
   * @throws when continuation services are unavailable, sender authorization
   *   fails, or the direct parent is not live.
   */
  async reportFrom(
    child: Agent,
    content: ContentBlock[],
    options: SubagentReportOptions,
  ): Promise<MessageId> {
    return this.requireContinuations().reportFrom(child, content, options)
  }

  /**
   * Compose one deployment capability into every continuable child's
   * unpublished creation context on fresh creation and cold resume. Grants wait
   * for the next Activation; removing the contribution revokes every resident
   * installation immediately.
   * @param contribution - synchronous child-scope installer.
   * @returns the exact Cordis effect disposer.
   */
  registerContinuableSetup(contribution: ContinuableSetupContribution): () => void {
    // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
    return this.ctx.effect(
      () => this.setupRegistry.register(contribution),
      'subagents.registerContinuableSetup()',
    )
  }

  /**
   * Close continuable admission below exact live parent Agents, stop only their
   * visible descendant Activations synchronously, then await admitted scoped
   * materializations and release those forests child-first.
   * @param parents - exact host-owned parent Agents entering teardown.
   * @returns once every retained descendant Activation released its `AgentHandle`.
   * @throws an aggregate error after all branches settle when any failed.
   */
  async drainContinuableDescendants(parents: readonly Agent[]): Promise<void> {
    const manager = this.continuations
    // Absent continuation services means nothing was ever materialized.
    if (manager === undefined) return
    await manager.drainDescendants(parents)
  }

  /**
   * Enumerate the parent's direct session-backed subagents without loading or
   * resuming an Agent and without any query service.
   * @param parentSessionId - parent session whose direct children are listed.
   * @param signal - caller-owned cancellation forwarded to persistence reads.
   * @returns children and per-child diagnostics ordered by `createdAt`, then id.
   * @throws {@link SubagentError} when the projection registry or the session
   *   store is not mounted, or the caller cancels the listing.
   */
  listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentListEntry[]> {
    return listSubagentChildren(this.ctx, parentSessionId, signal)
  }

  /**
   * Enumerate the root's complete session-backed subagent tree in stable
   * pre-order.
   * @param rootSessionId - session whose complete descendant tree is listed.
   * @param signal - caller-owned cancellation forwarded to persistence reads.
   * @returns children and per-candidate diagnostics with tree position.
   * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
   */
  listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]> {
    return listSubagentDescendants(this.ctx, rootSessionId, signal)
  }

  /**
   * Register a provider under its name. Registration is effect-scoped and HMR
   * safe; removing a provider blocks new starts but does not revoke runs that
   * were already returned to their holders.
   *
   * DELIBERATE DIVERGENCE from the official registry: a same-name re-registration
   * does NOT throw `DUPLICATE_PROVIDER`. Instead it replaces the existing entry
   * (last-write-wins), and the returned disposer performs a CONDITIONAL removal —
   * it only deletes the slot when the slot is still the very record this call
   * registered (compared by token). This keeps hot-recomposition safe: when a
   * reconciling profile layer re-mounts an official provider row into a still-
   * active registry, the newer registration supersedes rather than aborting the
   * whole update, and the older row's disposer cannot later evict the new owner.
   * The `SubagentError` `DUPLICATE_PROVIDER` code itself is retained upstream for
   * compat; only this registration path no longer raises it.
   * @param provider - the trusted provider implementation.
   * @returns the exact Cordis effect disposer.
   */
  registerProvider(provider: SubagentProvider): () => void {
    const name = provider.name
    const token = randomUUID()
    // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
    return this.ctx.effect(function* (this: HarnessSubagentRuntime) {
      this.providers.set(name, { provider, token })
      yield () => {
        // Conditional removal: only evict when this registration still owns the
        // slot. A later same-name registration superseded us, so we must not
        // delete the slot the newer provider now owns.
        const record = this.providers.get(name)
        if (record === undefined || record.token !== token) return
        this.providers.delete(name)
        this.emitLifecycle('subagent/provider-removed', name)
      }
      this.ctx.emit('subagent/provider-added', provider)
    }.bind(this), 'subagents.registerProvider()')
  }

  /**
   * Look up a provider by name.
   * @param name - the provider name.
   * @returns the provider, or undefined when absent.
   */
  getProvider(name: string): SubagentProvider | undefined {
    return this.providers.get(name)?.provider
  }

  /**
   * List registered provider names in insertion order.
   * @returns the registered names.
   */
  list(): string[] {
    return [...this.providers.keys()]
  }

  /**
   * Establish a published child on the named provider. Capability and semantic
   * checks run before delegation.
   * @param name - the provider to use.
   * @param request - child label, prompt, parent, signal, and optional capabilities.
   * @returns the published holder-owned run.
   */
  async start(name: string, request: SubagentStartRequest): Promise<SubagentRun> {
    const provider = this.expectProvider(name)
    this.assertCapabilities(provider, request)
    assertSubagentMaxDepth(request.maxDepth)
    if (request.outputSchema !== undefined) assertObjectJsonSchema(request.outputSchema)
    const descriptor = snapshotSubagentDescriptor({
      mode: 'one-shot',
      provider: name,
      ...request.label !== undefined ? { label: request.label } : {},
    })
    // The tool carries the optional `subagent` id on the runtime request object
    // across the official `ctx.subagents` seam; the harness provider/engine then
    // read it through the harness request type. An absent field (a non-tool
    // caller, or no named subagent) is simply undefined.
    const harnessRequest = request as HarnessSubagentStartRequest
    const resolved: HarnessResolvedSubagentStartRequest = { ...harnessRequest, descriptor }
    return observeRun(this.emitLifecycle, name, request.parent, await provider.start(resolved))
  }

  /**
   * Resolve one provider's detached continuable-creation contribution. Method
   * presence on the provider IS the capability, so a provider without it is
   * rejected before the manager reserves any child resources.
   */
  private async prepareContinuable(
    name: string,
    request: ContinuableCreateRequest,
  ): Promise<ContinuableCreateSpec> {
    const provider = this.expectProvider(name)
    if (provider.prepareContinuable === undefined) {
      throw new SubagentError(
        `subagent provider "${provider.name}" does not support continuable children `
        + '(no prepareContinuable capability)',
        'UNSUPPORTED_CAPABILITY',
      )
    }
    return provider.prepareContinuable(request)
  }

  /** Look up a provider for dispatch or fail loud. */
  private expectProvider(name: string): SubagentProvider {
    const provider = this.providers.get(name)?.provider
    if (provider === undefined) {
      throw new SubagentError(`no subagent provider registered for "${name}"`, 'NO_PROVIDER')
    }
    return provider
  }

  /** Resolve the optional continuable-subagent manager or fail loud. */
  private requireContinuations(): SubagentContinuationManager {
    if (this.continuations === undefined) {
      throw new SubagentError(
        'continuable subagents require the agents service',
        'CONTINUATION_UNAVAILABLE',
      )
    }
    return this.continuations
  }

  /**
   * Build the lifecycle observer for one continuable Activation's residency
   * epoch, so the manager publishes its edges without owning event dispatch.
   */
  private observeActivation(
    provider: string,
    childId: SessionId,
    parent: Agent,
  ): ActivationObserver {
    return createActivationObserver(this.emitLifecycle, provider, childId, parent)
  }

  /** Reject the first requested capability that the provider lacks. */
  private assertCapabilities(provider: SubagentProvider, request: SubagentStartRequest): void {
    const needs: { when: boolean; cap: keyof SubagentCapabilities }[] = [
      { when: request.outputSchema !== undefined, cap: 'outputSchema' },
      { when: request.maxDepth !== undefined, cap: 'depthLimit' },
      { when: request.toolFilter !== undefined, cap: 'toolFilter' },
      { when: request.persona !== undefined, cap: 'persona' },
    ]
    for (const { when, cap } of needs) {
      if (when && !provider.capabilities[cap]) {
        throw new SubagentError(
          `subagent provider "${provider.name}" does not support the "${cap}" capability`,
          'UNSUPPORTED_CAPABILITY',
        )
      }
    }
  }
}

export default HarnessSubagentRuntime
