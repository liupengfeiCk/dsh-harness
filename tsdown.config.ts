import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  'dsh-harness-agent-preset-editing-bundle',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true, clientDir: 'ui' },
)
