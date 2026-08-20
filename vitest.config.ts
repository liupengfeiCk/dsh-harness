import { defineConfig } from 'vitest/config'

// Harness-owned tier: self-contained test discovery so `pnpm exec vitest run`
// at this root never walks upward into the enclosing repository checkout.
//
// Resolution deliberately uses vite's default node_modules/exports resolution
// (no tsconfig paths): upstream @deepseek-ai/* packages resolve through their
// package.json exports to the prebuilt `lib` artifacts (root imports) or `src`
// (./src/* subpaths). Routing them to upstream `src` via a tsconfig paths map
// would re-run un-inlined const enums (e.g. cordis FiberState) and double-load
// the module graph — both of which break the harness suite.
const testIncludes = ['bundle/*/tests/**/*.spec.{ts,tsx}']

// Timing-sensitive suites that flake under aggregate parallel contention (the
// upstream repo isolates this same suite in its process-bound pool).
const processBoundTests = ['bundle/subagent/tests/in-process/tool.spec.ts']

export default defineConfig({
  resolve: {
    // The enclosing repo checkout and this workspace each carry a React copy;
    // pin one instance or hooks see a null dispatcher.
    dedupe: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  test: {
    projects: [
      {
        test: {
          name: 'thread-safe',
          include: testIncludes,
          exclude: [
            ...processBoundTests,
            // Browser-half suites: the published `./client` subpath of the
            // upstream packages is a ModuleLoader bundle
            // (`window.__ModuleLoader__.load(...)`), loadable only by the real
            // host page. The upstream repo's lane redirects those imports to
            // package TypeScript source via its tsconfig paths plugin, but the
            // published tarballs ship no `src/`, and a source-routing alias
            // would double-load the module graph (un-inlined const enums),
            // which this workspace deliberately avoids (see header note).
            // These files therefore stay excluded until a browser-grade lane
            // exists; the host halves of the same surfaces are covered by the
            // remaining suites, and the live UI is verified against a running
            // instance.
            'bundle/*/tests/ui/*.client.spec.{ts,tsx}',
          ],
        },
      },
      {
        test: {
          name: 'process-bound',
          pool: 'forks',
          include: processBoundTests,
        },
      },
    ],
  },
})
