/**
 * Agent-preset editing wire schemas and contracts.
 *
 * These are the request/response shapes the agent-preset-edit wire channel
 * carries, moved here from the withdrawn apiproxy `agentPreset.readEditable` /
 * `agentPreset.update` domain so the browser surface and the Host handler
 * validate against the same zod schemas without touching the apiproxy
 * registry. Names mirror the withdrawn domain's and the value types mirror
 * this package's own vocabulary (`DelegationInstance`, `ToolRow`,
 * `CatalogTool`) so a new editable field needs no per-field assembly on this
 * seam.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. The error codes mirror the
 * withdrawn `agentPreset.*` domain's vocabulary (`agent-preset-not-found`,
 * `agent-preset-read-only`, `agent-preset-invalid`).
 * @module dsh-harness-agent-preset-editing-bundle/edit/wire-schema
 */
import { z } from 'zod';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { CatalogTool, DelegationInstance, ToolRow } from '../edit.ts';
/** Success/failure wire result for one editing call. */
export type WireResult<T> = RpcResult<T>;
/** One delegation instance the form may edit, keyed by its instance id. */
export interface WireDelegationRow extends DelegationInstance {
}
/** One tool row in the inventory, with its enabled state and optional prose. */
export interface WireToolRow extends ToolRow {
}
/** One installable tool package in the available-tools directory. */
export interface WireCatalogTool extends CatalogTool {
}
/** agentPreset.readEditable request payload. */
export declare const wireReadEditableRequestSchema: z.ZodObject<{
    agentPreset: z.ZodString;
}, z.core.$strip>;
/** One delegation instance a form may edit. */
export declare const wireDelegationRowSchema: z.ZodObject<{
    id: z.ZodString;
    disabled: z.ZodOptional<z.ZodBoolean>;
    provider: z.ZodOptional<z.ZodString>;
    backgroundMode: z.ZodOptional<z.ZodString>;
    backgroundModeLocked: z.ZodBoolean;
    enableRunInBackground: z.ZodOptional<z.ZodBoolean>;
    maxDepth: z.ZodOptional<z.ZodUnknown>;
    toolName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** One tool row's editable state. */
export declare const wireToolRowSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    disabled: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"expr">]>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** One installable tool package in the available-tools directory. */
export declare const wireCatalogToolSchema: z.ZodObject<{
    name: z.ZodString;
    toolNames: z.ZodArray<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    installed: z.ZodBoolean;
}, z.core.$strip>;
/** agentPreset.readEditable response value. */
export declare const wireReadEditableValueSchema: z.ZodObject<{
    agentPreset: z.ZodString;
    persona: z.ZodOptional<z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strip>>;
    delegation: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        disabled: z.ZodOptional<z.ZodBoolean>;
        provider: z.ZodOptional<z.ZodString>;
        backgroundMode: z.ZodOptional<z.ZodString>;
        backgroundModeLocked: z.ZodBoolean;
        enableRunInBackground: z.ZodOptional<z.ZodBoolean>;
        maxDepth: z.ZodOptional<z.ZodUnknown>;
        toolName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    tools: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        disabled: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"expr">]>;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    catalog: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        toolNames: z.ZodArray<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        installed: z.ZodBoolean;
    }, z.core.$strip>>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** agentPreset.update request payload. */
export declare const wireUpdateRequestSchema: z.ZodObject<{
    agentPreset: z.ZodString;
    persona: z.ZodOptional<z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strip>>;
    delegation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        disabled: z.ZodBoolean;
    }, z.core.$strip>>>;
    installTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    removeTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** agentPreset.update response value. */
export declare const wireUpdateValueSchema: z.ZodObject<{
    agentPreset: z.ZodString;
}, z.core.$strip>;
/** The full editing surface: endpoint name → request/value schemas. */
export declare const wireEndpoints: {
    readonly readEditable: {
        readonly request: z.ZodObject<{
            agentPreset: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            agentPreset: z.ZodString;
            persona: z.ZodOptional<z.ZodObject<{
                text: z.ZodString;
            }, z.core.$strip>>;
            delegation: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
                provider: z.ZodOptional<z.ZodString>;
                backgroundMode: z.ZodOptional<z.ZodString>;
                backgroundModeLocked: z.ZodBoolean;
                enableRunInBackground: z.ZodOptional<z.ZodBoolean>;
                maxDepth: z.ZodOptional<z.ZodUnknown>;
                toolName: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            tools: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                disabled: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"expr">]>;
                description: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            catalog: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                toolNames: z.ZodArray<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                installed: z.ZodBoolean;
            }, z.core.$strip>>;
            name: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    };
    readonly update: {
        readonly request: z.ZodObject<{
            agentPreset: z.ZodString;
            persona: z.ZodOptional<z.ZodObject<{
                text: z.ZodString;
            }, z.core.$strip>>;
            delegation: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
            tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                disabled: z.ZodBoolean;
            }, z.core.$strip>>>;
            installTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
            removeTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
            metadata: z.ZodOptional<z.ZodObject<{
                name: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            agentPreset: z.ZodString;
        }, z.core.$strip>;
    };
};
/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map