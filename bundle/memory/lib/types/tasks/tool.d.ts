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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "memory-task-tool";
export declare const inject: string[];
/** Config: the model-facing tool name. */
export interface Config {
    /** Model-facing tool name (default `create_task`). */
    toolName?: string;
}
export declare const Config: z<Config>;
/**
 * Cordis plugin body for the `create_task` tool. Mounted as a host row in the
 * memory bundle's `cordis.patch.yml`.
 * @param ctx - the host plugin context.
 * @param config - validated plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=tool.d.ts.map