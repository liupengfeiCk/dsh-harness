/**
 * MemoryHostAdapter unit tests.
 *
 * Verifies the data dir resolution (config override, else `~/.dsh/memory`),
 * the logger adaptation to the vendor `Logger` contract, and the exposed
 * LLM runner factory.
 *
 * @module dsh-harness-memory-bundle/tests/host-adapter
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { join } from 'node:path'
import { DSH_HOME_ENV } from '../src/home-path.ts'
import { MemoryHostAdapter, adaptLogger } from '../src/adapters/host-adapter.ts'
import { DshLLMRunnerFactory } from '../src/adapters/llm-runner.ts'
import { MockAdapter, textResponse } from './mock-adapter.ts'

/** A context with the llm service mounted and one mock adapter registered. */
async function mountCtx(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('ok')]))
  return ctx
}

describe('MemoryHostAdapter dataDir', () => {
  it('defaults to ~/.dsh/memory under DSH_HOME', async () => {
    const prev = process.env[DSH_HOME_ENV]
    process.env[DSH_HOME_ENV] = '/tmp/dsh-memory-test-home'
    try {
      const ctx = await mountCtx()
      const adapter = new MemoryHostAdapter({ ctx, config: {} })
      expect(adapter.getRuntimeContext().dataDir).toBe(join('/tmp/dsh-memory-test-home', 'memory'))
    } finally {
      if (prev === undefined) delete process.env[DSH_HOME_ENV]
      else process.env[DSH_HOME_ENV] = prev
    }
  })

  it('honours an explicit dataDir override', async () => {
    const ctx = await mountCtx()
    const adapter = new MemoryHostAdapter({ ctx, config: { dataDir: '/tmp/custom-memory' } })
    expect(adapter.getRuntimeContext().dataDir).toBe('/tmp/custom-memory')
  })
})

describe('MemoryHostAdapter logger', () => {
  it('adapts ctx.logger to the vendor Logger contract', async () => {
    const ctx = await mountCtx()
    const adapter = new MemoryHostAdapter({ ctx, config: { dataDir: '/tmp/x' } })
    const logger = adapter.getLogger()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('adaptLogger forwards messages without throwing', () => {
    const received: string[] = []
    const logger = adaptLogger({
      info: (m) => received.push(`info:${m}`),
      warn: (m) => received.push(`warn:${m}`),
      error: (m) => received.push(`error:${m}`),
    })
    logger.info('a')
    logger.warn('b')
    logger.error('c')
    expect(received).toEqual(['info:a', 'warn:b', 'error:c'])
  })
})

describe('MemoryHostAdapter runner factory', () => {
  it('exposes an LLMRunnerFactory that runs via ctx.llm', async () => {
    const ctx = await mountCtx()
    const adapter = new MemoryHostAdapter({
      ctx,
      config: { dataDir: '/tmp/x', llm: { provider: 'mock', model: 'mock-model' } },
    })
    const factory = adapter.getLLMRunnerFactory()
    expect(factory).toBeInstanceOf(DshLLMRunnerFactory)
    const runner = factory.createRunner()
    expect(await runner.run({ prompt: 'p', taskId: 't' })).toBe('ok')
  })
})
