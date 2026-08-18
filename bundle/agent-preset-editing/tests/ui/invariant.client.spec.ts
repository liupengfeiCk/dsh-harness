/** The bundle's node half: a patch-carrier index and an explained empty invariant companion. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as BundleInvariant from '../../src/invariant.ts'

describe('invariant companion', () => {
  it('reserves package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(BundleInvariant).await()).resolves.toBeDefined()
  })

  it('has an empty node half', async () => {
    const mod = await import('../../src/index.ts')

    // The host body exists only so the plugin appears in the host cordis.yml;
    // every surface this bundle ships lives in the browser half.
    expect(mod).toBeDefined()
  })
})
