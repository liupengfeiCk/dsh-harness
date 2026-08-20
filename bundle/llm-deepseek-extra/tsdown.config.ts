import { buildFace, clientLibraryConfig } from '../../client/tsdown.client.ts'

/**
 * dsh-harness-llm-deepseek-extra-bundle is a pure HOST package — it has no
 * browser client half. Its node library is emitted on the Host pass (where the
 * Loader imports it as a host row replacing the disabled official llm-deepseek
 * row); the Client pass carries nothing for it.
 */
export default (({ env }) => {
  const face = buildFace(env?.DSH_BUILD_FACE)
  if (face === 'client') return [{ entry: '' }]
  return [clientLibraryConfig('dsh-harness-llm-deepseek-extra-bundle', ['lib/types/index.js', 'lib/types/invariant.js'])]
})
