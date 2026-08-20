import { defineConfig } from 'tsdown'
// Read-only reference to the upstream typert/tsdown plugin: the harness build
// reuses the same decorator-lowering + typert artifact emission as the main
// repo. Never modify the upstream file.
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

/**
 * The harness workspace build consumes JavaScript emitted by the harness Host
 * TypeScript project and runs Typert. The Client pass selects the two client
 * UI packages whose package-local tsdown configs emit both their Node loader
 * entry and browser artifact.
 *
 * entry stays empty: unlike the main repo, the harness workspace has no root
 * `lib/types/{index,invariant,startup}` package to bundle — only the workspace
 * packages listed below are built.
 */
export default defineConfig(({ env }) => {
  const client = isBuildFaceClient(env?.DSH_BUILD_FACE)
  return {
    workspace: {
      include: ['bundle/*'],
      // Each bundle carries its own package-local tsdown.config.ts (built on
      // the shared tsdown.client.ts preset) that selects its host half and
      // browser half per build face; the two client UI packages and the
      // preset/subagent packages were absorbed into the bundles, so the root
      // workspace no longer walks client/*, preset/*, or subagent/*.
      exclude: [],
    },
    // Host face bundles each package's emitted lib/types entry points
    // (index/invariant/startup — the glob tolerates absent files). The Client
    // face selects the two client UI packages through their package-local
    // tsdown configs, so it carries no host entry here.
    entry: client ? '' : ['lib/types/{index,invariant,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [typertPlugin({ mode: 'workspace', faces: ['host'] })],
  }
})
