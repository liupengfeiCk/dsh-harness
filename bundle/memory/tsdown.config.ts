import { clientBundle } from '../../client/tsdown.client.ts'

/**
 * dsh-harness-memory-bundle is a HOST + CLIENT package: the node half (the
 * `tasks` service, the `/memory-task` + `/memory` wires, the `create_task`
 * tool, the memory engine host row, and the T15 settings namespace — emitted on
 * the Host pass where the Loader imports it as host rows) and the browser half
 * (the "记忆" settings section under `src/ui`, emitted as the single-entry
 * `lib/client.js` on the Client pass).
 *
 * `hostPhase: true` keeps the node artifacts on the Host pass (the host
 * profile mounts them), while the Client pass emits only the browser bundle.
 * A single self-contained client entry avoids an unstable hashed shared chunk
 * (a hashed chunk would sit outside the published `files` allowlist and break
 * the installed profile at runtime). Subpath exports (`./tasks`, `./tasks/wire`,
 * `./tasks/tool`, `./wire`, `./config`) resolve the tsc-emitted
 * `lib/types/*.js` directly, exactly as the subagent and model-plan bundles do.
 *
 * The vendored memory engine is inlined into the node library. The vendored
 * code references the CommonJS globals `__dirname`/`__filename`/`require`,
 * which do not exist in an ES module scope, so the emitted library carries an
 * intro that rebinds them from `import.meta` (Node ≥20.11) — threaded through
 * the lib override below.
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

export default clientBundle(
  'dsh-harness-memory-bundle',
  ['lib/types/index.js'],
  {
    hostPhase: true,
    clientDir: 'ui',
    lib: {
      outputOptions: {
        intro: NODE_CJS_SHIM,
      },
    },
  },
)
