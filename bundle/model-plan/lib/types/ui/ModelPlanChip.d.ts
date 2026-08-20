/**
 * Session model-plan chip: the composer's named model seat (`conversation.input.model`),
 * replacing the official model selector with a plan-bound picker.
 *
 * The trigger shows the bound plan's name (`方案：<name> ▾`), or the deployment
 * default (or "选择方案") when none is bound. The menu lists every plan with its
 * provider/model and param summary, marks the default, and flags broken plans;
 * picking one binds the session through `select`. A "session overrides" footer
 * lets the user temporarily adjust params for this session only.
 *
 * Once the conversation has started the host refuses a binding swap, so the
 * chip disables itself on a non-blank session and explains why on hover; a
 * select the host rejects as locked rolls the binding back and surfaces the
 * failure. Note the composer deliberately keeps this seat LIVE while it refuses
 * text for a model-related block — the user clears such a block by picking a
 * usable plan here — so only the bar's own disable state (`locked`) and a
 * started session disable the trigger.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ModelPlanChipState } from './mode-store.ts';
import type { ModelPlanKey } from './locales.ts';
/** Registration-side business face for the session model-plan chip. */
export interface ModelPlanChipInjected {
    hooks: {
        /** Chip snapshot bound by the renderer as useModelPlanChip. */
        modelPlanChip: SnapshotStore<ModelPlanChipState>;
    };
    /** Read the session's binding and the plan roster when the chip first renders. */
    load: () => Promise<void>;
    /** Bind the session to one plan (optionally with session-level overrides). */
    select: (planId: string, overrides?: Record<string, unknown>) => Promise<void>;
    /** Seed the override editor from the current session overrides when the menu opens. */
    beginOverrideDraft: () => void;
    /** Set one staged override row's key. */
    setOverrideKey: (index: number, key: string) => void;
    /** Set one staged override row's value. */
    setOverrideValue: (index: number, value: string) => void;
    /** Append an empty override row. */
    addOverrideRow: () => void;
    /** Remove one override row. */
    removeOverrideRow: (index: number) => void;
    /** The reason the staged overrides cannot save, or null. */
    overrideBlocker: () => 'key' | 'value' | null;
    /** Save the staged overrides as this session's overrides bag. */
    applyOverrides: () => Promise<void>;
    /** Clear every session override. */
    clearOverrides: () => Promise<void>;
}
/** Full component props: the model-seat owner share + session kit + locale + injected face. */
export type ModelPlanChipProps = PropsRuntime<'conversation.input.model'> & PropsLocale<'settings.modelPlan'> & InjectFace<ModelPlanChipInjected>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Model-plan management-section copy, shared with the settings section. */
        'settings.modelPlan': ModelPlanKey;
    }
}
/**
 * Render the composer model-seat chip.
 * @param props - composed slot props.
 * @returns the chip trigger and, while open, the plan menu.
 */
export declare function ModelPlanChip({ locked, useModelPlanChip, t, load, select, beginOverrideDraft, setOverrideKey, setOverrideValue, addOverrideRow, removeOverrideRow, overrideBlocker, applyOverrides, clearOverrides, }: ModelPlanChipProps): import("react").JSX.Element;
//# sourceMappingURL=ModelPlanChip.d.ts.map