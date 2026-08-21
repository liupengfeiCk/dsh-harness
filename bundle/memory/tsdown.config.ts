import { buildFace, clientLibraryConfig } from '../../client/tsdown.client.ts'

/**
 * dsh-harness-memory-bundle is a pure HOST package — it has no browser client
 * half. Its node library is emitted on the Host pass (where the Loader imports
 * it as host rows for the `tasks` service, the `/memory-task` wire, the
 * `create_task` tool, and the `memory` engine host row); the Client pass
 * carries nothing for it.
 *
 * The vendor memory engine is inlined into the library. The vendored code
 * references the CommonJS globals `__dirname`/`__filename`/`require`, which do
 * not exist in an ES module scope, so the emitted library carries an intro that
 * rebinds them from `import.meta` (Node ≥20.11).
 */
// NOTE: unconditional assignment — in ESM scope these globals do not exist, and
// a `typeof X === "undefined" ? X : ...` self-reference would hit the temporal
// dead zone of the very `const X` being declared (ReferenceError at boot).
const NODE_CJS_SHIM =
  'import { createRequire as __cjs_createRequire } from "node:module";' +
  'import { dirname as __cjs_dirname } from "node:path";' +
  'import { fileURLToPath as __cjs_fileURLToPath } from "node:url";' +
  'const __filename = __cjs_fileURLToPath(import.meta.url);' +
  'const __dirname = __cjs_dirname(__filename);' +
  'const require = __cjs_createRequire(import.meta.url);'

export default (({ env }) => {
  const face = buildFace(env?.DSH_BUILD_FACE)
  if (face === 'client') return [{ entry: '' }]
  return [clientLibraryConfig('dsh-harness-memory-bundle', ['lib/types/index.js'], {
    outputOptions: {
      intro: NODE_CJS_SHIM,
    },
  })]
})
