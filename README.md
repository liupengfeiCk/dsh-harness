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

## Teams (编制表)

A **team** is a user-built roster of roles: each role binds to a subagent (a user-defined subagent id) and carries its own prompt. The subagent is the hard capability boundary (from the subagent's plugin tree); the prompt is the soft behaviour guide (the role's own, injected as the child's persona). Teams live under their own dual roots, fully separate from both the agent-preset roster and the subagent roster: `config/teams/` (read-only, `system` trust) + `$DSH_HOME/.dsh/teams` (`user` trust).

A team is `<root>/<teamId>/team.yml`:

```yaml
metadata:
  name: Editing team
  description: Handles copy.
  enabled: true
roles:
  - id: copywriter
    description: Writes copy.
    prompt: You are a senior copywriter.
    subagent: writer      # subagent id (capability boundary)
    memory: persistent    # persistent | one-shot
  - id: factchecker
    description: Verifies facts.
    prompt: You are a rigorous fact-checker.
    subagent: reviewer
    memory: one-shot
```

**Two memory modes**:
- `one-shot`: every call starts a fresh child; the role dissolves after the task.
- `persistent`: the role keeps a durable continuable child; the descriptor persists `{ team, role }` and a cold resume **re-resolves the team's latest definition** (reference semantics — if the team file was edited, the resumed role uses the new version) to re-inject its subagent tree and prompt persona.

**Composition convention**: in team form the main agent sees ONLY the team's role catalogue (the `role` parameter of the `team_delegate` tool) — never the bare subagent roster. This is a composition-layer convention, not hidden logic: a team-shaped deployment mounts the `team-delegate` row and simply does not mount the `delegate`/`subagent` rows, so the bare subagent catalogue never reaches the model. The `team-delegate` tool row ships in `cordis.patch.yml` disabled by default (`disabled: true`) and is enabled in a preset composition.

## Model Experience

Indirectly, through the inserted rows: the Harness service, spawn/fork providers, registry, and settings row own their model-facing behavior, and the delegation tools come from the preset plane.

#### KV Cache effect

None directly; each inserted row's package owns its effect.

## Known Limitations and Deferred Work

- **Web-layer dependency**: this bundle mounts the registry and settings rows that require `dsh-client-connection` / `dsh-host-apiproxy` and the client settings surface, so it is intended for the web profile; installing it into a headless or custom profile fails loud on the missing web rows.
- **Distinct replacement ids**: the Loader rejects duplicate ids and a patch cannot rewrite `name`, so the replacement rows use `subagent-harness` / `subagent-spawn-harness` / `subagent-fork-harness` instead of the official ids. A later patch layer targeting the official `subagent` id configures the disabled official row, not the Harness replacement.
- **Prompt persona vs subagent persona scope conflict**: `dsh-system-prompt` throws when a section is registered twice with the same name in the SAME scope (a different scope shadows). The team tool injects the role prompt as `deployment:persona` (order 0); a subagent whose own composition also carries a persona section would collide with the role prompt in the same child scope and throw. A team subagent should therefore bound capability only and carry no persona of its own; if a subagent genuinely needs its own persona, inject the role prompt under a distinct section name (e.g. `team:role`, order 1) instead — not built in for phase one, extensible later.
- **No team UI in phase one**: team assets are persisted fixed assets (`team.yml` hand-authored); the management UI is deferred.
