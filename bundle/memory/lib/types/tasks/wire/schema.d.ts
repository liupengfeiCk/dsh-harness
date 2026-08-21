/**
 * Task-entity management wire schemas and contracts.
 *
 * These are the request/response shapes the `/memory-task` wire channel
 * carries, mirroring the team-management wire in the subagent bundle and the
 * `/model-plan` wire in the model-plan bundle. Endpoint names mirror the
 * management surface (list/read/create/update/complete/attachSession) and the
 * value types mirror the task registry's own vocabulary (`Task`, `TaskRole`,
 * `TaskStatus`).
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. Error codes mirror the task
 * registry's failure vocabulary.
 * @module dsh-harness-memory-bundle/tasks/wire
 */
import { z } from 'zod';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>;
/** A task's lifecycle on the wire, mirroring `TaskStatus`. */
export declare const wireTaskStatusSchema: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
/** One responsible role plus its division, mirroring `TaskRole`. */
export declare const wireTaskRoleSchema: z.ZodObject<{
    roleId: z.ZodString;
    division: z.ZodString;
}, z.core.$strip>;
/** How a session came to be associated, mirroring `TaskSessionKind`. */
export declare const wireTaskSessionKindSchema: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
/** One session association on a task. */
export declare const wireTaskSessionSchema: z.ZodObject<{
    sessionId: z.ZodString;
    roleId: z.ZodOptional<z.ZodString>;
    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
    attachedAt: z.ZodString;
}, z.core.$strip>;
/** One task roster/detail row. */
export declare const wireTaskEntrySchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    goal: z.ZodString;
    status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
    roles: z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        division: z.ZodString;
    }, z.core.$strip>>;
    createdAt: z.ZodString;
    completedAt: z.ZodNullable<z.ZodString>;
    sessions: z.ZodArray<z.ZodObject<{
        sessionId: z.ZodString;
        roleId: z.ZodOptional<z.ZodString>;
        kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
        attachedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** task.list request: an optional flag to surface completed tasks explicitly. */
export declare const wireListRequestSchema: z.ZodObject<{
    includeCompleted: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** task.list response value. */
export declare const wireListValueSchema: z.ZodObject<{
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
        roles: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            division: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        completedAt: z.ZodNullable<z.ZodString>;
        sessions: z.ZodArray<z.ZodObject<{
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
            attachedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** task.read request. */
export declare const wireReadRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** task.read response value. */
export declare const wireReadValueSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
        roles: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            division: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        completedAt: z.ZodNullable<z.ZodString>;
        sessions: z.ZodArray<z.ZodObject<{
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
            attachedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** task.create request: title, goal, optional responsible roles. */
export declare const wireCreateRequestSchema: z.ZodObject<{
    title: z.ZodString;
    goal: z.ZodString;
    roles: z.ZodOptional<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        division: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** task.create response value. */
export declare const wireCreateValueSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
        roles: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            division: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        completedAt: z.ZodNullable<z.ZodString>;
        sessions: z.ZodArray<z.ZodObject<{
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
            attachedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** task.update request: any subset of the mutable fields. */
export declare const wireUpdateRequestSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
    roles: z.ZodOptional<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        division: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** task.update response value. */
export declare const wireUpdateValueSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
        roles: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            division: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        completedAt: z.ZodNullable<z.ZodString>;
        sessions: z.ZodArray<z.ZodObject<{
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
            attachedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** task.complete request. */
export declare const wireCompleteRequestSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/** task.complete response value. */
export declare const wireCompleteValueSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
        roles: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            division: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        completedAt: z.ZodNullable<z.ZodString>;
        sessions: z.ZodArray<z.ZodObject<{
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
            attachedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** task.attachSession request: associate a session with a task. */
export declare const wireAttachSessionRequestSchema: z.ZodObject<{
    taskId: z.ZodString;
    sessionId: z.ZodString;
    roleId: z.ZodOptional<z.ZodString>;
    kind: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>>;
}, z.core.$strip>;
/** task.attachSession response value. */
export declare const wireAttachSessionValueSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        goal: z.ZodString;
        status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
        roles: z.ZodArray<z.ZodObject<{
            roleId: z.ZodString;
            division: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        completedAt: z.ZodNullable<z.ZodString>;
        sessions: z.ZodArray<z.ZodObject<{
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
            attachedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** The full management surface: endpoint name → request/value schemas. */
export declare const wireEndpoints: {
    readonly list: {
        readonly request: z.ZodObject<{
            includeCompleted: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            tasks: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                goal: z.ZodString;
                status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
                roles: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
                    division: z.ZodString;
                }, z.core.$strip>>;
                createdAt: z.ZodString;
                completedAt: z.ZodNullable<z.ZodString>;
                sessions: z.ZodArray<z.ZodObject<{
                    sessionId: z.ZodString;
                    roleId: z.ZodOptional<z.ZodString>;
                    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
                    attachedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly read: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            task: z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                goal: z.ZodString;
                status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
                roles: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
                    division: z.ZodString;
                }, z.core.$strip>>;
                createdAt: z.ZodString;
                completedAt: z.ZodNullable<z.ZodString>;
                sessions: z.ZodArray<z.ZodObject<{
                    sessionId: z.ZodString;
                    roleId: z.ZodOptional<z.ZodString>;
                    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
                    attachedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly create: {
        readonly request: z.ZodObject<{
            title: z.ZodString;
            goal: z.ZodString;
            roles: z.ZodOptional<z.ZodArray<z.ZodObject<{
                roleId: z.ZodString;
                division: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            task: z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                goal: z.ZodString;
                status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
                roles: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
                    division: z.ZodString;
                }, z.core.$strip>>;
                createdAt: z.ZodString;
                completedAt: z.ZodNullable<z.ZodString>;
                sessions: z.ZodArray<z.ZodObject<{
                    sessionId: z.ZodString;
                    roleId: z.ZodOptional<z.ZodString>;
                    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
                    attachedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly update: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            goal: z.ZodOptional<z.ZodString>;
            roles: z.ZodOptional<z.ZodArray<z.ZodObject<{
                roleId: z.ZodString;
                division: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            task: z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                goal: z.ZodString;
                status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
                roles: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
                    division: z.ZodString;
                }, z.core.$strip>>;
                createdAt: z.ZodString;
                completedAt: z.ZodNullable<z.ZodString>;
                sessions: z.ZodArray<z.ZodObject<{
                    sessionId: z.ZodString;
                    roleId: z.ZodOptional<z.ZodString>;
                    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
                    attachedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly complete: {
        readonly request: z.ZodObject<{
            id: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            task: z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                goal: z.ZodString;
                status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
                roles: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
                    division: z.ZodString;
                }, z.core.$strip>>;
                createdAt: z.ZodString;
                completedAt: z.ZodNullable<z.ZodString>;
                sessions: z.ZodArray<z.ZodObject<{
                    sessionId: z.ZodString;
                    roleId: z.ZodOptional<z.ZodString>;
                    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
                    attachedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly attachSession: {
        readonly request: z.ZodObject<{
            taskId: z.ZodString;
            sessionId: z.ZodString;
            roleId: z.ZodOptional<z.ZodString>;
            kind: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            task: z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                goal: z.ZodString;
                status: z.ZodUnion<readonly [z.ZodLiteral<"running">, z.ZodLiteral<"completed">]>;
                roles: z.ZodArray<z.ZodObject<{
                    roleId: z.ZodString;
                    division: z.ZodString;
                }, z.core.$strip>>;
                createdAt: z.ZodString;
                completedAt: z.ZodNullable<z.ZodString>;
                sessions: z.ZodArray<z.ZodObject<{
                    sessionId: z.ZodString;
                    roleId: z.ZodOptional<z.ZodString>;
                    kind: z.ZodUnion<readonly [z.ZodLiteral<"session">, z.ZodLiteral<"delegation">]>;
                    attachedAt: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
};
/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map