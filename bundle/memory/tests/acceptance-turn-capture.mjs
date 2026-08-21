// T5 runtime acceptance: 发消息 → turn/end → 引擎 L0 有记录。
// Runs against the harness-compiled bundle (inline vendor) with a temp data dir,
// a stub `llm` service, and a live SessionStore. Asserts an L0 record lands in
// the engine's conversation store for a committed turn.
//
//   node bundle/memory/tests/acceptance-turn-capture.mjs
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'

const require = createRequire(import.meta.url)
const bundle = require('../lib/index.js')
const { Memory } = bundle

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), 'memory-accept-'))
  const ctx = new Context()
  // Stub llm service (memory row injects on it) — storage-only acceptance.
  ctx.provide('llm', {
    stream: async () => { throw new Error('no llm in acceptance') },
  })
  await ctx.plugin(SessionStore)

  // Mount Memory as a storage-only engine (no extraction → no llm needed at runtime).
  await ctx.plugin(Memory, { dataDir, followCurrentRoute: false })
  const memory = ctx.get('memory')
  if (!memory) throw new Error('memory service not mounted')

  // Commit a completed turn exactly as turn-capture does (its wiring — the
  // session/event subscription — is covered by the unit tests). This exercises
  // the real data path: CompletedTurn → TdaiCore.handleTurnCommitted → L0.
  const t0 = Date.now()
  try {
    const res = await memory.onTurnCommitted({
      userText: 'remember the customer wants priority shipping',
      assistantText: 'got it',
      messages: [
        { id: 'msg_1', role: 'user', content: 'remember the customer wants priority shipping', timestamp: t0 + 1 },
        { id: 'msg_2', role: 'assistant', content: 'got it', timestamp: t0 + 2 },
      ],
      sessionKey: 'default/main///acc-s1',
      sessionId: 'acc-s1',
      teamId: 'default',
      agentId: 'main',
      startedAt: t0, // floor: messages with timestamp > t0 are captured
    })
    console.log('onTurnCommitted result:', JSON.stringify(res))
  } catch (err) {
    console.error('onTurnCommitted threw:', err)
    throw err
  }

  await new Promise((r) => setTimeout(r, 2500))

  // Locate the L0 conversation store under the temp data dir.
  const conversations = join(dataDir, 'conversations')
  let files = []
  if (existsSync(conversations)) files = walk(conversations, [])
  console.log('dataDir:', dataDir)
  console.log('conversation files:', files.length)
  let l0found = false
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    if (text.includes('priority shipping')) { l0found = true; console.log('L0 record with message in:', f) }
  }
  console.log('L0 record found:', l0found)
  if (!l0found) process.exit(1)
  console.log('ACCEPT: turn-capture → L0 has a record')
  try { if (typeof ctx.dispose === 'function') await ctx.dispose() } catch { /* non-fatal */ }
  process.exit(0)
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    try {
      if (statSync(p).isDirectory()) walk(p, out)
      else out.push(p)
    } catch { /* ignore */ }
  }
  return out
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1) })
