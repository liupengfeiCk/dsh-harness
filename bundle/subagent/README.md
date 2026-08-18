# `dsh-harness-subagent-bundle`

English | [中文](README.zh.md)

The Harness-owned subagent capability as an installable profile bundle: [`cordis.patch.yml`](cordis.patch.yml) disables the official in-process subagent rows that `dsh-base` ships and mounts the Harness replacement providers plus the user-defined subagent registry and its settings surface. Install it into a profile with `dsh plugin --profile <name> add dsh-harness-subagent-bundle`; removing it restores the official rows. The package is a patch-list carrier and has no runtime API; the profile composer resolves the patch through the `dsh.bundle.patch` manifest field, never through code.

The patch disables five official rows by id — `subagent` (the `ctx.subagents` seam), `subagent-spawn-in-process`, `subagent-fork-in-process`, `tool-subagent`, and `tool-subagent-fork` — and inserts Harness replacements. Because a patch cannot rewrite a row's `name` (the Loader skips a row whose patch names it with a mismatching package) and the Loader rejects duplicate ids, the replacement rows use distinct ids (`subagent-harness`, `subagent-spawn-harness`, `subagent-fork-harness`) while binding the same `ctx.subagents` service and the same `spawn`/`fork` providerName contract, so the preset-plane delegation tools keep working unchanged.

The plane split follows `dsh-web-app`: the subagent registry and its backends stay in the host plane. The Harness delegation tools mount in the host plane under their own tool names (`tool-delegate` → `delegate`, `tool-delegate-fork` → `delegate_fork`, both from `dsh-harness-subagent-bundle/in-process/tool`), coexisting with the official `subagent` tools that the shipped presets mount from `@deepseek-ai/dsh-tool-subagent` — no preset file is ever touched.

This bundle mounts the user-defined subagent registry (`subagent-presets` → `dsh-harness-subagent-bundle/preset`, factory presets ship inside that package) and the General-settings row (`ui-subagent-preset` → `dsh-harness-subagent-bundle`). Those rows need the web layer (`dsh-client-connection` / `dsh-host-apiproxy` for the registry's browser Remote endpoints, and the client settings surface for the UI row), so this bundle is meant for the web profile.

## Install / Uninstall

**Install** (official flow): `dsh plugin --profile <name> add dsh-harness-subagent-bundle` — pnpm resolves this bundle and all its plugin dependencies from the registry; the profile composer picks the patch layer up at the next boot (restart once if the instance is already running). No file edits needed.

**Uninstall** (zero downtime on a running instance):

1. Hot-detach the rows first — append to the profile's user patch layer (`<profile>/cordis.patch.yml`) and save; the running server recomposes within about a second (bundle layers sit below the user layer, so these overrides win):

```yaml
- id: subagent-harness
  disabled: true
- id: subagent-spawn-harness
  disabled: true
- id: subagent-fork-harness
  disabled: true
- id: subagent-presets
  disabled: true
- id: tool-delegate
  disabled: true
- id: tool-delegate-fork
  disabled: true
- id: ui-subagent-preset
  disabled: true
- id: subagent
  disabled: false
- id: subagent-spawn-in-process
  disabled: false
- id: subagent-fork-in-process
  disabled: false
```

2. Then clean the file layer: `dsh plugin --profile <name> remove dsh-harness-subagent-bundle` — official rows are fully restored at the next boot. Never remove the package before detaching the rows: dangling references to uninstalled plugins fail the boot loud.

**Toggle without uninstalling**: keep the package installed and flip only the rows — the disable-list above is OFF; deleting it from the user layer is ON. Both directions are hot.

## Model Experience

Indirectly, through the inserted rows: the Harness service, spawn/fork providers, registry, and settings row own their model-facing behavior, and the delegation tools come from the preset plane.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **Web-layer dependency**: this bundle mounts the registry and settings rows that require `dsh-client-connection` / `dsh-host-apiproxy` and the client settings surface, so it is intended for the web profile; installing it into a headless or custom profile fails loud on the missing web rows.
- **Distinct replacement ids**: the Loader rejects duplicate ids and a patch cannot rewrite `name`, so the replacement rows use `subagent-harness` / `subagent-spawn-harness` / `subagent-fork-harness` instead of the official ids. A later patch layer targeting the official `subagent` id configures the disabled official row, not the Harness replacement.
