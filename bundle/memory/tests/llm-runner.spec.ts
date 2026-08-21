/**
 * DshLLMRunner / DshLLMRunnerFactory unit tests.
 *
 * Verifies that `run()` collects the streamed text-delta chunks into the full
 * output, that the request is assembled from the vendor `LLMRunParams`, and
 * that route resolution follows modelRef → modelPlanId → configured default.
 *
 * @module dsh-harness-memory-bundle/tests/llm-runner
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import {
  createDefaultRouteResolver,
  DshLLMRunner,
  DshLLMRunnerFactory,
  parseModelRef,
} from '../src/adapters/llm-runner.ts'
import type { MemoryEngineConfig } from '../src/adapters/config.ts'
import { MockAdapter, textResponse } from './mock-adapter.ts'

/** Mount the llm service on a fresh context and register a mock adapter. */
async function mountLlm(script: (Parameters<typeof textResponse>[0])[]): Promise<{ ctx: Context; adapter: MockAdapter }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

describe('parseModelRef', () => {
  it('splits provider/model', () => {
    expect(parseModelRef('openai/gpt-4o')).toEqual({ provider: 'openai', model: 'gpt-4o' })
  })
  it('returns null for malformed refs', () => {
    expect(parseModelRef('/gpt')).toBeNull()
    expect(parseModelRef('openai/')).toBeNull()
    expect(parseModelRef('/')).toBeNull()
    expect(parseModelRef('nope')).toBeNull()
  })
})

describe('DshLLMRunner.run', () => {
  it('collects streamed text-delta chunks into the full output', async () => {
    const { ctx, adapter } = await mountLlm([textResponse('hello world')])
    const runner = new DshLLMRunner(
      ctx.llm,
      Promise.resolve({ provider: 'mock', model: 'mock-model' }),
    )
    const text = await runner.run({ prompt: 'say hi', taskId: 't' })
    expect(text).toBe('hello world')
    expect(adapter.requests).toHaveLength(1)
  })

  it('assembles the request from LLMRunParams (system + prompt + maxTokens)', async () => {
    const { ctx, adapter } = await mountLlm([textResponse('ok')])
    const runner = new DshLLMRunner(
      ctx.llm,
      Promise.resolve({ provider: 'mock', model: 'mock-model' }),
    )
    await runner.run({
      prompt: 'user prompt',
      systemPrompt: 'sys',
      taskId: 't',
      maxTokens: 200,
    })
    const request = adapter.requests[0]
    expect(request.provider).toBe('mock')
    expect(request.model).toBe('mock-model')
    expect(request.maxTokens).toBe(200)
    const texts = request.messages.map((m) => {
      const block = m.content[0]
      return block?.type === 'text' ? block.text : ''
    })
    expect(texts).toEqual(['sys', 'user prompt'])
  })

  it('propagates an abort signal into the request', async () => {
    const { ctx, adapter } = await mountLlm([textResponse('ok')])
    const runner = new DshLLMRunner(
      ctx.llm,
      Promise.resolve({ provider: 'mock', model: 'mock-model' }),
    )
    const ac = new AbortController()
    await runner.run({ prompt: 'p', taskId: 't', abortSignal: ac.signal })
    expect(adapter.requests[0].signal).toBe(ac.signal)
  })
})

describe('DshLLMRunnerFactory route resolution', () => {
  it('uses an explicit modelRef provider/model', async () => {
    const { ctx } = await mountLlm([textResponse('ok')])
    const factory = new DshLLMRunnerFactory({
      ctx,
      config: {},
      resolveRoute: async ({ modelRef }) => {
        if (modelRef === undefined) return null
        const idx = modelRef.indexOf('/')
        return idx > 0 ? { provider: modelRef.slice(0, idx), model: modelRef.slice(idx + 1) } : null
      },
    })
    const runner = factory.createRunner({ modelRef: 'mock/from-ref' })
    expect(await runner.run({ prompt: 'p', taskId: 't' })).toBe('ok')
  })

  it('resolves a configured modelPlanId through the registry', async () => {
    const { ctx } = await mountLlm([textResponse('ok')])
    const config: MemoryEngineConfig = { modelPlanId: 'plan-a' }
    const factory = new DshLLMRunnerFactory({
      ctx,
      config,
      resolveRoute: async ({ planId }) => {
        if (planId === 'plan-a') return { provider: 'mock', model: 'plan-model' }
        return null
      },
    })
    const runner = factory.createRunner()
    expect(await runner.run({ prompt: 'p', taskId: 't' })).toBe('ok')
  })

  it('throws when no route is resolvable', async () => {
    const { ctx } = await mountLlm([])
    const factory = new DshLLMRunnerFactory({
      ctx,
      config: {},
      resolveRoute: async () => null,
    })
    const runner = factory.createRunner()
    await expect(runner.run({ prompt: 'p', taskId: 't' })).rejects.toThrow(/no LLM route/)
  })
})

describe('createDefaultRouteResolver (T7 跟随当前路由)', () => {
  it('resolves modelRef before the current-route fallback', async () => {
    const ctx = new Context()
    const resolve = createDefaultRouteResolver(ctx, {})
    expect(await resolve({ modelRef: 'openai/gpt-4o' })).toEqual({ provider: 'openai', model: 'gpt-4o' })
  })

  it('resolves a configured modelPlanId before the current-route fallback', async () => {
    const ctx = new Context()
    ctx.provide('modelPlans', {
      resolve: async (id: string) => (id === 'plan-a' ? { provider: 'mock', model: 'plan-model' } : { provider: '', model: '' }),
    })
    const resolve = createDefaultRouteResolver(ctx, {})
    expect(await resolve({ planId: 'plan-a' })).toEqual({ provider: 'mock', model: 'plan-model' })
  })

  it('resolves the configured default llm before the current-route fallback', async () => {
    const ctx = new Context()
    const resolve = createDefaultRouteResolver(ctx, { llm: { provider: 'mock', model: 'pinned' } })
    expect(await resolve({})).toEqual({ provider: 'mock', model: 'pinned' })
  })

  it('follows ctx.agentDefaultModel.currentSelection() when nothing is pinned', async () => {
    const ctx = new Context()
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
    })
    const resolve = createDefaultRouteResolver(ctx, {})
    expect(await resolve({})).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })

  it('returns null when neither a route nor the current selection is resolvable', async () => {
    const ctx = new Context()
    const resolve = createDefaultRouteResolver(ctx, {})
    expect(await resolve({})).toBeNull()
  })
})
