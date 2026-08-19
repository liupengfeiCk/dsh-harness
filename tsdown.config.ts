import { buildFace, clientLibraryConfig } from '../../client/tsdown.client.ts'

/**
 * dsh-harness-model-plan-bundle is a pure HOST package — it has no browser
 * client half. Its node library is emitted on the Host pass (where the Loader
 * imports it as a host row); the Client pass carries nothing for it.
 */
export default (({ env }) => {
  const face = buildFace(env?.DSH_BUILD_FACE)
  if (face === 'client') return [{ entry: '' }]
  // One host entry, like dsh-harness-hot-bundle: the Loader imports the
  // package's main export (the `modelPlans` service + merge + wire rows), so
  // a single self-contained entry avoids an unstable hashed shared chunk (a
  // hashed chunk would sit outside the published `files` allowlist and break
  // the installed profile at runtime). Subpath exports (`./wire`, `./merge`,
  // `./selection`) resolve the tsc-emitted `lib/types/*.js` directly, exactly
  // as the subagent and hot bundles do.
  return [clientLibraryConfig('dsh-harness-model-plan-bundle', ['lib/types/index.js'])]
})
