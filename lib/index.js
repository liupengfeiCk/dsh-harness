import { t as PiAiAdapter } from "./adapter-DPDbVxSC.js";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { INVALID_CREDENTIAL_CODE, LlmError, RetryPolicySchema, assertUsableApiKey, attributionHeaders, normalizeApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { deepEqualJson, installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { createProvider } from "@earendil-works/pi-ai";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { builtinProviders, getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
//#region lib/types/catalog.js
/**
* Materialization of one provider route's model catalog. The installed pi-ai
* catalog supplies defaults keyed by model id, and a profile's own model
* entries override them field by field, so a route naming a catalog provider
* stays configuration-free while a route pi-ai has never heard of is fully
* describable from `settings.yaml`.
*
* Every pi-ai `Model` field the harness cannot default is required here rather
* than at request time: an unserviceable route fails while its configuration is
* being resolved, which is the earliest point that can name the offending key.
*
* @module dsh-llm-pi-ai/catalog
*/
/**
* Pricing for a model the installed catalog does not describe. The harness
* never reads pi-ai's cost metadata — `replay.ts` zeroes it and no consumer
* reports spend — so this is the absence of a fact, not a configurable rate.
*/
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
/** Every request modality a profile may declare. */
const MODALITIES = Object.keys({
	text: true,
	image: true
});
/**
* One entry's modality list, or `undefined` when it states no answer. Absent
* and empty mean the same thing — `[]` describes a model that accepts nothing
* and could serve no request — which is what makes an entry naming a catalog
* model without declaring modalities keep the catalog's, since the config
* schema materializes `[]` for an absent array.
* @param configured - the list a `models` or `modelOverrides` entry supplied.
* @returns the declared modalities, or `undefined` to ask the next level.
*/
function declaredInput(configured) {
	return configured === void 0 || configured.length === 0 ? void 0 : [...configured];
}
/** Every pi-ai thinking level a profile may declare, in escalation order. */
const THINKING_LEVELS = Object.keys({
	off: true,
	minimal: true,
	low: true,
	medium: true,
	high: true,
	xhigh: true,
	max: true
});
/** Reasoning-dispatch wire formats a profile may name, most-reached first. */
const SUPPORTED_THINKING_FORMATS = Object.keys({
	"openai": true,
	"deepseek": true,
	"openrouter": true,
	"together": true,
	"zai": true,
	"qwen": true,
	"string-thinking": true,
	"ant-ling": true
});
let providerIndex;
/**
* Installed catalog providers by id, constructed once. Each entry owns the API
* implementations for its own models, which is why a catalog route reuses this
* provider instead of being rebuilt from parts.
* @returns the catalog provider index.
*/
function catalogProviders() {
	providerIndex ??= new Map(builtinProviders().map((provider) => [provider.id, provider]));
	return providerIndex;
}
/**
* The installed catalog provider for one route, when pi-ai ships one.
* @param provider - provider route key.
* @returns the catalog provider, or `undefined` for a route pi-ai does not ship.
*/
function catalogProvider(provider) {
	return catalogProviders().get(provider);
}
/**
* Every provider route the installed pi-ai catalog ships.
* @returns the catalog provider ids.
*/
function catalogProviderIds() {
	return getBuiltinProviders();
}
/**
* Whether the installed catalog provider for one route declares an api-key
* method — the only authentication this adapter obtains on its own.
*
* A key is what the harness resolves through its own credential seam and hands
* pi-ai per request. pi-ai's other method, OAuth, resolves from a *stored*
* OAuth credential alone: `resolveProviderAuth` has no ambient path for it,
* this adapter builds its `Models` collection with no credential store, and
* nothing here runs a login flow. So a provider offering OAuth by itself
* leaves nothing for this adapter to authenticate with, and the posture such a
* provider invites — no key configured, credentials discovered by the provider
* — fails every request with `Provider is not configured`.
* @param provider - provider route key.
* @returns whether the catalog provider takes an api key; false for a route
*   pi-ai does not ship, which the caller answers for separately.
*/
function catalogProviderTakesApiKey(provider) {
	return catalogProvider(provider)?.auth.apiKey !== void 0;
}
/**
* The installed catalog models for one route, indexed by model id.
* @param provider - provider route key.
* @returns catalog models by id; empty for a route pi-ai does not ship.
*/
function catalogModels(provider) {
	if (!catalogProviders().has(provider)) return /* @__PURE__ */ new Map();
	const models = getBuiltinModels(provider);
	return new Map(models.map((model) => [model.id, model]));
}
/** Report a route the deployment cannot serve, naming the settings key at fault. */
function invalid(provider, detail) {
	throw new Error(`llm-pi-ai: provider "${provider}" ${detail}`);
}
/**
* The one wire protocol a catalog route's shipped models agree on. This is what
* lets a deployment add a model the installed catalog has not caught up with —
* a provider's newest release — without restating the protocol its siblings
* already use. A route whose shipped models disagree (an OpenAI-style catalog
* spanning Responses and Chat Completions) has no such answer, so a model it
* does not describe must name its protocol at the route.
*/
function sharedCatalogApi(defaults) {
	const apis = /* @__PURE__ */ new Set();
	for (const model of defaults.values()) apis.add(model.api);
	return apis.size === 1 ? [...apis][0] : void 0;
}
/**
* Resolve one model's reasoning capability from its declared efforts.
*
* A declared dict translates to pi-ai's `thinkingLevelMap` with every level
* decided explicitly: declared levels carry their wire spelling, undeclared
* levels are pinned to `null` (unsupported). Pinning matters because pi-ai's
* own defaulting is asymmetric — an absent key means "supported" for the five
* base levels but "unsupported" for `xhigh`/`max` — and a profile author
* should not need to know that. A declared `off` with no value is the one
* exception: it stays absent from the map, which pi-ai reads as "supported,
* send nothing" — the correct dispatch where not thinking is the parameter's
* absence — while `off` with a value sends that value.
* @param provider - provider route key, for diagnostics.
* @param entry - the configured model entry.
* @param base - the installed catalog entry of the same id, when one exists.
* @returns the reasoning fields the materialized model carries.
*/
function resolveModelReasoning(provider, entry, base) {
	const efforts = entry.reasoningEfforts;
	if (efforts === void 0) return { reasoning: base?.reasoning ?? false };
	if (efforts === false) return { reasoning: false };
	if (efforts === null || Object.keys(efforts).length === 0) invalid(provider, `model "${entry.id}" has an empty reasoningEfforts; declare the offered levels, set false for a non-reasoning model, or omit the field to keep the installed catalog's capability`);
	const declared = THINKING_LEVELS.flatMap((level) => {
		const wire = efforts[level];
		return wire === void 0 ? [] : [[level, wire]];
	});
	for (const [level, wire] of declared) if (wire === null) {
		if (level !== "off") invalid(provider, `model "${entry.id}" reasoningEfforts.${level} needs the wire value dispatch should send; only "off" may leave it empty`);
	} else if (wire.length === 0) invalid(provider, `model "${entry.id}" reasoningEfforts.${level} must not be an empty string`);
	if (!declared.some(([level]) => level !== "off")) invalid(provider, `model "${entry.id}" reasoningEfforts offers no level beyond "off"; declare a thinking level, or set reasoningEfforts to false for a non-reasoning model`);
	const map = {};
	for (const level of THINKING_LEVELS) {
		const wire = efforts[level];
		if (wire === void 0) map[level] = null;
		else if (wire !== null) map[level] = wire;
	}
	return {
		reasoning: true,
		thinkingLevelMap: map
	};
}
/**
* Resolve one model's compat block from the profile's reasoning switches.
*
* A model switch wins over the route switch; whatever neither sets keeps the
* installed entry's value, and a field no layer decides falls through to
* pi-ai's baseURL-derived detection. Only an `openai-completions` model takes
* the switches at all: a model-level switch on any other protocol fails
* resolution, while a route-level default skips past such models — the same
* posture as the route-level `reasoning` default, which also must not fail
* models it does not fit.
* @param provider - provider route key, for diagnostics.
* @param entry - the configured model entry.
* @param route - the route-level switches, when any.
* @param base - the installed catalog entry of the same id, when one exists.
* @param api - the model's resolved wire protocol.
* @returns a `compat` field to spread into the model, or nothing.
*/
function resolveModelCompat(provider, entry, route, base, api) {
	const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;
	const supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;
	if (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};
	if (api !== "openai-completions") {
		if (entry.compat?.thinkingFormat !== void 0 || entry.compat?.supportsReasoningEffort !== void 0) invalid(provider, `model "${entry.id}" sets compat reasoning switches, but its api is "${api}"; thinkingFormat and supportsReasoningEffort exist only on openai-completions`);
		return {};
	}
	return { compat: {
		...base?.api === api ? base.compat : void 0,
		...thinkingFormat === void 0 ? {} : { thinkingFormat },
		...supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }
	} };
}
/**
* Materialize one route's catalog by merging the installed catalog defaults
* under the configured entries. A route with no configured `models` serves the
* installed catalog unchanged, which is what keeps an existing
* `providers: { deepseek: { apiKeyEnv: … } }` profile working untouched.
* @param request - the route-level catalog facts.
* @returns the materialized models and the explicitly configured request caps.
*/
function resolveRouteModels(request) {
	const { provider } = request;
	const defaults = catalogModels(provider);
	const providerBaseUrl = catalogProvider(provider)?.baseUrl;
	const configured = request.models ?? [];
	const overrides = request.modelOverrides ?? {};
	for (const [id, override] of Object.entries(overrides)) {
		if (id.length === 0) invalid(provider, "has a modelOverrides entry with an empty model id");
		if (defaults.size === 0) invalid(provider, `sets modelOverrides for "${id}", but the installed catalog does not describe this route; a declared route spells every model out in its models list`);
		if (configured.length > 0) invalid(provider, `sets modelOverrides for "${id}" beside a models list; models already replaces the served catalog, so declare the fields on its entries`);
		if (!defaults.has(id)) invalid(provider, `modelOverrides names "${id}", which the installed catalog does not describe`);
		if ("id" in override) invalid(provider, `modelOverrides entry "${id}" sets "id", which is the dict key`);
	}
	const entries = configured.length > 0 ? configured : [...defaults.values()].map((model) => ({
		id: model.id,
		...overrides[model.id]
	}));
	if (entries.length === 0) invalid(provider, "resolves no models; the installed catalog does not describe this route, so its models must be listed in configuration");
	const routeApi = sharedCatalogApi(defaults);
	const routeCompatDefined = request.compat?.thinkingFormat !== void 0 || request.compat?.supportsReasoningEffort !== void 0;
	const seen = /* @__PURE__ */ new Set();
	const configuredMaxTokens = /* @__PURE__ */ new Map();
	const models = entries.map((entry) => {
		if (entry.id.length === 0) invalid(provider, "has a model with an empty id");
		if (seen.has(entry.id)) invalid(provider, `lists model "${entry.id}" more than once`);
		seen.add(entry.id);
		const base = defaults.get(entry.id);
		const api = request.api ?? base?.api ?? routeApi;
		if (api === void 0) invalid(provider, `model "${entry.id}" needs an api; the installed catalog does not describe it, so set the route's api to the wire protocol its endpoint speaks`);
		const baseUrl = request.baseURL ?? base?.baseUrl ?? providerBaseUrl;
		if (baseUrl === void 0) invalid(provider, `model "${entry.id}" needs a baseURL; the installed catalog does not describe this route`);
		const contextWindow = entry.contextWindow ?? base?.contextWindow ?? request.defaultContextWindow;
		if (!Number.isInteger(contextWindow) || contextWindow <= 0) invalid(provider, `model "${entry.id}" contextWindow must be a positive integer`);
		const maxTokens = entry.maxTokens ?? base?.maxTokens ?? request.defaultMaxTokens;
		if (!Number.isInteger(maxTokens) || maxTokens <= 0) invalid(provider, `model "${entry.id}" maxTokens must be a positive integer`);
		if (entry.maxTokens !== void 0) configuredMaxTokens.set(entry.id, entry.maxTokens);
		return {
			...base,
			id: entry.id,
			name: entry.name ?? base?.name ?? entry.id,
			api,
			provider,
			baseUrl,
			input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput],
			cost: base?.cost ?? NO_COST,
			contextWindow,
			maxTokens,
			...resolveModelReasoning(provider, entry, base),
			...resolveModelCompat(provider, entry, request.compat, base, api)
		};
	});
	if (routeCompatDefined && !models.some((model) => model.api === "openai-completions")) invalid(provider, "sets compat reasoning switches, but no model on the route speaks openai-completions; thinkingFormat and supportsReasoningEffort exist only on that protocol");
	return {
		models,
		configuredMaxTokens
	};
}
//#endregion
//#region lib/types/provider.js
/**
* Construction of the pi-ai `Provider` that one configured route registers into
* the adapter's `Models` collection.
*
* Two constructions, one decision: a route the installed catalog ships, whose
* profile does not override the wire protocol, **reuses that catalog provider**
* with its models replaced — the catalog provider owns API implementations this
* package cannot reconstruct (Bedrock loads its Smithy module through a
* separate entry point), so rebuilding it from parts would silently narrow
* which providers work. Every other route — one pi-ai has never heard of, or a
* catalog route pointed at a different protocol — is built by `createProvider`
* over the protocol table below.
*
* Credentials never reach this module's storage: the harness resolves a route's
* key through `ctx.credentials` before the request enters pi-ai and hands it
* over as a stream option, which `Models` presents to `resolve()` as the
* credential key.
*
* @module dsh-llm-pi-ai/provider
*/
/**
* Wire protocols a configured route may name, mapped to pi-ai's lazily loaded
* implementations. Each entry is the factory that pi-ai's matching provider
* factory uses, so a hand-declared route reaches exactly the implementation a
* catalog route would.
*
* The table is deliberately narrow: the protocols a hand-declared route
* actually reaches for today, each completely describable with a key, an
* endpoint, and headers. Bedrock signs with SigV4 over AWS credentials and a
* region, Vertex needs a project, a location, and application-default
* credentials, Azure needs provider environment plus an api-version, and Codex
* authenticates through OAuth — none of which this configuration shape can
* express, so offering them would hand back a provider that cannot
* authenticate. The remainder are absent for want of a consumer rather than a
* blocker: each is one line here once a deployment needs it. Catalog routes
* still reach every protocol through their own provider; only an explicit
* override is refused.
*/
const PROTOCOLS = {
	"openai-completions": openAICompletionsApi,
	"openai-responses": openAIResponsesApi,
	"anthropic-messages": anthropicMessagesApi
};
/**
* Every wire protocol a configured route may name, most-reached first. The
* order is the table's and therefore stable; a configuration surface offering
* a choice presents the first as its default, which is why the protocol a
* hand-declared gateway most often speaks — and the one endpoint interrogation
* can read — leads.
* @returns the supported protocol identifiers.
*/
function supportedProtocols() {
	return Object.keys(PROTOCOLS);
}
/**
* Api-key auth for a route the harness authenticates itself. `Models` calls
* this after the adapter has already resolved the route's credential, so a
* missing key here is not this layer's failure: a named-but-unresolvable
* reference has already failed the request with `MISSING_CREDENTIAL`, and a
* route naming no credential at all is deliberately unauthenticated. Reporting
* it as configured hands the decision to the protocol, which is where the
* requirement actually lives — pi-ai's OpenAI-compatible implementation, for
* one, still insists on a key or an `Authorization` header of its own.
* @param name - display name used as the resolution's status label.
* @returns the api-key auth for a harness-authenticated route.
*/
function harnessApiKeyAuth(name) {
	return {
		name,
		resolve: ({ credential }) => Promise.resolve({
			auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
			source: name
		})
	};
}
/**
* The auth one route resolves its credential through.
*
* A catalog route keeps the installed provider's own auth, which is what
* preserves provider-native ambient discovery for a profile naming no
* credential. That holds even when the profile repoints the protocol: which
* environment a provider reads is a property of the provider, not of the wire
* format its models speak.
*
* The single addition covers a catalog provider that offers no api-key method
* at all. pi-ai resolves a request's `apiKey` override only when the provider
* declares one (`resolveProviderAuth` checks `provider.auth.apiKey` before
* honouring the override), so an OAuth-only provider — `openai-codex` is the
* one the installed catalog ships — would refuse a profile's explicit key with
* `Provider is not configured` before any request went out. Adding the harness
* method beside the provider's own restores that route. A keyless profile adds
* nothing and still reports the honest refusal, because this adapter resolves
* credentials through its own seam and holds no OAuth store to fall back on.
* @param spec - the resolved route facts.
* @param catalog - the installed catalog provider, when pi-ai ships one.
* @returns the auth to construct this route's provider with.
*/
function routeAuth(spec, catalog) {
	if (catalog === void 0) return { apiKey: harnessApiKeyAuth(spec.displayName) };
	if (catalog.auth.apiKey !== void 0 || !spec.namesCredential) return catalog.auth;
	return {
		...catalog.auth,
		apiKey: harnessApiKeyAuth(spec.displayName)
	};
}
/**
* Reuse an installed catalog provider with this route's models and identity.
* Model dispatch stays with the catalog provider, so its API implementations,
* compatibility quirks, and ambient credential discovery are preserved exactly.
* Catalog-owned dynamic refresh is dropped: this route's catalog is the
* settings document, and a background refresh would contradict it.
*/
function reuseCatalogProvider(base, spec) {
	const baseUrl = spec.baseURL ?? base.baseUrl;
	return {
		id: spec.provider,
		name: spec.displayName,
		...baseUrl === void 0 ? {} : { baseUrl },
		auth: routeAuth(spec, base),
		getModels: () => spec.models,
		stream: (model, context, options) => base.stream(model, context, options),
		streamSimple: (model, context, options) => base.streamSimple(model, context, options)
	};
}
/**
* Build the pi-ai provider for one resolved route.
* @param spec - the resolved route facts.
* @returns the provider to register in the adapter's `Models` collection.
* @throws Error when the route names a wire protocol this build cannot serve.
*/
function buildProvider(spec) {
	const catalog = catalogProvider(spec.provider);
	if (catalog !== void 0 && spec.api === void 0) return reuseCatalogProvider(catalog, spec);
	const factory = spec.api === void 0 ? void 0 : PROTOCOLS[spec.api];
	if (factory === void 0) throw new Error(`llm-pi-ai: provider "${spec.provider}" names api "${spec.api}", which this build cannot serve; supported protocols are ${supportedProtocols().join(", ")}`);
	return createProvider({
		id: spec.provider,
		name: spec.displayName,
		...spec.baseURL === void 0 ? {} : { baseUrl: spec.baseURL },
		auth: routeAuth(spec, catalog),
		models: spec.models,
		api: factory()
	});
}
//#endregion
//#region lib/types/config.js
/**
* Configuration schema and provider-profile validation for the pi-ai adapter.
* Profiles are a dict keyed by provider route, so the composition base and a
* user-settings layer merge per provider and the route set is structural.
*
* A route key is not required to name an installed pi-ai provider. When it does,
* that provider's endpoint, protocol, display name, and model catalog are the
* profile's defaults and the profile overrides them field by field; when it does
* not, the profile is the whole provider declaration. Resolution therefore ends
* in a built pi-ai `Provider` per route: everything a request needs is decided
* once, while the configuration key that made a route unserviceable can still be
* named in the failure.
*
* @module dsh-llm-pi-ai/config
*/
/** Default maximum idle interval while an adapter stream read is outstanding. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Context capacity assumed for a model neither configuration nor the catalog sizes. */
const DEFAULT_CONTEXT_WINDOW = 262144;
/** Output capability assumed for a model neither configuration nor the catalog sizes. */
const DEFAULT_MAX_TOKENS = 32768;
/**
* Modalities assumed for a model neither configuration nor the catalog
* declares. Text is the floor every supported protocol certainly carries, so
* this is the absence of a declaration rather than a guess at the endpoint:
* nothing can interrogate a gateway for its modalities, and the two wrong
* answers do not cost the same. Under-claiming refuses the image before it is
* attached, naming the model. Over-claiming admits one the provider then
* rejects mid-turn, after the message is durable, leaving the session
* repeating a request that cannot succeed.
*/
const DEFAULT_INPUT = ["text"];
const thinkingBudgets = z.object({
	minimal: z.number(),
	low: z.number(),
	medium: z.number(),
	high: z.number()
});
const compatProfile = z.object({
	thinkingFormat: z.union(SUPPORTED_THINKING_FORMATS),
	supportsReasoningEffort: z.boolean()
});
/**
* Keys are the offered levels, values their wire spellings. A valueless key
* (`off:`) survives validation because schemastery passes nullable data
* through before any member schema runs — `z.const(null)` only controls the
* error for non-null wrong values and what a configuration UI renders.
* Only resolution decides which levels may leave the value empty, so the
* diagnostic can name the route and model. The assertion narrows
* schemastery's `Dict`, which types every literal key as required; dict
* validation checks only present keys, so the runtime value is a partial record.
*/
const reasoningEfforts = z.dict(z.union([z.string(), z.const(null)]), z.union(THINKING_LEVELS));
/** The fields a `models` entry and a `modelOverrides` value share; only the id's home differs. */
const modelFields = {
	name: z.string(),
	contextWindow: z.number().step(1).min(1),
	maxTokens: z.number().step(1).min(1),
	input: z.array(z.union(MODALITIES)),
	reasoningEfforts: z.union([z.const(false), reasoningEfforts]),
	compat: compatProfile
};
const modelProfile = z.object({
	id: z.string().required(),
	...modelFields
});
/** A {@link modelProfile} whose id lives in the `modelOverrides` dict key. */
const modelOverride = z.object(modelFields);
const profile = z.object({
	apiKeyEnv: z.string().role("credential-ref"),
	displayName: z.string(),
	api: z.union(supportedProtocols()),
	baseURL: z.string(),
	models: z.array(modelProfile),
	modelOverrides: z.dict(modelOverride),
	compat: compatProfile,
	defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
	defaultMaxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS),
	defaultInput: z.array(z.union(MODALITIES)).default([...DEFAULT_INPUT]),
	headers: z.dict(z.string()),
	reasoning: z.union(THINKING_LEVELS),
	thinkingBudgets,
	cacheRetention: z.union([
		"none",
		"short",
		"long"
	]),
	transport: z.union([
		"sse",
		"websocket",
		"websocket-cached",
		"auto"
	]),
	timeoutMs: z.natural(),
	websocketConnectTimeoutMs: z.natural(),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	retryPolicy: RetryPolicySchema
});
/** Runtime schema for {@link Config}. */
const Config = z.object({ providers: z.dict(profile).default({}) });
/**
* Reject a section this adapter could not serve. Registered as the settings
* namespace's validator, so an unserviceable profile is refused where it is
* *written* — `settings.mutate` answers `settings-rejected` with the offending
* route and model named — instead of being stored and then quietly disabling
* every route in the namespace. It stays a validator rather than a schema
* transform because the schema is also the shape a configuration surface
* renders and the value an absent section resolves to; wrapping it would break
* both.
* @param config - the resolved section to check.
* @throws Error naming the route and model that cannot be served.
*/
function assertServiceable(config) {
	resolveProfiles(config.providers);
}
/** Reject removed pre-release profile fields and name their replacements. */
function rejectRemovedFields(provider, source) {
	const legacy = source;
	if ("provider" in legacy) throw new Error(`llm-pi-ai: provider "${provider}" sets "provider", which moved to the providers dict key`);
	if ("maxRetries" in legacy || "maxRetryDelayMs" in legacy) throw new Error(`llm-pi-ai: provider "${provider}" sets maxRetries or maxRetryDelayMs, which were removed; compose agent recovery with dsh-llm-retry`);
}
/**
* Validate profiles and return a detached route-keyed map suitable for
* per-request reads. This is the one explicit resolve step, so an omitted dict
* resolves to the empty (dormant) route set here rather than through a hidden
* fallback, and each route's models and pi-ai provider are materialized once.
* @param providers - configured provider profiles keyed by route.
* @returns validated profiles in configuration order.
*/
function resolveProfiles(providers) {
	if (Array.isArray(providers)) throw new Error("llm-pi-ai: providers is now a dict keyed by provider route, not an array of profiles");
	const entries = Object.entries(providers ?? {});
	const resolved = /* @__PURE__ */ new Map();
	for (const [provider, source] of entries) {
		rejectRemovedFields(provider, source);
		if (provider.length === 0) throw new Error("llm-pi-ai: provider names must be non-empty");
		if (source.baseURL !== void 0 && source.baseURL.length === 0) throw new Error(`llm-pi-ai: provider "${provider}" has an empty baseURL`);
		if (source.displayName !== void 0 && source.displayName.length === 0) throw new Error(`llm-pi-ai: provider "${provider}" has an empty displayName`);
		const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? 3e5;
		if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`llm-pi-ai: provider "${provider}" streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
		const defaultInput = [...source.defaultInput ?? DEFAULT_INPUT];
		if (defaultInput.length === 0) throw new Error(`llm-pi-ai: provider "${provider}" defaultInput must name at least one modality`);
		const displayName = source.displayName ?? provider;
		const catalog = resolveRouteModels({
			provider,
			...source.api === void 0 ? {} : { api: source.api },
			...source.baseURL === void 0 ? {} : { baseURL: source.baseURL },
			...source.models === void 0 ? {} : { models: source.models },
			...source.modelOverrides === void 0 ? {} : { modelOverrides: source.modelOverrides },
			...source.compat === void 0 ? {} : { compat: source.compat },
			defaultInput,
			defaultContextWindow: source.defaultContextWindow ?? 262144,
			defaultMaxTokens: source.defaultMaxTokens ?? 32768
		});
		const { apiKeyEnv, retryPolicy, models: _models, displayName: _displayName, ...rest } = source;
		resolved.set(provider, {
			...rest,
			provider,
			displayName,
			...apiKeyEnv === void 0 ? {} : { apiKeyEnv: credentialRef(apiKeyEnv) },
			streamIdleTimeoutMs,
			retryPolicy: resolveRetryPolicy(retryPolicy, `llm-pi-ai: provider "${provider}" retryPolicy`),
			...rest.headers === void 0 ? {} : { headers: { ...rest.headers } },
			...rest.thinkingBudgets === void 0 ? {} : { thinkingBudgets: { ...rest.thinkingBudgets } },
			configuredMaxTokens: catalog.configuredMaxTokens,
			piProvider: buildProvider({
				provider,
				displayName,
				...source.api === void 0 ? {} : { api: source.api },
				...source.baseURL === void 0 ? {} : { baseURL: source.baseURL },
				models: catalog.models,
				namesCredential: apiKeyEnv !== void 0
			})
		});
	}
	return resolved;
}
//#endregion
//#region lib/types/discovery.js
/**
* Answering "which models can this provider serve?" for the configuration
* surface's "fetch available models" action.
*
* A route the installed pi-ai catalog ships is answered **from that catalog**,
* with no network call at all: pi-ai's registry is the authoritative list for
* its own providers, and it carries the capacities a listing endpoint would
* not disclose. Only a route the catalog does not describe — a gateway, a
* self-hosted server — is interrogated over the wire.
*
* Neither path is a catalog refresh. Nothing here is stored: the request
* carries a draft the user is still editing, and the reply is candidate
* metadata the surface offers for adoption. `settings.yaml` remains the only
* thing that decides what a route serves.
*
* Only OpenAI-compatible protocols are interrogated. Their listing is the one
* shape a gateway, a self-hosted server, and the official endpoints all agree
* on, which is the case this action exists for; every other protocol reports
* that it cannot be interrogated so the surface falls back to hand-entry
* rather than guessing a response shape.
*
* @module dsh-llm-pi-ai/discovery
*/
/**
* Protocols whose model listing this module can read: the two that speak
* OpenAI's `GET /models` shape with bearer auth. Azure is absent despite its
* OpenAI lineage — it authenticates with an `api-key` header and requires an
* `api-version` query — and Codex authenticates through OAuth; guessing at
* either would report an authentication failure as a provider with no models.
* pi-ai's remaining protocols are absent for the same reason.
*/
const LISTABLE_PROTOCOLS = /* @__PURE__ */ new Set(["openai-completions", "openai-responses"]);
/**
* Endpoint replies larger than this are refused. The endpoint is whatever URL
* the user typed, so the ceiling holds on the bytes actually read rather than
* on the length the server claims — the same two-stage shape `dsh-web-fetch`
* uses for its own caller-supplied URLs, except that a truncated model listing
* is not parseable, so overflow rejects instead of truncating.
*/
const MAX_RESPONSE_BYTES = 4194304;
/** A positive integer field of a listing entry, or `undefined` when absent or unusable. */
function capacity(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) return candidate;
}
/** A non-empty string field of a listing entry, or `undefined`. */
function label(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "string" && candidate.length > 0) return candidate;
}
/**
* Join the endpoint base with the listing path. The base is treated as a
* prefix rather than a URL to resolve against, so a deployment path such as
* `https://gateway.example/openai/v1` keeps its segments instead of losing
* them to `URL` resolution.
*/
function listingUrl(baseURL) {
	return `${baseURL.replace(/\/+$/, "")}/models`;
}
/**
* Read a reply body, refusing one that outgrows the ceiling. A declared length
* is checked first so an honest server is turned away without transferring
* anything; the accumulated total is what actually enforces the bound, because
* a server that under-declares (or streams) tells us nothing up front.
*/
async function readBounded(response, url) {
	const oversized = () => new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
	const declared = Number(response.headers.get("content-length") ?? NaN);
	if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw oversized();
	}
	/* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) throw oversized();
			chunks.push(value);
		}
	} finally {
		/* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
		await reader.cancel().catch(() => {});
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(body);
}
/**
* Read one OpenAI-compatible listing reply. Entries without a usable id are
* skipped rather than failing the whole interrogation: a single malformed row
* should not deny the user the rest of a working endpoint's catalog.
*/
function readListing(body) {
	const data = body?.data;
	if (!Array.isArray(data)) throw new LlmError("the endpoint's model listing has no \"data\" array; enter this provider's models by hand", "DISCOVERY_FAILED");
	const models = [];
	for (const raw of data) {
		const entry = raw;
		const id = label(entry?.id);
		if (id === void 0) continue;
		const name = label(entry?.name, entry?.display_name);
		const contextWindow = capacity(entry?.context_window, entry?.context_length);
		const maxTokens = capacity(entry?.max_output_tokens, entry?.max_tokens);
		models.push({
			id,
			...name === void 0 ? {} : { name },
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens }
		});
	}
	return models;
}
/**
* Accept one probe key, or refuse it before the header is built. Without this
* the `fetch` below would throw a ByteString `TypeError` that this function's
* catch reports as `could not reach <url>` — blaming the network for a local,
* deterministic fault.
* @param raw - the key typed into the form or read from storage.
* @returns the trimmed, usable key.
*/
function usableProbeKey(raw) {
	const checked = normalizeApiKey(raw);
	if (checked.ok) return checked.value;
	throw new LlmError(checked.reason === "empty" ? "this provider's API key is blank; enter it on the Models page, or clear it to probe unauthenticated" : "this provider's API key contains characters no HTTP header can carry; paste the raw key only", INVALID_CREDENTIAL_CODE);
}
/**
* Interrogate one draft provider endpoint for the models it advertises.
* @param request - the endpoint, protocol, and one-shot credential to use.
* @param storedApiKey - the credential the named route already stored, asked
*   for only when the draft carries none and only on the path that reaches the
*   network. A configuration surface never holds a stored secret — it edits a
*   redacted descriptor — so without this an already-configured route would be
*   interrogated unauthenticated and answer 401.
* @returns the advertised models in endpoint order.
* @throws LlmError when the protocol has no readable listing, the endpoint
*   refuses or fails the request, or the reply is not a model listing.
*/
async function discoverModels(request, storedApiKey) {
	if (request.provider !== void 0) {
		const installed = catalogModels(request.provider);
		if (installed.size > 0) return [...installed.values()].map((model) => ({
			id: model.id,
			name: model.name,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens
		}));
	}
	if (request.baseURL === void 0 || request.baseURL.length === 0) throw new LlmError(`pi-ai ships no catalog for provider "${request.provider ?? ""}", so its models can only come from its endpoint; set a baseURL, or enter this provider's models by hand`, "DISCOVERY_FAILED");
	const api = request.api ?? "openai-completions";
	if (!LISTABLE_PROTOCOLS.has(api)) throw new LlmError(`pi-ai protocol "${api}" has no model listing this build can read; enter this provider's models by hand`, "DISCOVERY_UNSUPPORTED");
	const url = listingUrl(request.baseURL);
	const supplied = request.apiKey ?? await storedApiKey?.();
	const apiKey = supplied === void 0 ? void 0 : usableProbeKey(supplied);
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				accept: "application/json",
				...apiKey === void 0 ? {} : { authorization: `Bearer ${apiKey}` },
				...attributionHeaders()
			},
			...request.signal === void 0 ? {} : { signal: request.signal }
		});
	} catch (error) {
		if (request.signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		throw new LlmError(`could not reach ${url}`, "DISCOVERY_FAILED", { cause: error });
	}
	if (!response.ok) throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, "DISCOVERY_FAILED");
	let text;
	try {
		text = await readBounded(response, url);
	} catch (error) {
		if (request.signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		throw error;
	}
	let body;
	try {
		body = JSON.parse(text);
	} catch (error) {
		throw new LlmError(`${url} did not answer with JSON`, "DISCOVERY_FAILED", { cause: error });
	}
	return readListing(body);
}
//#endregion
//#region lib/types/index.js
/**
* Generic pi-ai-backed LLM adapter plugin. One plugin instance owns a dict of
* provider routes; a route naming an installed pi-ai provider inherits that
* provider's endpoint, protocol, and model catalog as defaults, and a route
* pi-ai does not ship is declared outright. Profile facts resolve per request
* over the optional `llm-pi-ai` user-settings section and the optional
* credential seam, so a changed key, endpoint, model, or knob reaches the next
* request without a restart; a changed *route set* (or a route's
* registration-captured retry policy) re-registers the same adapter instance
* in place.
*
* ```yaml
* - id: llm
*   name: '@deepseek-ai/dsh-llm-pi-ai'
*   config:
*     providers:
*       # Catalog route: everything but the credential comes from pi-ai.
*       openai:
*         apiKeyEnv: OPENAI_API_KEY
*         retryPolicy:
*           mode: normal
*           maxRetries: 2
*       # Catalog route with the catalog narrowed and one capacity corrected.
*       anthropic:
*         apiKeyEnv: ANTHROPIC_API_KEY
*         models:
*           - id: claude-sonnet-4-5
*             contextWindow: 200000
*       # Hand-declared route: pi-ai ships nothing under this key.
*       acme-gateway:
*         displayName: Acme Gateway
*         apiKeyEnv: ACME_GATEWAY_API_KEY
*         api: openai-completions
*         baseURL: https://gateway.acme.example/v1
*         # Reasoning dialect for a URL pi-ai cannot recognize.
*         compat:
*           thinkingFormat: deepseek
*         models:
*           - id: acme-large
*             name: Acme Large
*             contextWindow: 65536
*             maxTokens: 4096
*           - id: acme-think
*             name: Acme Think
*             contextWindow: 262144
*             maxTokens: 32768
*             # key = selectable level, value = wire spelling; only off may
*             # leave the value empty (supported, send nothing).
*             reasoningEfforts:
*               off:
*               high: high
*               max: ultra
* ```
*
* @module @deepseek-ai/dsh-llm-pi-ai
*/
const name = "llm-pi-ai";
const inject = ["llm"];
const NS = settingsNamespace("llm-pi-ai");
/**
* The registry captures these per route; a change here must re-register.
* Sorted by provider so a settings document that merely reorders its keys is
* not mistaken for a route change.
*/
function registrationFacts(profiles) {
	return [...profiles.entries()].map(([provider, profile]) => ({
		provider,
		displayName: profile.displayName,
		retryPolicy: profile.retryPolicy
	})).sort((left, right) => left.provider.localeCompare(right.provider));
}
/**
* The configurable-provider directory: every installed catalog route this
* adapter can authenticate, plus every route the current profiles declare. A
* hand-declared route has no catalog entry, so without this union it would
* have no settings address and configuration surfaces could neither show nor
* edit it.
*
* The profile half is unconditional, which is what keeps a route already
* stored against a withheld provider editable and deletable rather than
* stranded in the settings document with nothing on the page to remove it.
* @param profiles - the currently resolved provider profiles.
* @returns the directory entries in catalog order, declared routes last.
*/
function directoryEntries(profiles) {
	const catalog = new Set(catalogProviderIds());
	const entries = /* @__PURE__ */ new Map();
	const declare = (provider, displayName) => {
		entries.set(provider, {
			provider,
			displayName,
			settingsNs: NS,
			settingsPath: ["providers", provider],
			declared: !catalog.has(provider)
		});
	};
	for (const provider of catalog) if (catalogProviderTakesApiKey(provider)) declare(provider, provider);
	for (const [provider, profile] of profiles) declare(provider, profile.displayName);
	return [...entries.values()];
}
/** Register one generic pi-ai adapter for all configured provider routes. */
function apply(ctx, config) {
	let current = () => config;
	let lastRaw;
	let memoized;
	/**
	* The resolved profiles for the current configuration, memoized by the raw
	* snapshot's identity — which is also what makes the adapter's own snapshot
	* stable across operations that observe no change.
	*
	* No fallback for an unserviceable snapshot lives here: the section schema
	* resolves the whole profile set, so a write that could not be served is
	* refused where it is written, and the settings seam keeps a namespace's
	* last good value for a stored section that fails. Anything reaching this
	* point has already resolved once.
	*/
	const profiles = () => {
		const raw = current();
		if (raw === lastRaw && memoized !== void 0) return memoized;
		const next = resolveProfiles(raw.providers);
		lastRaw = raw;
		memoized = next;
		return next;
	};
	profiles();
	const resolveApiKey = async (provider, profile) => {
		const ref = profile.apiKeyEnv;
		if (ref === void 0) return void 0;
		const credentials = ctx.get("credentials");
		const hit = credentials !== void 0 ? (await credentials.resolve(ref))?.value : launchEnvironmentOf(ctx).get(ref)?.value;
		if (hit !== void 0 && hit.length > 0) return assertUsableApiKey(hit, "llm-pi-ai", ref);
		throw new LlmError(`llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not set — store ${ref} through the credentials service (the web Models page writes it) or export it, and remove apiKeyEnv only if this provider should authenticate from pi-ai's own environment discovery`, "MISSING_CREDENTIAL");
	};
	const adapter = new PiAiAdapter({
		profiles,
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments"),
		onReplayDegrade: ({ provider, model, reason }) => {
			ctx.logger.warn(`llm-pi-ai: unusable replay state on assistant history for route "${provider}/${model}"; sending that message as provider-neutral content (${reason})`);
		}
	});
	let directory;
	let directoryFacts;
	const ensureDirectory = () => {
		const entries = directoryEntries(profiles());
		if (deepEqualJson(entries, directoryFacts)) return;
		if (directory === void 0) directory = ctx.llm.registerConfigurableProviders(entries);
		else directory.replace(entries);
		directoryFacts = entries;
	};
	ensureDirectory();
	/**
	* The credential a named route already resolves, for an interrogation whose
	* draft carries none. A route being declared for the first time names no
	* profile yet, and a profile that names no credential defers to pi-ai's own
	* discovery, so both answer `undefined` and the endpoint is asked
	* unauthenticated — the same posture a request to that route would take.
	*/
	const storedApiKey = async (provider) => {
		if (provider === void 0) return void 0;
		const profile = profiles().get(provider);
		if (profile === void 0) return void 0;
		return resolveApiKey(provider, profile);
	};
	ctx.llm.registerModelDiscovery(NS, (request) => discoverModels(request, () => storedApiKey(request.provider)));
	let registration;
	let registeredFacts;
	const ensureRegistrationFacts = () => {
		const facts = registrationFacts(profiles());
		if (deepEqualJson(facts, registeredFacts)) return;
		const routes = [...profiles().keys()];
		if (registration === void 0) {
			if (routes.length === 0) {
				registeredFacts = facts;
				return;
			}
			registration = ctx.llm.registerAdapter(routes, adapter);
		} else registration.replace(routes);
		registeredFacts = facts;
	};
	ensureRegistrationFacts();
	installSettingsSection(ctx, NS, Config, config, {
		validate: assertServiceable,
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			try {
				ensureRegistrationFacts();
			} catch (error) {
				ctx.logger.error("llm-pi-ai: keeping the previously registered routes after a refused update");
				ctx.logger.error(error);
			}
			try {
				ensureDirectory();
			} catch (error) {
				ctx.logger.error("llm-pi-ai: keeping the previous configurable-provider directory after a refused update");
				ctx.logger.error(error);
			}
		}
	});
}
//#endregion
export { Config, PiAiAdapter, apply, inject, name, supportedProtocols };
