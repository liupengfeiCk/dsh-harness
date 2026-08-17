import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  'dsh-harness-subagent-bundle',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true, clientDir: 'ui' },
)
