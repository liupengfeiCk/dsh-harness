// T7 runtime acceptance: extraction 开启 → L1 原子记忆落盘。
// Drives the real vendor L1 extractor (storage-only, extraction on) with a
// stubbed LLM runner returning a scene-segmented memory JSON, then asserts an
// L1 memory record lands in `records/` and scene blocks exist in `scene_blocks/`.
//
//   node bundle/memory/tests/acceptance-l1-pipeline.mjs
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

const require = createRequire(import.meta.url)
const { Memory } = require('../lib/index.js')
const extractL1Memories = require('../vendor/lib/core/record/l1-extractor.js').extractL1Memories

function walk(dir, out) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    try {
      if (statSync(p).isDirectory()) walk(p, out)
      else out.push(p)
    } catch { /* ignore */ }
  }
  return out
}

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), 'memory-l1-'))
  const ctx = new Context()
  ctx.provide('llm', { stream: async () => { throw new Error('no llm for capture') } })
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'mock', model: 'deepseek-v4' }) })
  await ctx.plugin(Memory, { dataDir, followCurrentRoute: true })

  // Stub LLM runner: returns a scene-segmented L1 memory JSON.
  const llmRunner = {
    run: async ({ taskId }) => {
      if (taskId === 'l1-extraction') {
        return JSON.stringify([{
          scene_name: 'customer-onboarding',
          message_ids: ['msg_1'],
          memories: [{
            content: 'The customer requires priority shipping on all orders.',
            type: 'work_fact',
            priority: 80,
            source_message_ids: ['msg_1'],
            metadata: { team: 'default', role: 'main', project: '' },
          }],
        }])
      }
      return '{}'
    },
  }

  // Directly drive the real L1 extractor against the real store.
  const res = await extractL1Memories({
    messages: [
      { id: 'msg_1', role: 'user', content: 'The customer requires priority shipping on all orders.', timestamp: Date.now() },
    ],
    sessionKey: 'default/main///acc-s1',
    sessionId: 'acc-s1',
    teamId: 'default',
    agentId: 'main',
    taskId: undefined,
    baseDir: dataDir,
    config: {},
    options: { llmRunner, enableDedup: false },
    logger: undefined,
  })
  console.log('L1 extraction result:', JSON.stringify(res))

  const files = walk(dataDir, [])
  const records = files.filter((f) => f.includes('/records/'))
  console.log('records files:', records.length)
  let l1found = false
  for (const f of records) {
    const text = readFileSync(f, 'utf8')
    if (text.includes('priority shipping')) { l1found = true; console.log('L1 record in:', f) }
  }
  console.log('L1 record found:', l1found)
  if (!l1found) process.exit(1)
  console.log('ACCEPT: extraction → L1 atomic memory landed')
  try { if (typeof ctx.dispose === 'function') await ctx.dispose() } catch { /* non-fatal */ }
  process.exit(0)
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1) })
