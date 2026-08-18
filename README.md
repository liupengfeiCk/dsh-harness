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
