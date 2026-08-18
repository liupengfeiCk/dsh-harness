/**
 * Subagent-management wire schemas and contracts.
 *
 * These are the request/response shapes the subagent-preset wire channel
 * carries, moved here from the withdrawn apiproxy `subagentPreset.*` domain so
 * the browser surface and the Host handler validate against the same zod
 * schemas without touching the apiproxy registry. Names mirror the withdrawn
 * domain's (list/read/create/openDocument/remove/readEditable/update) and the
 * value types mirror the registry's own vocabulary (`SubagentPresetEntry`,
 * `SubagentPresetMetadata`, `ToolRow`, `CatalogTool`) so a new metadata field
 * needs no per-field assembly on this seam.
 *
 * The wire uses the same success/error result shape as the apiproxy RPC layer:
 * `{ ok: true, value }` or `{ ok: false, error }`. The error codes mirror the
 * withdrawn `subagentPreset.*` domain's vocabulary.
 * @module dsh-harness-subagent-bundle/preset/wire
 */
import { z } from 'zod';
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Success/failure wire result for one management call. */
export type WireResult<T> = RpcResult<T>;
/** The display metadata carried on list/readEditable/update rows. */
export interface WireSubagentMetadata {
    readonly description?: string;
    readonly enabled?: boolean;
    readonly model?: {
        provider: string;
        model: string;
    };
    readonly inheritParent?: boolean;
}
/** One subagent row of the roster. */
export interface WireSubagentEntry {
    readonly id: string;
    readonly trust: 'system' | 'user';
    readonly metadata: WireSubagentMetadata;
    readonly broken?: string;
}
/** One tool row in a subagent's composition, with its enabled state. */
export interface WireToolRow {
    readonly id: string;
    readonly name: string;
    readonly disabled: boolean | 'expr';
    readonly description?: string;
}
/** One installable tool package in the available-tools directory. */
export interface WireCatalogTool {
    readonly name: string;
    readonly toolNames: readonly string[];
    readonly description?: string;
    readonly installed: boolean;
}
/** The display metadata object carried on list/readEditable/update rows. */
export declare const wireSubagentMetadataSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
    }, z.core.$strip>>;
    inheritParent: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/** One subagent roster row. */
