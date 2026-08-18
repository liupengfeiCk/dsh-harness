# `dsh-harness-agent-preset-editing-bundle`

English | [中文](README.zh.md)

The Harness-owned main-preset visual-editing capability as an installable profile bundle: [`cordis.patch.yml`](cordis.patch.yml) disables the official `ui-agent-preset` settings row that `dsh-web-app` ships and mounts the enhanced surface — the official main-preset surfaces plus a structured editor over a locally authored preset's editable fields — together with the dedicated `/agent-preset-edit` editing wire channel. Install it into a profile with `dsh plugin --profile <name> add dsh-harness-agent-preset-editing-bundle`; removing it restores the official row. The package is a patch-list carrier and has no runtime API; the profile composer resolves the patch through the `dsh.bundle.patch` manifest field, never through code.

The patch disables one official row by id — `ui-agent-preset` (the main-preset row in General settings) — and inserts two rows. Because a patch cannot rewrite a row's `name` (the Loader skips a row whose patch names it with a mismatching package) and the Loader rejects duplicate ids, the replacement rows use distinct ids (`ui-agent-preset-editing`, `agent-preset-edit`) while binding the same settings seat. The disabled official row keeps the official package installed and leaves a later profile layer free to re-enable it.

The plane split follows `dsh-web-app`: the editing wire (`agent-preset-edit` → `dsh-harness-agent-preset-editing-bundle/edit/wire`) is a HOST row that rides alongside the `agentPresets` service (mounted by `dsh-web-app`) it reads through the service's public interface, kept separate so the official service package stays zero-invasive; the enhanced surface (`ui-agent-preset-editing` → `dsh-harness-agent-preset-editing-bundle`) is a browser settings row that talks to the wire channel. Both rows need the web layer (`dsh-client-connection` for the wire's RPC channel, and the client settings surface for the UI row), so this bundle is meant for the web profile.

## Install / Uninstall

**Install** (official flow): `dsh plugin --profile <name> add dsh-harness-agent-preset-editing-bundle` — pnpm resolves this bundle and all its plugin dependencies from the registry; the profile composer picks the patch layer up at the next boot (restart once if the instance is already running). No file edits needed.

**Uninstall** (zero downtime on a running instance):

1. Hot-detach the rows first — append to the profile's user patch layer (`<profile>/cordis.patch.yml`) and save; the running server recomposes within about a second (bundle layers sit below the user layer, so these overrides win):

```yaml
- id: ui-agent-preset-editing
  disabled: true
- id: agent-preset-edit
  disabled: true
- id: ui-agent-preset
  disabled: false
```

2. Then clean the file layer: `dsh plugin --profile <name> remove dsh-harness-agent-preset-editing-bundle` — the official row is fully restored at the next boot. Never remove the package before detaching the rows: dangling references to uninstalled plugins fail the boot loud.

**Toggle without uninstalling**: keep the package installed and flip only the rows — the disable-list above is OFF; deleting it from the user layer is ON. Both directions are hot.

## Model Experience

Indirectly, through the inserted rows: the enhanced settings row and the editing wire own their model-facing behavior, and the edited preset's mounted plugins own the model-facing effect of any change.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **Web-layer dependency**: this bundle mounts the settings and wire rows that require `dsh-client-connection` and the client settings surface, so it is intended for the web profile; installing it into a headless or custom profile fails loud on the missing web rows.
- **Distinct replacement ids**: the Loader rejects duplicate ids and a patch cannot rewrite `name`, so the replacement rows use `ui-agent-preset-editing` / `agent-preset-edit` instead of the official id. A later patch layer targeting the official `ui-agent-preset` id configures the disabled official row, not the enhanced replacement.
- **Resolution verified by the official chain**: a local-registry rehearsal (pack → publish → `dsh plugin add`) resolved all transitive plugin dependencies and every inserted row came up enabled, because profile-rooted name resolution consults the profile's own `node_modules` first. Keep an eye on this only if the resolution anchor ever moves.
