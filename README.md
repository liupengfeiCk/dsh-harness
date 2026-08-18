# dsh-harness-hot-bundle

The Harness-owned hot **mount / unmount / upgrade** surface for a running DSH
host, delivered as a self-contained profile bundle.

`dsh plugin add/remove` is pure file I/O — the live process only re-composes on
`cordis.patch.yml` changes. This bundle gives a running host a way to pull an
installed plugin's loader rows into the live composition *without a restart*,
and — the reason it exists — to hot-UPGRADE a same-name same-path plugin by
evicting the Node module cache and re-mounting.

- **Pure host package.** There is no browser client half. The bundle's substance
  is `cordis.patch.yml` (declared by `dsh.bundle.patch`) plus the host
  `harnessHot` service and its loopback-pinned `/harness-hot` RPC channel.
- **`ctx.harnessHot`** — a `Service` subclass exposing `mount`, `unmount`,
  `upgrade`, and `list`.
- **`/harness-hot`** — a loopback-pinned (`authority: 'loopback'`) connection
  RPC channel carrying the same four endpoints. Only a same-machine caller can
  reach it, because mounting/upgrading a plugin rewrites what the running
  composition offers.

## Install

Install it as any profile bundle (git protocol, since the bundle ships `lib`
artifacts in its own repository):

```
dsh plugin --profile <name> add "git+file:///…/harness/bundle/hot"
```

Its `cordis.patch.yml` inserts one host row (`harness-hot`) that mounts the
`harnessHot` service and registers the `/harness-hot` channel.

## The endpoints

All four endpoints go through `/harness-hot` with `authority: 'loopback'`, and
each request/response is zod-validated against `src/wire/schema.ts`.

### `mount { package, profileDir? }`

Reads `<profileDir>/node_modules/<package>/cordis.patch.yml`, parses it with the
include plugin's own `entryListSchema` (so the accepted dialect is exactly what
a boot loads), writes the hot-mountable rows into
`<profileDir>/.harness-hot/hot-<n>.yml`, and mounts an `Include` subtree that
activates them.

- `insert` rows (`id`/`name`/`config`) are pulled in with their `id` prefixed
  `harness-` so they never collide with a bundle-layer id (a duplicate id is a
  hard boot failure).
- `disabled` override rows (`id` + boolean `disabled`) are applied **without** a
  prefix — they target a row that already exists.
- A `config` on an `insert` row must be a static key-value object. A `!!js`
  expression anywhere (in a `config` or a `disabled`), a nested group, or any
  structural key (`inject`/`isolate`/`intercept`) cannot be re-evaluated at hot
  time — the mount refuses with **"restart to activate"**.
- Activation is raced against a 10s ceiling (`DSH_HARNESS_HOT_MOUNT_TIMEOUT_MS`).
  A wedged subtree is disposed best-effort and the error surfaces.

### `unmount { package }`

Disposes the mounted subtree, removing the package's rows from the running
composition immediately.

### `upgrade { package, profileDir? }`

The core reason this bundle exists. It:

1. disposes the package's current hot fiber (if any);
2. evicts every Node `loadCache` record whose URL lives under the package's own
   `<profileDir>/node_modules/<package>/` directory — **only** the package's own
   modules, never its dependencies (pnpm's symlinked layout is realpath'd before
   matching; Node v24's typed `loadCache` is evicted with `Map.prototype.delete`
   so the key is fully removed);
3. re-runs the `mount` flow.

This is the same "dispose → evict cache → re-import" move the official HMR makes
(`vendor/hmr/src/index.ts`), which the official HMR confines to user code behind
a watch-only web profile. This bundle exposes it as a first-class endpoint.

A deployment that does not expose the module-loader internals (no
`--expose-internals`, so `ctx.loader.internal` is undefined) refuses the upgrade
with **"restart to activate"**.

### `list`

Returns the current hot mounts (package, row ids, mount time).

## Fiber-escape boundary (read this)

`upgrade`'s dispose reclaims the **registration structure** — the loader entry,
its fiber, and the service registrations owned by the disposed subtree. It
cannot reclaim service objects a live session has already captured: if a session
holds a reference to `ctx.someService` from the OLD module's instances, that
reference keeps pointing at the old code until the session drops it.

This is exactly the same risk the official HMR carries, and it is documented
rather than pretended away. For the hot-upgrade path this bundle owns, the
practical contract is:

