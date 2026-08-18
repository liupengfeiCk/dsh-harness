/**
 * Structured, line-scoped edits to a preset composition.
 *
 * A preset composition is a text file the loader owns (it carries `!!js`
 * expressions and hand-authored comments), so editing it must not round-trip
 * it through a YAML dump: a dump would discard every comment and re-emit the
 * rows in whatever order the loader's tree happened to hold. This package
 * locates the editable rows by indentation and rewrites only the target key
 * lines, leaving everything else byte-for-byte intact.
 *
 * Extracted from the official `dsh-agent-presets` package so the official
 * package stays zero-invasive: the edit mechanism lives here, and presets'
 * consumer packages (and the apiproxy agentPreset domain) import it directly.
 * @module dsh-harness-agent-preset-editing-bundle/edit
 */
export { applyEdits, discoverToolPackages, InvalidPresetEditsError, readEditableFields, type AvailableToolPackage, type CatalogTool, type DelegationConfig, type DelegationInstance, type DelegationKey, type EditableFields, type PresetCompositionEdits, type ToolRow, type ToolDisabledState, } from './edit.ts';
export { AGENT_PRESET_EDIT_CHANNEL, dispatchAgentPresetEdit, registerAgentPresetEditWire, } from './wire/index.ts';
export type { WireResult } from './wire/schema.ts';
//# sourceMappingURL=index.d.ts.map