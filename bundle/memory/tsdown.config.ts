import { buildFace, clientLibraryConfig } from '../../client/tsdown.client.ts'

/**
 * dsh-harness-memory-bundle is a pure HOST package — it has no browser client
 * half. Its node library is emitted on the Host pass (where the Loader imports
 * it as host rows for the `tasks` service, the `/memory-task` wire, the
 * `create_task` tool, and — once T3 lands — the `memory` engine host row); the
 * Client pass carries nothing for it.
 */
export default (({ env }) => {
  const face = buildFace(env?.DSH_BUILD_FACE)
  if (face === 'client') return [{ entry: '' }]
  return [clientLibraryConfig('dsh-harness-memory-bundle', ['lib/types/index.js'])]
})
