import { clientBundle } from '../../client/tsdown.client.ts'

/**
 * dsh-harness-model-plan-bundle is a HOST + CLIENT package: the node half
 * (the `modelPlans` service + merge interceptor + `/model-plan` wire rows,
 * emitted on the Host pass where the Loader imports it as a host row) and the
 * browser half (the settings section + the composer model-seat selector, under
 * `src/ui`, emitted as the single-entry `lib/client.js` on the Client pass).
 *
 * `hostPhase: true` keeps the node artifacts on the Host pass (the host
 * profile mounts them), while the Client pass emits only the browser bundle.
 * A single self-contained client entry avoids an unstable hashed shared chunk
 * (a hashed chunk would sit outside the published `files` allowlist and break
 * the installed profile at runtime). Subpath exports (`./wire`, `./merge`,
 * `./selection`) resolve the tsc-emitted `lib/types/*.js` directly, exactly
 * as the subagent and hot bundles do.
 */
export default clientBundle(
  'dsh-harness-model-plan-bundle',
  ['lib/types/index.js'],
  { hostPhase: true, clientDir: 'ui' },
)