export declare const wireSubagentEntrySchema: z.ZodObject<{
    id: z.ZodString;
    trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
    metadata: z.ZodObject<{
        description: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        model: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strip>>;
        inheritParent: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    broken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** subagentPreset.list request payload (no fields). */
export declare const wireListRequestSchema: z.ZodObject<{}, z.core.$strip>;
/** subagentPreset.list response value. */
export declare const wireListValueSchema: z.ZodObject<{
    subagents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
        metadata: z.ZodObject<{
            description: z.ZodOptional<z.ZodString>;
            enabled: z.ZodOptional<z.ZodBoolean>;
            model: z.ZodOptional<z.ZodObject<{
                provider: z.ZodString;
                model: z.ZodString;
            }, z.core.$strip>>;
            inheritParent: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
        broken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    authorable: z.ZodBoolean;
    hasDocument: z.ZodBoolean;
}, z.core.$strip>;
/** subagentPreset.read request payload. */
export declare const wireReadRequestSchema: z.ZodObject<{
    subagent: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.read response value. */
export declare const wireReadValueSchema: z.ZodObject<{
    subagent: z.ZodString;
    trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
    content: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.create request payload. */
export declare const wireCreateRequestSchema: z.ZodObject<{
    from: z.ZodString;
    subagent: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.create response value. */
export declare const wireCreateValueSchema: z.ZodObject<{
    subagent: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.openDocument request payload. */
export declare const wireOpenDocumentRequestSchema: z.ZodObject<{
    subagent: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.openDocument response value. */
export declare const wireOpenDocumentValueSchema: z.ZodUnion<readonly [z.ZodObject<{
    opened: z.ZodLiteral<true>;
}, z.core.$strip>, z.ZodObject<{
    opened: z.ZodLiteral<false>;
    path: z.ZodString;
}, z.core.$strip>]>;
/** subagentPreset.remove request payload. */
export declare const wireRemoveRequestSchema: z.ZodObject<{
    subagent: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.remove response value (empty). */
export declare const wireRemoveValueSchema: z.ZodObject<{}, z.core.$strip>;
/** One tool row of subagentPreset.readEditable. */
export declare const wireToolRowSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    disabled: z.ZodUnion<readonly [z.ZodBoolean, z.ZodLiteral<"expr">]>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** One catalog entry of subagentPreset.readEditable. */
export declare const wireCatalogToolSchema: z.ZodObject<{
    name: z.ZodString;
    toolNames: z.ZodArray<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    installed: z.ZodBoolean;
}, z.core.$strip>;
/** subagentPreset.readEditable request payload. */
export declare const wireReadEditableRequestSchema: z.ZodObject<{
    subagent: z.ZodString;
}, z.core.$strip>;
/** subagentPreset.readEditable response value. */
export declare const wireReadEditableValueSchema: z.ZodObject<{
    subagent: z.ZodString;
    persona: z.ZodOptional<z.ZodObject<{
        text: z.ZodString;
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
    metadata: z.ZodObject<{
        description: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        model: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strip>>;
        inheritParent: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>;
/** subagentPreset.update request payload. */
export declare const wireUpdateRequestSchema: z.ZodObject<{
    subagent: z.ZodString;
    persona: z.ZodOptional<z.ZodObject<{
        text: z.ZodString;
    }, z.core.$strip>>;
    tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        disabled: z.ZodBoolean;
    }, z.core.$strip>>>;
    installTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    removeTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodObject<{
        description: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        model: z.ZodOptional<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strip>>;
        inheritParent: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** subagentPreset.update response value. */
export declare const wireUpdateValueSchema: z.ZodObject<{
    subagent: z.ZodString;
}, z.core.$strip>;
/** The full management surface: endpoint name → request/value schemas. */
export declare const wireEndpoints: {
    readonly list: {
        readonly request: z.ZodObject<{}, z.core.$strip>;
        readonly value: z.ZodObject<{
            subagents: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
                metadata: z.ZodObject<{
                    description: z.ZodOptional<z.ZodString>;
                    enabled: z.ZodOptional<z.ZodBoolean>;
                    model: z.ZodOptional<z.ZodObject<{
                        provider: z.ZodString;
                        model: z.ZodString;
                    }, z.core.$strip>>;
                    inheritParent: z.ZodOptional<z.ZodBoolean>;
                }, z.core.$strip>;
                broken: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            authorable: z.ZodBoolean;
            hasDocument: z.ZodBoolean;
        }, z.core.$strip>;
    };
    readonly read: {
        readonly request: z.ZodObject<{
            subagent: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            subagent: z.ZodString;
            trust: z.ZodUnion<readonly [z.ZodLiteral<"system">, z.ZodLiteral<"user">]>;
            content: z.ZodString;
        }, z.core.$strip>;
    };
    readonly create: {
        readonly request: z.ZodObject<{
            from: z.ZodString;
            subagent: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            subagent: z.ZodString;
        }, z.core.$strip>;
    };
    readonly openDocument: {
        readonly request: z.ZodObject<{
            subagent: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodUnion<readonly [z.ZodObject<{
            opened: z.ZodLiteral<true>;
        }, z.core.$strip>, z.ZodObject<{
            opened: z.ZodLiteral<false>;
            path: z.ZodString;
        }, z.core.$strip>]>;
    };
    readonly remove: {
        readonly request: z.ZodObject<{
            subagent: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{}, z.core.$strip>;
    };
    readonly readEditable: {
        readonly request: z.ZodObject<{
            subagent: z.ZodString;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            subagent: z.ZodString;
            persona: z.ZodOptional<z.ZodObject<{
                text: z.ZodString;
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
            metadata: z.ZodObject<{
                description: z.ZodOptional<z.ZodString>;
                enabled: z.ZodOptional<z.ZodBoolean>;
                model: z.ZodOptional<z.ZodObject<{
                    provider: z.ZodString;
                    model: z.ZodString;
                }, z.core.$strip>>;
                inheritParent: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly update: {
        readonly request: z.ZodObject<{
            subagent: z.ZodString;
            persona: z.ZodOptional<z.ZodObject<{
                text: z.ZodString;
            }, z.core.$strip>>;
            tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                disabled: z.ZodBoolean;
            }, z.core.$strip>>>;
            installTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
            removeTools: z.ZodOptional<z.ZodArray<z.ZodString>>;
            metadata: z.ZodOptional<z.ZodObject<{
                description: z.ZodOptional<z.ZodString>;
                enabled: z.ZodOptional<z.ZodBoolean>;
                model: z.ZodOptional<z.ZodObject<{
                    provider: z.ZodString;
                    model: z.ZodString;
                }, z.core.$strip>>;
                inheritParent: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        readonly value: z.ZodObject<{
            subagent: z.ZodString;
        }, z.core.$strip>;
    };
};
/** One endpoint name the wire channel serves. */
export type WireEndpointName = keyof typeof wireEndpoints;
//# sourceMappingURL=schema.d.ts.map