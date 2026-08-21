/**
 * T10 限次预算控制器——查记忆/查原对话工具共享的每会话调用配额。
 */

import { describe, expect, it } from 'vitest'
import { MemoryToolBudget } from '../../src/tools/budget.ts'

describe('MemoryToolBudget', () => {
  it('默认每会话上限为 3，超限拒绝', () => {
    const budget = new MemoryToolBudget()
    const owner = {}
    expect(budget.consume('s1', owner)).toEqual({ allowed: true, remaining: 2 })
    expect(budget.consume('s1', owner)).toEqual({ allowed: true, remaining: 1 })
    expect(budget.consume('s1', owner)).toEqual({ allowed: true, remaining: 0 })
    expect(budget.consume('s1', owner)).toEqual({ allowed: false, remaining: 0 })
    // 该会话已耗尽；其他会话不受影响。
    expect(budget.consume('s2', {})).toEqual({ allowed: true, remaining: 2 })
  })

  it('不同会话各自独立计数', () => {
    const budget = new MemoryToolBudget(2)
    expect(budget.consume('a', {})).toEqual({ allowed: true, remaining: 1 })
    expect(budget.consume('b', {})).toEqual({ allowed: true, remaining: 1 })
    expect(budget.remaining('a')).toBe(1)
    expect(budget.remaining('b')).toBe(1)
    budget.consume('a', {})
    expect(budget.remaining('a')).toBe(0)
    expect(budget.remaining('b')).toBe(1)
  })

  it('自定义上限生效', () => {
    const budget = new MemoryToolBudget(5)
    expect(budget.limit).toBe(5)
    for (let i = 0; i < 5; i++) budget.consume('s', {})
    expect(budget.consume('s', {})).toEqual({ allowed: false, remaining: 0 })
  })

  it('非法上限抛错', () => {
    expect(() => new MemoryToolBudget(0)).toThrow(/positive integer/)
    expect(() => new MemoryToolBudget(-1)).toThrow(/positive integer/)
    expect(() => new MemoryToolBudget(2.5)).toThrow(/positive integer/)
  })

  it('无 owner 的调用不计数（兜底），始终允许', () => {
    const budget = new MemoryToolBudget(1)
    expect(budget.consume('s', undefined)).toEqual({ allowed: true, remaining: 1 })
    expect(budget.consume('s', undefined)).toEqual({ allowed: true, remaining: 1 })
  })

  it('reset 释放某会话计数', () => {
    const budget = new MemoryToolBudget(1)
    budget.consume('s', {})
    expect(budget.remaining('s')).toBe(0)
    budget.reset('s')
    expect(budget.remaining('s')).toBe(1)
    expect(budget.consume('s', {})).toEqual({ allowed: true, remaining: 0 })
  })
})
