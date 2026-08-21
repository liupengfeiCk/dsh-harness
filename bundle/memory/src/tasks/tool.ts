/**
 * The main-agent `create_task` tool.
 *
 * The main agent uses this tool when it judges a piece of work is large enough
 * to become a durable task (design §7 F10 second entry). Creating a task makes
 * it available as a memory filtering dimension: the task id is associated with
 * the delegation and session records, so the memory engine can later retrieve
 * L0/L1 filtered by this task.
 *
 * The tool resolves the `tasks` service opportunistically via `ctx.get` (the
 * documented cordis pattern), refusing to run when no registry is composed.
 * @module dsh-harness-memory-bundle/tasks/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { getTraceable } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Tasks } from './index.ts'

export const name = 'memory-task-tool'
export const inject = ['tools']

/** Config: the model-facing tool name. */
export interface Config {
  /** Model-facing tool name (default `create_task`). */
  toolName?: string
}

export const Config: z<Config> = z.object({
  toolName: z.string().default('create_task'),
})

/**
 * Cordis plugin body for the `create_task` tool. Mounted as a host row in the
 * memory bundle's `cordis.patch.yml`.
 * @param ctx - the host plugin context.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const toolName = config.toolName ?? 'create_task'
  ctx.tools.register(defineTool({
    name: toolName,
    description:
      'Create a durable task on the main conversation. Use this when the work at hand is large '
      + 'enough to track as a persistent task: it becomes a memory filtering dimension, so the '
      + 'memories produced while working on it can later be retrieved together by task. '
      + 'Returns the created task id and its current status.',
    parameters: {
      title: {
        type: 'string',
        required: true,
        description: 'A short title for the task.',
      },
      goal: {
        type: 'string',
        required: true,
        description: 'The task\'s objective — what it is trying to achieve.',
      },
      roles: {
        type: 'array',
        description: 'The responsible team roles and their intra-task division of labour.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            roleId: { type: 'string', required: true, description: 'The team role id.' },
            division: { type: 'string', required: true, description: 'What this role is responsible for within the task.' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskId: { type: 'string', required: true },
          status: { type: 'string', required: true, const: 'running' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `created task ${value.taskId} (${value.status})`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, _exec) {
      // `ctx.get` opportunistically resolves the `tasks` registry. Traceable
      // ctx strips a hot-mounted Include-fiber shadow so a re-mount reads the
      // same service map a boot mount would (mirrors the team tool).
      const tasks = (getTraceable(ctx, ctx) as Context).get('tasks')
      if (tasks === undefined) {
        throw new Error('memory-task: no task registry is loaded (load dsh-harness-memory-bundle in the host composition)')
      }
      const task = (tasks as Tasks).create({
        title: args.title,
        goal: args.goal,
        ...args.roles === undefined ? {} : { roles: args.roles },
      })
      // `create_task` always produces a running task (the output schema pins
      // `status` to `running`).
      return { taskId: task.id, status: 'running' as const }
    },
  }))
}
