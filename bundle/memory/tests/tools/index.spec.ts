/**
 * T10 工具组合行 `tools/index` 的 Loader 注入回归测试。
 *
 * boot 曾报 "cannot get property tools without inject"：`tools/index.ts` 原来
 * `export default apply`，cordis Loader 的 `unwrapExports` 取 `default ?? exports`
 * 返回 apply 函数、丢失命名导出的 `inject`，导致 cordis 不注入 `tools`。
 *
 * 修复：tools/index 改为命名导出 apply + inject（与 tasks/tool 一致）。本测试
 * 模拟 Loader 的 `default ?? exports` + `registry.plugin` 行为，断言注入 tools
 * 生效（组合行 apply 内 `ctx.tools.register` 不再抛 "without inject"）。
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as toolsIndex from '../../src/tools/index.ts'

/** 模拟 cordis Loader 的 unwrapExports：`default ?? exports`。 */
function unwrapExports<T>(namespace: T): T | NonNullable<T extends { default: infer D } ? D : never> {
  const exports = namespace as { default?: unknown }
  return (exports.default ?? namespace) as never
}

describe('dsh-harness-memory-bundle/tools (Loader 注入回归)', () => {
  it('tools/index 命名导出 inject，unwrapExports 后仍含 inject（修复根因）', () => {
    const module = unwrapExports(toolsIndex)
    // Loader 用 `default ?? exports`；tools/index 无 default，返回命名空间。
    expect('inject' in module).toBe(true)
    expect((module as { inject: string[] }).inject).toContain('tools')
    expect('apply' in module).toBe(true)
  })

  it('经 registry.plugin(命名空间) 加载时注入 tools，组合行 apply 可注册工具', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const module = unwrapExports(toolsIndex) as { apply: Parameters<Context['plugin']>[0] }
    // 与 Loader._start 一致：ctx.registry.plugin(plugin, config)。
    await ctx.registry.plugin(module as never, {})
    const names = ctx.tools.schemas().map((s) => s.name).sort()
    expect(names).toContain('query_memory')
    expect(names).toContain('query_conversation')
  })
})
