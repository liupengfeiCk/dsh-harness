/**
 * Model-plan settings section ("模型方案"): the independent plan roster as
 * cards, with a create/edit dialog over a staged draft (name, provider-grouped
 * model pick, and a params bag) and delete with confirmation.
 *
 * The model pick reads the session-independent host catalog (`llm.models`):
 * provider-grouped, with each exact route's reasoning metadata. `reasoningEffort`
 * renders as a dropdown sourced from the selected model's efforts when that
 * model exposes them. The params bag is an array of editable key/value rows —
 * every key can be deleted, re-valued, its spelling edited inline, and new
 * key=value rows appended. A note reminds the user that custom keys pass
 * through into the request body without implying provider support.
 *
 * A shipped (system) plan is read-only: it cannot be edited or deleted.
 */
import type { ReactNode } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type ModelPlanSectionState } from './section-store.ts';
import type { ModelCatalogState } from './directory.ts';
import type { ModelPlanKey } from './locales.ts';
/** Registration-side business face for the model-plan settings section. */
export interface ModelPlanSectionInjected {
    hooks: {
        /** Page snapshot bound by the renderer as useModelPlanSection. */
        modelPlanSection: SnapshotStore<ModelPlanSectionState>;
        /** The model-catalog snapshot bound as useModelCatalog. */
        modelCatalog: SnapshotStore<ModelCatalogState>;
    };
    /** Read the roster; called once when the section first renders. */
    load: () => Promise<void>;
    /** Load the model catalog; called once when the editor first opens. */
    loadCatalog: () => Promise<void>;
    /** Open the create dialog. */
    beginCreate: () => void;
    /** Open the edit dialog over one plan. */
    beginEdit: (id: string) => Promise<void>;
    /** Close the dialog, discarding the staged draft. */
    closeDialog: () => void;
    /** Name the draft (create id). */
    setDialogId: (id: string) => void;
    /** Set the draft's display name. */
    setDialogName: (name: string) => void;
    /** Pick the draft's provider route. */
    setDialogProvider: (provider: string) => void;
    /** Pick the draft's model id. */
    setDialogModel: (model: string) => void;
    /** Set one params-bag row's key. */
    setParamKey: (index: number, key: string) => void;
    /** Set one params-bag row's value. */
    setParamValue: (index: number, value: string) => void;
    /** Add an empty params-bag row. */
    addParam: () => void;
    /** Remove one params-bag row. */
    removeParam: (index: number) => void;
    /** Set the draft's reasoningEffort through its dropdown. */
    setReasoningEffort: (effort: string) => void;
    /** Submit the create. */
    confirmCreate: () => Promise<void>;
    /** Submit the edit. */
    confirmEdit: () => Promise<void>;
    /** Set one plan as the deployment default. */
    setDefault: (id: string) => void;
    /** Ask for confirmation before deleting one plan. */
    confirmDelete: (id: string | null) => void;
    /** Delete the plan awaiting confirmation. */
    remove: () => Promise<void>;
}
/** Full component props. */
export type ModelPlanSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.modelPlan'> & InjectFace<ModelPlanSectionInjected>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Model-plan management-section copy. */
        'settings.modelPlan': ModelPlanKey;
    }
}
/**
 * Render the model-plan settings section content column.
 * @param props - composed slot props.
 * @returns the section, or null when the deployment composes no plans.
 */
export declare function ModelPlanSection(props: ModelPlanSectionProps): ReactNode;
//# sourceMappingURL=ModelPlanSection.d.ts.map