- **New requests** to a mounted package's surface resolve through the freshly
  re-imported module.
- **Already-held service references** in a long-lived session may observe stale
  behaviour until that session is re-created.

If you need a guarantee that every live reference is rebuilt, restart the host.

## Known limitation: failed ESM `exports` subpath resolution is process-cached

`upgrade`'s cache eviction reaches the loader `loadCache` and the CJS
`_pathCache`/`require.cache`. It does **not** reach Node's process-level ESM
package resolution cache.

Node caches a package's parsed `package.json` (including its `exports` map) in
a C++ binding layer (`modulesBinding.readPackageJSON`) keyed by the package.json
path. This cache does not check the file's mtime, and it has no JS-side handle or
public API (verified empirically on Node v24.10.0):

- A subpath that fails `exports` resolution once
  (`ERR_PACKAGE_PATH_NOT_EXPORTED`, e.g. `import './team'` before `exports`
  gains `"./team"`) stays failed for the life of the process, even after:
  - the on-disk `exports` is fixed;
  - the package's `loadCache` records are evicted;
  - `Module._pathCache` and `require.cache` are fully cleared;
  - the same bare-specifier subpath is imported again.
- The cached value is bound to the package.json **path**: a package at a fresh
  path resolves immediately, while the same path keeps returning the stale
  result no matter how the file changes.

Consequence for hot upgrade: if a hot-upgraded package starts relying on a newly
exported subpath that previously failed to resolve in this process, the live
process cannot pick it up — **the only recovery is a host restart**. This is
distinct from the fiber-escape boundary above: that one is about held service
references; this one is about Node's own resolution cache that no `upgrade`
step can evict.

### Does a version bump dodge this cache? No, under `nodeLinker: hoisted`

An obvious workaround is to bump the package version on upgrade so pnpm installs
it to a **new physical path**, which then resolves immediately (the cache is
keyed by the package.json path). Verified empirically (Node v24.10.0, pnpm
v10.27.0): a package at a fresh path imports a newly exported subpath fine.

**But this only works when pnpm lays each version out under its own directory.**
A profile configured with `nodeLinker: hoisted` (this project's web profile)
flattens every git/file dependency onto `node_modules/<name>/` — the same
physical path regardless of the declared version — and keeps no per-version
store directory under `node_modules/.pnpm/`. Bumping the version therefore
**does not change the physical path**, so the process-level `exports` cache
stays hit and a newly added subpath still fails until a host restart.

Empirically confirmed on the harness web profile:
- After bumping the probe from `1.0.0` to `1.1.0` and re-adding it, `node_modules/
  dsh-hotprobe-bundle` stayed the same physical directory and `.pnpm/` still
  held only `lock.yaml` — no per-version directory was created.
- `upgrade` correctly swapped the **existing entry's** code (`/hotprobe/version`
  `v4 → v5`) because `clearPackageLoadCache` evicts the module `loadCache`; this
  does **not** depend on the version number.
- But a **newly added** `exports` subpath (`./version`) on that same path stayed
  `ERR_MODULE_NOT_FOUND` even after the on-disk `exports` was fixed and every
  JS-side cache was cleared — the exact process-cached failure above.

So the version-bump trick only helps on a pnpm **isolated** layout (default,
`nodeLinker` unset or `isolated`), where the store directory derives from the
dependency specifier and a new commit materializes a fresh path. On this
project's `hoisted` profile the version number is not a lever: hot-upgrading a
package that adds a new `exports` subpath still needs a host restart.

## Boot cleanup

When the `harnessHot` service starts it wipes `hot-*.yml` under
`<profileDir>/.harness-hot/`. Hot inputs are purely a process-lifetime thing —
durable activation stays with `dsh.profile.bundles` (reconciled by the CLI at
install time) so the next boot loads the plugin through the normal bundle layer.
A crash can therefore never leave a hot file that collides with the bundle layer
at the next boot.

## Development

- Tests: `npx vitest run bundle/hot/tests` (from `harness/`).
- Typecheck: `pnpm run typecheck` (from `harness/`).
- Build: `pnpm run build` (from `harness/`).

The suite covers patch parsing (plain inserts, static config, disabled
overrides, `!!js` rejection), boot cleanup, and the `loadCache` eviction logic
(against a mocked loadCache incl. the pnpm symlink and Node v24 typed shapes).
