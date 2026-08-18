window.__ModuleLoader__.load({
	id: "dsh-harness-subagent-bundle",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/ui/section-store.js
		/**
		* Subagent management controller: the roster as a list, a create/copy dialog,
		* a row-level enable/disable toggle, an edit dialog over the metadata fields,
		* delete, and opening a subagent's directory.
		*
		* The host stays the single fact source. Every mutation writes through the
		* wire and the page re-reads the roster afterwards, because a toggle or edit
		* changes more than the row it targeted (the roster order and states recompute
		* from the host).
		*/
		/** Ids a subagent directory may be named, mirroring the host's own rule. */
		const SUBAGENT_ID = /^[a-z0-9][a-z0-9-]*$/;
		const INITIAL = {
			status: "idle",
			error: null,
			authorable: false,
			hasDocument: false,
			rows: [],
			create: null,
			view: null,
			edit: null,
			pendingDelete: null,
			deleting: false,
			revealedPaths: {}
		};
		/** The failure message of a rejected wire call. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Why this create cannot be submitted yet, as a locale key, or undefined. */
		function createBlocker(draft, rows) {
			if (draft.id === "") return "idRequired";
			if (!SUBAGENT_ID.test(draft.id)) return "idInvalid";
			if (rows.some((row) => row.id === draft.id)) return "idTaken";
		}
		/**
		* Map the host's model-catalog groups to the edit dialog's grouped choices,
		* clipping each model to the id/name pair the picker renders. This drops the
		* catalog's per-model reasoning metadata, which the subagent override does not
		* carry yet.
		* @param groups - the `llm.models` provider groups.
		* @returns the grouped choices, provider-preferred order preserved.
		*/
		function modelChoicesFrom(groups) {
			return groups.map((group) => ({
				provider: group.id,
				providerName: group.name,
				models: group.models.map((model) => ({
					id: model.id,
					name: model.name
				}))
			}));
		}
		/** The optgroup-encoded option value for one provider/model pick. */
		function modelOptionValue(pick) {
			return `${pick.provider}\u0000${pick.model}`;
		}
		/** Decode an optgroup-encoded option value back to provider/model. */
		function modelOptionDecode(value) {
			if (value === "") return void 0;
			const separator = value.indexOf("\0");
			if (separator === -1) return void 0;
			const provider = value.slice(0, separator);
			const model = value.slice(separator + 1);
			return provider === "" || model === "" ? void 0 : {
				provider,
				model
			};
		}
		/** Reads the roster and drives the create, edit, toggle, delete, and location reveals. */
		var SubagentSectionController = class {
			api;
			rosterChanged;
			/** Page snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			constructor(api, rosterChanged = () => {}) {
				this.api = api;
				this.rosterChanged = rosterChanged;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			patchCreate(patch) {
				const { create } = this.store.getSnapshot();
				if (create === null) return;
				this.set({ create: {
					...create,
					...patch
				} });
			}
			patchEdit(patch) {
				const { edit } = this.store.getSnapshot();
				if (edit === null) return;
				this.set({ edit: {
					...edit,
					...patch
				} });
			}
			/** Load the roster. An empty roster is a valid deployment, not a failure. */
			async load() {
				if (this.store.getSnapshot().status === "loading") return;
				this.set({
					status: "loading",
					error: null
				});
				let value;
				try {
					const result = await this.api.subagentPresets.list({});
					if (!result.ok) {
						this.set({
							status: "error",
							error: result.error.message
						});
						return;
					}
					value = result.value;
				} catch (error) {
					this.set({
						status: "error",
						error: messageOf(error)
					});
					return;
				}
				const { subagents, authorable, hasDocument } = value;
				if (subagents.length === 0) {
					this.set({
						status: "unavailable",
						rows: [],
						authorable,
						hasDocument,
						create: null,
						edit: null
					});
					return;
				}
				const revealed = this.store.getSnapshot().revealedPaths;
				const kept = Object.fromEntries(Object.entries(revealed).filter(([id]) => subagents.some((subagent) => subagent.id === id)));
				this.set({
					status: "ready",
					error: null,
					authorable,
					hasDocument,
					rows: subagents.map((subagent) => ({ ...subagent })),
					revealedPaths: kept
				});
			}
			/** Open the create/copy dialog over one subagent. */
			beginCreate(from) {
				const row = this.store.getSnapshot().rows.find((candidate) => candidate.id === from);
				this.set({
					error: null,
					create: {
						from,
						fromTitle: row?.id ?? from,
						id: "",
						saving: false,
						error: null
					}
				});
			}
			/** Close the create dialog, discarding whatever was typed. */
			cancelCreate() {
				this.set({ create: null });
			}
			/** Name the subagent the create makes. */
			setCreateId(id) {
				this.patchCreate({
					id,
					error: null
				});
			}
			/** Submit the create, re-read the roster, then open the new subagent's files. */
			async confirmCreate() {
				const draft = this.store.getSnapshot().create;
				if (draft === null || draft.saving) return;
				if (createBlocker(draft, this.store.getSnapshot().rows) !== void 0) return;
				this.patchCreate({
					saving: true,
					error: null
				});
				try {
					const result = await this.api.subagentPresets.create({
						from: draft.from,
						subagent: draft.id
					});
					if (!result.ok) {
						this.patchCreate({
							saving: false,
							error: result.error.message
						});
						return;
					}
					this.set({ create: null });
					await this.load();
					this.rosterChanged();
					await this.openLocation(draft.id);
				} catch (error) {
					this.patchCreate({
						saving: false,
						error: messageOf(error)
					});
				}
			}
			/** Open one subagent's directory on the host desktop, or reveal its path. */
			async openLocation(id) {
				try {
					const result = await this.api.subagentPresets.openDocument({ subagent: id });
					if (!result.ok) {
						this.set({ error: result.error.message });
						return;
					}
					if (result.value.opened) return;
					const { path } = result.value;
					this.set({ revealedPaths: {
						...this.store.getSnapshot().revealedPaths,
						[id]: path
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/**
			* Toggle one subagent's enabled switch on the row.
			*
			* The toggle is now an enabled-only metadata write through `update` (the
			* wire-level `toggle` method was removed): the host routes it to the
			* enabled-only path that leaves the row's other metadata intact, writing a
			* shipped subagent's override rather than its install.
			*/
			async toggle(id, enabled) {
				try {
					const result = await this.api.subagentPresets.update({
						subagent: id,
						metadata: { enabled }
					});
					if (!result.ok) {
						this.set({ error: result.error.message });
						return;
					}
					await this.load();
					this.rosterChanged();
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/** Open the read-only viewer over one subagent's composition. */
			async beginView(id) {
				const row = this.store.getSnapshot().rows.find((candidate) => candidate.id === id);
				this.set({
					error: null,
					view: null
				});
				try {
					const result = await this.api.subagentPresets.read({ subagent: id });
					if (!result.ok) {
						this.set({ error: result.error.message });
						return;
					}
					this.set({ view: {
						id,
						title: row?.id ?? id,
						content: result.value.content
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/** Close the read-only viewer. */
			closeView() {
				this.set({ view: null });
			}
			/** Open the edit dialog over one locally authored subagent. */
			async beginEdit(id) {
				const row = this.store.getSnapshot().rows.find((candidate) => candidate.id === id);
				this.set({
					error: null,
					edit: null
				});
				try {
					const [editableResult, modelsResponse] = await Promise.all([this.api.subagentPresets.readEditable({ subagent: id }), this.api.llm.models({})]);
					if (!editableResult.ok) {
						this.set({ error: editableResult.error.message });
						return;
					}
					const value = editableResult.value;
					const groups = modelsResponse.result.ok ? modelChoicesFrom(modelsResponse.result.value.groups) : [];
					this.set({ edit: {
						id,
						title: row?.id ?? id,
						metadata: {
							description: value.metadata.description ?? "",
							...value.metadata.model === void 0 ? {} : { model: value.metadata.model },
							...value.metadata.enabled === void 0 ? {} : { enabled: value.metadata.enabled },
							inheritParent: value.metadata.inheritParent === true
						},
						...value.persona === void 0 ? {} : { persona: value.persona.text },
						tools: value.tools.map(toolToDraft),
						catalog: value.catalog.map(catalogToDraft),
						modelChoices: groups,
						installTools: /* @__PURE__ */ new Set(),
						removeTools: /* @__PURE__ */ new Set(),
						saving: false,
						error: null
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/** Close the edit dialog, discarding whatever was typed. */
			cancelEdit() {
				this.set({ edit: null });
			}
			/**
			* Stage one edit field.
			*
			* Scopes: `name`, `description`, and `persona` take `value`; `inheritParent`
			* takes the checkbox's boolean; `tools:<row id>` takes `disabled` (the
			* checkbox checked state inverts it); `catalog:<package name>` takes
			* `install`/`remove` to stage installing or removing an available-tools
			* package.
			*/
			setEditField(scope, field, value) {
				const { edit } = this.store.getSnapshot();
				if (edit === null) return;
				if (scope === "persona") {
					this.patchEdit({
						persona: String(value),
						error: null
					});
					return;
				}
				if (scope === "description") {
					this.patchEdit({
						metadata: {
							...edit.metadata,
							description: String(value)
						},
						error: null
					});
					return;
				}
				if (scope === "inheritParent") {
					this.patchEdit({
						metadata: {
							...edit.metadata,
							inheritParent: value === true
						},
						error: null
					});
					return;
				}
				if (scope === "model") {
					const decoded = modelOptionDecode(String(value));
					this.patchEdit({
						metadata: {
							...edit.metadata,
							...decoded === void 0 ? {} : { model: decoded }
						},
						error: null
					});
					return;
				}
				if (scope.startsWith("tools:")) {
					const id = scope.slice(6);
					this.patchEdit({
						tools: edit.tools.map((tool) => tool.id === id ? {
							...tool,
							disabled: value !== true
						} : tool),
						error: null
					});
					return;
				}
				if (scope.startsWith("catalog:")) {
					const name = scope.slice(8);
					const nextInstall = new Set(edit.installTools);
					const nextRemove = new Set(edit.removeTools);
					if (field === "install") {
						if (value === true) nextInstall.add(name);
						else nextInstall.delete(name);
						nextRemove.delete(name);
					} else if (field === "remove") {
						if (value === true) nextRemove.add(name);
						else nextRemove.delete(name);
						nextInstall.delete(name);
					}
					this.patchEdit({
						installTools: nextInstall,
						removeTools: nextRemove,
						error: null
					});
				}
			}
			/** Save the edit dialog's staged fields, then re-read the roster. */
			async confirmEdit() {
				const { edit } = this.store.getSnapshot();
				if (edit === null || edit.saving) return;
				this.patchEdit({
					saving: true,
					error: null
				});
				try {
					const tools = Object.fromEntries(edit.tools.filter((tool) => tool.disabled !== "expr").map((tool) => [tool.id, { disabled: tool.disabled === true }]));
					const installTools = [...edit.installTools].filter((name) => !edit.catalog.some((entry) => entry.name === name && entry.installed));
					const removeRowIds = [...edit.removeTools].map((name) => edit.tools.find((tool) => tool.name === name)?.id).filter((id) => id !== void 0);
					const metadata = {
						description: edit.metadata.description,
						...edit.metadata.model === void 0 ? {} : { model: edit.metadata.model },
						...edit.metadata.enabled === void 0 ? {} : { enabled: edit.metadata.enabled },
						...edit.metadata.inheritParent ? { inheritParent: true } : {}
					};
					const result = await this.api.subagentPresets.update({
						subagent: edit.id,
						...edit.persona === void 0 ? {} : { persona: { text: edit.persona } },
						...Object.keys(tools).length === 0 ? {} : { tools },
						...installTools.length === 0 ? {} : { installTools },
						...removeRowIds.length === 0 ? {} : { removeTools: removeRowIds },
						metadata
					});
					if (!result.ok) {
						this.patchEdit({
							saving: false,
							error: result.error.message
						});
						return;
					}
					this.set({ edit: null });
					await this.load();
					this.rosterChanged();
				} catch (error) {
					this.patchEdit({
						saving: false,
						error: messageOf(error)
					});
				}
			}
			/** Ask for confirmation before deleting one subagent. */
			confirmDelete(id) {
				if (this.store.getSnapshot().deleting) return;
				this.set({ pendingDelete: id });
			}
			/** Delete the subagent awaiting confirmation, then re-read the roster. */
			async remove() {
				const { pendingDelete, deleting } = this.store.getSnapshot();
				if (pendingDelete === null || deleting) return;
				this.set({
					deleting: true,
					error: null
				});
				try {
					const result = await this.api.subagentPresets.remove({ subagent: pendingDelete });
					if (!result.ok) {
						this.set({
							deleting: false,
							pendingDelete: null,
							error: result.error.message
						});
						return;
					}
					this.set({
						deleting: false,
						pendingDelete: null
					});
					await this.load();
					this.rosterChanged();
				} catch (error) {
					this.set({
						deleting: false,
						pendingDelete: null,
						error: messageOf(error)
					});
				}
			}
		};
		/**
		* Map one wire tool row to its staged draft.
		* @param row - the tool row the host returned.
		* @returns the draft a form toggles.
		*/
		function toolToDraft(row) {
			return {
				id: row.id,
				name: row.name,
				disabled: row.disabled,
				...row.description === void 0 ? {} : { description: row.description }
			};
		}
		/**
		* Map one wire catalog entry to its staged draft.
		* @param row - the catalog entry the host returned.
		* @returns the draft a form offers for adding/removing.
		*/
		function catalogToDraft(row) {
			return {
				name: row.name,
				toolNames: row.toolNames,
				...row.description === void 0 ? {} : { description: row.description },
				installed: row.installed
			};
		}
		//#endregion
		//#region \0dsh-css:bundle/subagent/src/ui/SubagentPresetSection.module.css.mjs
		const css = "._52rPSG_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}._52rPSG_title{margin:0;font-size:18px;font-weight:600}._52rPSG_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}._52rPSG_cards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}._52rPSG_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;transition:border-color .16s,background .16s;display:flex}._52rPSG_card:hover{border-color:var(--dsw-alias-label-dimmed)}._52rPSG_cardBroken,._52rPSG_cardBroken:hover{border-color:var(--dsw-alias-state-error-primary)}._52rPSG_cardHead{flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px 0;display:flex}._52rPSG_cardName{font-size:15px;font-weight:600;line-height:1.4}._52rPSG_badge,._52rPSG_brokenBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}._52rPSG_badge{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}._52rPSG_brokenBadge{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3)}._52rPSG_headSpacer{margin-left:auto}._52rPSG_toggle{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:999px;flex:none;width:34px;height:20px;transition:background .16s,border-color .16s;position:relative}._52rPSG_toggle:after{content:\"\";background:var(--dsw-alias-label-dimmed);border-radius:50%;width:14px;height:14px;transition:transform .16s,background .16s;position:absolute;top:2px;left:2px}._52rPSG_toggle:checked{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._52rPSG_toggle:checked:after{background:var(--dsw-alias-bg-layer-3);transform:translate(14px)}._52rPSG_toggle:disabled{opacity:.5;cursor:default}._52rPSG_cardDesc{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;padding:6px 16px 0;font-size:13px;line-height:1.55}._52rPSG_cardId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-dimmed);padding:6px 16px 0;font-size:11px}._52rPSG_cardFoot{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;gap:2px;margin-top:8px;padding:6px 10px 8px;display:flex}._52rPSG_iconButton{appearance:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;align-items:center;padding:6px;display:inline-flex;position:relative}._52rPSG_iconButton:disabled{opacity:.4;cursor:default}._52rPSG_iconButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}._52rPSG_iconButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}._52rPSG_iconDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}._52rPSG_editorBlock{flex-direction:column;gap:10px;padding-top:4px;display:flex}._52rPSG_blockTitle{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;font-weight:600}._52rPSG_toolRow{grid-template-columns:34px minmax(0,1fr) auto auto;align-items:center;gap:8px;width:100%;display:grid}._52rPSG_toolState{color:var(--dsw-alias-label-dimmed);border:1px solid var(--dsw-alias-border-l2);white-space:nowrap;border-radius:999px;padding:3px 8px;font-size:11px;line-height:1}._52rPSG_toolId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}._52rPSG_toolExpr{color:var(--dsw-alias-label-dimmed);white-space:nowrap;font-size:11px}._52rPSG_toolInfo{position:relative}._52rPSG_toolInfoSummary{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:20px;height:20px;color:var(--dsw-alias-label-dimmed);user-select:none;border-radius:50%;justify-content:center;align-items:center;font-size:11px;font-weight:600;line-height:1;list-style:none;transition:color .16s,border-color .16s;display:flex}._52rPSG_toolInfoSummary:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._52rPSG_toolInfoSummary::marker,._52rPSG_toolInfoSummary::-webkit-details-marker{display:none}._52rPSG_toolInfoBody{z-index:10;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:8px;width:min(320px,70vw);padding:10px 12px;position:absolute;top:calc(100% + 6px);right:0;box-shadow:0 4px 16px #0000001f}._52rPSG_toolInfoSpacer{width:20px}._52rPSG_toolDesc{font-size:12px;line-height:1.5}._52rPSG_viewer{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);max-height:420px;font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;border-radius:10px;margin:0;padding:12px;font-size:12px;line-height:1.5;overflow:auto}._52rPSG_creatorButton{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l3);height:44px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:12px;justify-content:center;align-self:stretch;align-items:center;gap:6px;font-size:14px;line-height:22px;display:flex}._52rPSG_creatorButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._52rPSG_creatorButton:disabled{opacity:.4;cursor:default}._52rPSG_field{flex-direction:column;gap:6px;display:flex}._52rPSG_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}._52rPSG_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 12px;font-size:13px}._52rPSG_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}._52rPSG_textarea{resize:vertical;min-height:96px;font-family:inherit;line-height:1.5}._52rPSG_input::placeholder{color:var(--dsw-alias-label-dimmed)}._52rPSG_select{appearance:none;cursor:pointer}._52rPSG_toggleField{flex-direction:row;justify-content:space-between;align-items:center;gap:8px}._52rPSG_inheritRow{cursor:pointer;align-items:center;gap:10px;display:flex}._52rPSG_inheritLabel{color:var(--dsw-alias-label-primary);font-size:13px}._52rPSG_fieldHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}._52rPSG_dialog{width:min(560px,100%)}._52rPSG_dialogScroll{max-height:min(80vh,640px);overflow:auto}._52rPSG_dialogFields{flex-direction:column;gap:12px;display:flex}._52rPSG_deleteDialog{width:min(480px,100%)}._52rPSG_deleteConfirm:not(:disabled){border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}._52rPSG_deleteConfirm:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}._52rPSG_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px}._52rPSG_revealedPath{color:var(--dsw-alias-label-tertiary);align-items:baseline;gap:6px;margin:0;padding:0 16px 10px;font-size:11px;display:flex}._52rPSG_revealedPath code{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary);user-select:all;overflow-wrap:anywhere}._52rPSG_revealedPathLabel{white-space:nowrap}";
		const tagId = "dsh-harness-subagent-bundle/SubagentPresetSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-subagent-bundle";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SubagentPresetSection_module_css_default = {
			"cardFoot": "_52rPSG_cardFoot",
			"revealedPath": "_52rPSG_revealedPath",
			"title": "_52rPSG_title",
			"cards": "_52rPSG_cards",
			"editorBlock": "_52rPSG_editorBlock",
			"fieldLabel": "_52rPSG_fieldLabel",
			"toggleField": "_52rPSG_toggleField",
			"dialog": "_52rPSG_dialog",
			"creatorButton": "_52rPSG_creatorButton",
			"toolState": "_52rPSG_toolState",
			"intro": "_52rPSG_intro",
			"badge": "_52rPSG_badge",
			"cardName": "_52rPSG_cardName",
			"headSpacer": "_52rPSG_headSpacer",
			"cardDesc": "_52rPSG_cardDesc",
			"toolInfoSpacer": "_52rPSG_toolInfoSpacer",
			"select": "_52rPSG_select",
			"deleteConfirm": "_52rPSG_deleteConfirm",
			"revealedPathLabel": "_52rPSG_revealedPathLabel",
			"toggle": "_52rPSG_toggle",
			"fieldHint": "_52rPSG_fieldHint",
			"toolInfo": "_52rPSG_toolInfo",
			"dialogFields": "_52rPSG_dialogFields",
			"blockTitle": "_52rPSG_blockTitle",
			"toolInfoBody": "_52rPSG_toolInfoBody",
			"viewer": "_52rPSG_viewer",
			"cardHead": "_52rPSG_cardHead",
			"iconButton": "_52rPSG_iconButton",
			"iconDanger": "_52rPSG_iconDanger",
			"brokenBadge": "_52rPSG_brokenBadge",
			"cardBroken": "_52rPSG_cardBroken",
			"toolExpr": "_52rPSG_toolExpr",
			"field": "_52rPSG_field",
			"textarea": "_52rPSG_textarea",
			"dialogScroll": "_52rPSG_dialogScroll",
			"error": "_52rPSG_error",
			"section": "_52rPSG_section",
			"inheritRow": "_52rPSG_inheritRow",
			"toolInfoSummary": "_52rPSG_toolInfoSummary",
			"card": "_52rPSG_card",
			"toolId": "_52rPSG_toolId",
			"toolDesc": "_52rPSG_toolDesc",
			"inheritLabel": "_52rPSG_inheritLabel",
			"deleteDialog": "_52rPSG_deleteDialog",
			"input": "_52rPSG_input",
			"cardId": "_52rPSG_cardId",
			"toolRow": "_52rPSG_toolRow"
		};
		//#endregion
		//#region lib/types/ui/SubagentPresetSection.js
		/**
		* Subagents settings section: the independent "子代理" roster as cards, with
		* a create/copy dialog, a row-level enable/disable switch, an edit dialog over
		* the metadata fields, delete, and open-directory.
		*
		* This section reads the subagent registry — fully separate from the
		* agent-preset section — so the two rosters never mix. A shipped (system)
		* subagent is read-only: it cannot be toggled, edited, or deleted.
		*/
		/** A one-card row rendering a subagent's identity, mode, Auto Run, and switch. */
		function SubagentRowView(props) {
			const { row, t, onToggle, onView, onEdit, onDelete, onOpen, hasDocument, revealedPath } = props;
			const custom = row.trust === "user";
			const broken = row.broken !== void 0;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: `${SubagentPresetSection_module_css_default.card} ${broken ? SubagentPresetSection_module_css_default.cardBroken : ""}`,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: SubagentPresetSection_module_css_default.cardHead,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.cardName,
								children: row.id
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.badge,
								children: custom ? t("userTrust") : t("systemTrust")
							}),
							broken ? (0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.brokenBadge,
								children: t("brokenBadge")
							}) : null,
							(0, react_jsx_runtime.jsx)("span", { className: SubagentPresetSection_module_css_default.headSpacer }),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: row.metadata.enabled !== false ? t("enabled") : t("disabled"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									className: SubagentPresetSection_module_css_default.toggle,
									checked: row.metadata.enabled !== false,
									disabled: broken,
									onChange: (e) => onToggle(row.id, e.target.checked)
								})
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: SubagentPresetSection_module_css_default.cardDesc,
						children: row.metadata.description ?? t("noDescription")
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: SubagentPresetSection_module_css_default.cardId,
						children: row.id
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: SubagentPresetSection_module_css_default.cardFoot,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("view"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SubagentPresetSection_module_css_default.iconButton,
									onClick: () => onView(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("edit"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SubagentPresetSection_module_css_default.iconButton,
									disabled: !custom,
									onClick: () => onEdit(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("delete"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${SubagentPresetSection_module_css_default.iconButton} ${SubagentPresetSection_module_css_default.iconDanger}`,
									disabled: !custom,
									onClick: () => onDelete(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: hasDocument ? t("openLocation") : t("showLocation"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SubagentPresetSection_module_css_default.iconButton,
									onClick: () => onOpen(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16, {})
								})
							})
						]
					}),
					revealedPath !== void 0 ? (0, react_jsx_runtime.jsxs)("p", {
						className: SubagentPresetSection_module_css_default.revealedPath,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.revealedPathLabel,
								children: t("revealedPathLabel")
							}),
							" ",
							(0, react_jsx_runtime.jsx)("code", { children: revealedPath })
						]
					}) : null
				]
			});
		}
		/** The create/copy dialog. */
		function CreateDialog(props) {
			const { state, t, setCreateId, confirm, cancel } = props;
			const draft = state.create;
			if (draft === null) return null;
			const blocker = createBlocker(draft, state.rows);
			const message = draft.error ?? (blocker === void 0 ? null : t(blocker));
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: cancel,
				title: t("createTitle"),
				closeLabel: t("close"),
				description: t("createIntro"),
				className: SubagentPresetSection_module_css_default.dialog,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: draft.saving,
					onClick: cancel,
					children: t("cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: draft.saving || blocker !== void 0,
					onClick: confirm,
					children: draft.saving ? t("creating") : t("create")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentPresetSection_module_css_default.dialogFields,
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							className: SubagentPresetSection_module_css_default.field,
							children: (0, react_jsx_runtime.jsxs)("span", {
								className: SubagentPresetSection_module_css_default.fieldLabel,
								children: [
									t("copyOf"),
									": ",
									draft.fromTitle
								]
							})
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: SubagentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.fieldLabel,
								children: t("idLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: SubagentPresetSection_module_css_default.input,
								value: draft.id,
								placeholder: t("idPlaceholder"),
								onChange: (e) => setCreateId(e.target.value)
							})]
						}),
						message !== null ? (0, react_jsx_runtime.jsx)("p", {
							className: SubagentPresetSection_module_css_default.error,
							children: message
						}) : null
					]
				})
			});
		}
		/** The read-only composition viewer. */
		function ViewDialog(props) {
			const { view, t, close } = props;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: close,
				title: `${t("viewTitle")}: ${view.title}`,
				closeLabel: t("close"),
				description: t("viewIntro"),
				className: SubagentPresetSection_module_css_default.dialog,
				contentClassName: SubagentPresetSection_module_css_default.dialogScroll,
				footer: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: close,
					children: t("close")
				}),
				children: (0, react_jsx_runtime.jsx)("pre", {
					className: SubagentPresetSection_module_css_default.viewer,
					children: view.content
				})
			});
		}
		/** The metadata edit dialog. */
		function EditDialog(props) {
			const { edit, t, setEditField, confirm, cancel } = props;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: cancel,
				title: `${t("editTitle")}: ${edit.title}`,
				closeLabel: t("close"),
				description: t("editIntro"),
				className: SubagentPresetSection_module_css_default.dialog,
				contentClassName: SubagentPresetSection_module_css_default.dialogScroll,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: edit.saving,
					onClick: cancel,
					children: t("cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: edit.saving,
					onClick: confirm,
					children: edit.saving ? t("saving") : t("save")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentPresetSection_module_css_default.dialogFields,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: SubagentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.fieldLabel,
								children: t("descriptionLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: SubagentPresetSection_module_css_default.input,
								value: edit.metadata.description,
								placeholder: t("descriptionPlaceholder"),
								onChange: (e) => setEditField("description", "value", e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: SubagentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.fieldLabel,
								children: t("personaLabel")
							}), (0, react_jsx_runtime.jsx)("textarea", {
								className: `${SubagentPresetSection_module_css_default.input} ${SubagentPresetSection_module_css_default.textarea}`,
								value: edit.persona ?? "",
								placeholder: t("personaPlaceholder"),
								onChange: (e) => setEditField("persona", "value", e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: SubagentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.fieldLabel,
								children: t("model")
							}), (0, react_jsx_runtime.jsxs)("select", {
								className: `${SubagentPresetSection_module_css_default.input} ${SubagentPresetSection_module_css_default.select}`,
								value: edit.metadata.model === void 0 ? "" : modelOptionValue(edit.metadata.model),
								onChange: (e) => setEditField("model", "value", e.target.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("inheritModel")
								}), edit.modelChoices.map((group) => (0, react_jsx_runtime.jsx)("optgroup", {
									label: group.providerName,
									children: group.models.map((model) => (0, react_jsx_runtime.jsx)("option", {
										value: modelOptionValue({
											provider: group.provider,
											model: model.id
										}),
										children: model.name
									}, `${group.provider}\u0000${model.id}`))
								}, group.provider))]
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: SubagentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsxs)("label", {
								className: SubagentPresetSection_module_css_default.inheritRow,
								children: [(0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									role: "switch",
									className: SubagentPresetSection_module_css_default.toggle,
									checked: edit.metadata.inheritParent,
									onChange: (e) => setEditField("inheritParent", "value", e.target.checked)
								}), (0, react_jsx_runtime.jsx)("span", {
									className: SubagentPresetSection_module_css_default.inheritLabel,
									children: t("inheritParentLabel")
								})]
							}), (0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.fieldHint,
								children: t("inheritParentHint")
							})]
						}),
						edit.catalog.length === 0 ? null : (0, react_jsx_runtime.jsxs)("section", {
							className: SubagentPresetSection_module_css_default.editorBlock,
							children: [(0, react_jsx_runtime.jsx)("h4", {
								className: SubagentPresetSection_module_css_default.blockTitle,
								children: t("toolsTitle")
							}), edit.catalog.map((entry) => (0, react_jsx_runtime.jsx)(ToolRowView, {
								entry,
								edit,
								t,
								setEditField
							}, entry.name))]
						}),
						edit.error !== null ? (0, react_jsx_runtime.jsx)("p", {
							className: SubagentPresetSection_module_css_default.error,
							children: edit.error
						}) : null
					]
				})
			});
		}
		/** A collapsible detail disclosure rendered as an info marker after a row. */
		function ToolInfo({ title, children }) {
			return (0, react_jsx_runtime.jsxs)("details", {
				className: SubagentPresetSection_module_css_default.toolInfo,
				children: [(0, react_jsx_runtime.jsx)("summary", {
					className: SubagentPresetSection_module_css_default.toolInfoSummary,
					"aria-label": `${title}: 详情`,
					title,
					children: "!"
				}), (0, react_jsx_runtime.jsx)("div", {
					className: SubagentPresetSection_module_css_default.toolInfoBody,
					children
				})]
			});
		}
		/** One available-tool catalog row: one switch + id + state + info marker. */
		function ToolRowView({ entry, edit, t, setEditField }) {
			const scope = `catalog:${entry.name}`;
			if (entry.installed) {
				const toggleable = edit.tools.find((candidate) => candidate.name === entry.name)?.disabled !== "expr";
				return (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentPresetSection_module_css_default.toolRow,
					children: [
						(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							role: "switch",
							"aria-label": entry.name,
							className: SubagentPresetSection_module_css_default.toggle,
							checked: edit.removeTools.has(entry.name) === false,
							disabled: !toggleable,
							onChange: (event) => {
								setEditField(scope, "remove", !event.target.checked);
							}
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: SubagentPresetSection_module_css_default.toolId,
							children: entry.name
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: SubagentPresetSection_module_css_default.toolState,
							children: t("toolInstalled")
						}),
						!toggleable ? (0, react_jsx_runtime.jsx)("span", {
							className: SubagentPresetSection_module_css_default.toolExpr,
							children: t("toolExprDisabled")
						}) : null,
						entry.description === void 0 ? (0, react_jsx_runtime.jsx)("span", { className: SubagentPresetSection_module_css_default.toolInfoSpacer }) : (0, react_jsx_runtime.jsx)(ToolInfo, {
							title: entry.name,
							children: (0, react_jsx_runtime.jsx)("span", {
								className: SubagentPresetSection_module_css_default.toolDesc,
								children: entry.description
							})
						})
					]
				});
			}
			return (0, react_jsx_runtime.jsxs)("div", {
				className: SubagentPresetSection_module_css_default.toolRow,
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						role: "switch",
						"aria-label": entry.name,
						className: SubagentPresetSection_module_css_default.toggle,
						checked: edit.installTools.has(entry.name),
						onChange: (event) => {
							setEditField(scope, "install", event.target.checked);
						}
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: SubagentPresetSection_module_css_default.toolId,
						children: entry.name
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: SubagentPresetSection_module_css_default.toolState,
						children: t("toolUninstalled")
					}),
					entry.description === void 0 ? (0, react_jsx_runtime.jsx)("span", { className: SubagentPresetSection_module_css_default.toolInfoSpacer }) : (0, react_jsx_runtime.jsx)(ToolInfo, {
						title: entry.name,
						children: (0, react_jsx_runtime.jsx)("span", {
							className: SubagentPresetSection_module_css_default.toolDesc,
							children: entry.description
						})
					})
				]
			});
		}
		/**
		* Render the Subagents section content column.
		* @param props - composed slot props.
		* @returns the section, or null when the deployment composes no subagents.
		*/
		function SubagentPresetSection(props) {
			const { useSubagentSection, t, load } = props;
			const state = useSubagentSection((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				if (state.status === "idle") load();
			}, [state.status, load]);
			if (state.status === "loading") return (0, react_jsx_runtime.jsx)("div", { children: t("loading") });
			if (state.status === "error") return (0, react_jsx_runtime.jsx)("div", {
				style: { color: "var(--dsw-alias-state-error-primary)" },
				children: t("error")
			});
			if (state.status === "unavailable") return (0, react_jsx_runtime.jsx)("div", { children: t("unavailable") });
			if (state.status !== "ready") return null;
			const factory = state.rows.find((row) => row.trust === "system");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: SubagentPresetSection_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: SubagentPresetSection_module_css_default.title,
						children: t("nav")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: SubagentPresetSection_module_css_default.intro,
						children: t("sectionIntro")
					}),
					(0, react_jsx_runtime.jsx)("ul", {
						className: SubagentPresetSection_module_css_default.cards,
						children: state.rows.map((row) => (0, react_jsx_runtime.jsx)(SubagentRowView, {
							row,
							t,
							onToggle: props.toggle,
							onView: props.beginView,
							onEdit: props.beginEdit,
							onDelete: props.confirmDelete,
							onOpen: props.openLocation,
							hasDocument: state.hasDocument,
							revealedPath: state.revealedPaths[row.id]
						}, row.id))
					}),
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: SubagentPresetSection_module_css_default.creatorButton,
						disabled: !state.authorable || factory === void 0,
						onClick: () => factory !== void 0 && props.beginCreate(factory.id),
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("create")]
					}),
					(0, react_jsx_runtime.jsx)(CreateDialog, {
						state,
						t,
						setCreateId: props.setCreateId,
						confirm: () => void props.confirmCreate(),
						cancel: props.cancelCreate
					}),
					state.view !== null ? (0, react_jsx_runtime.jsx)(ViewDialog, {
						view: state.view,
						t,
						close: props.closeView
					}) : null,
					state.edit !== null ? (0, react_jsx_runtime.jsx)(EditDialog, {
						edit: state.edit,
						t,
						setEditField: props.setEditField,
						confirm: () => void props.confirmEdit(),
						cancel: props.cancelEdit
					}) : null,
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.pendingDelete !== null,
						onClose: () => props.confirmDelete(null),
						title: t("deleteTitle"),
						closeLabel: t("close"),
						description: t("deleteDescription"),
						className: SubagentPresetSection_module_css_default.deleteDialog,
						footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: state.deleting,
							onClick: () => props.confirmDelete(null),
							children: t("cancel")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: SubagentPresetSection_module_css_default.deleteConfirm,
							disabled: state.deleting,
							onClick: () => void props.remove(),
							children: state.deleting ? t("deleting") : t("deleteConfirm")
						})] }),
						children: t("deleteDescription")
					})
				]
			});
		}
		//#endregion
		//#region lib/types/ui/wire-client.js
		/**
		* Browser transport for the subagent-management wire channel.
		*
		* The withdrawn apiproxy `subagentPreset.*` domain reached the browser as
		* methods on the shared `IApiClient`; that domain now lives on the connection's
		* dedicated `/subagent-preset` channel, so this module adapts
		* {@link ClientConnectionRpc.call} into the same management surface the section
		* controller consumes. Each method mints the payload the Host handler
		* validates against its zod schema and returns the Host's `RpcResult` — the
		* same success/failure shape the withdrawn `IApiClient` methods returned
		* (minus the echoed rpcId, which the section never used).
		* @module dsh-harness-subagent-bundle/ui/wire-client
		*/
		/** Absolute logical channel the Host serves subagent management on. */
		const SUBAGENT_PRESET_CHANNEL = "/subagent-preset";
		/** Build the management wire face over one connection RPC caller. */
		function createSubagentPresetWire(rpc) {
			return {
				list: (payload, signal) => call("list", payload, signal),
				read: (payload, signal) => call("read", payload, signal),
				create: (payload, signal) => call("create", payload, signal),
				openDocument: (payload, signal) => call("openDocument", payload, signal),
				remove: (payload, signal) => call("remove", payload, signal),
				readEditable: (payload, signal) => call("readEditable", payload, signal),
				update: (payload, signal) => call("update", payload, signal)
			};
			/** Call one endpoint, returning the caller's declared result type. */
			function call(endpoint, payload, signal) {
				return rpc.call(SUBAGENT_PRESET_CHANNEL, endpoint, payload, signal);
			}
		}
		//#endregion
		//#region lib/types/ui/locales.js
		/** Locale bundles for the user-defined subagent settings section. */
		/** English copy. */
		const en = {
			nav: "Subagents",
			sectionIntro: "Subagents are your own helper agents, stored independently from agent presets. A main agent can delegate to an enabled subagent by name. Each subagent is a plugin tree — its persona, tools, and prompt sections — that is mounted onto the delegated child.",
			loading: "Loading subagents…",
			error: "Could not load subagents.",
			unavailable: "No user-defined subagents yet. Create one to delegate work to a custom helper.",
			userTrust: "Custom",
			systemTrust: "Built-in",
			enabled: "Enabled",
			disabled: "Disabled",
			brokenBadge: "Failed to load",
			create: "Create",
			creating: "Creating…",
			createTitle: "Create subagent",
			createIntro: "The whole subagent is copied on this machine. The identifier becomes its directory name and cannot be changed later; everything else is edited in the subagent's own files.",
			copyOf: "Copied from",
			delete: "Delete",
			deleteTitle: "Delete this subagent?",
			deleteDescription: "The subagent directory is deleted. A delegated child already running on it keeps working; new delegations cannot select it.",
			deleteConfirm: "Delete",
			deleting: "Deleting…",
			view: "View",
			viewTitle: "View subagent",
			viewIntro: "The composition this subagent mounts when delegated. Read-only.",
			edit: "Edit",
			editTitle: "Edit subagent",
			editIntro: "Changes apply to delegations from now on; a child already running keeps the composition it began with.",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			close: "Close",
			idLabel: "Identifier",
			idPlaceholder: "The id the main agent refers to it by",
			descriptionLabel: "Description",
			descriptionPlaceholder: "One sentence on what this subagent is for",
			personaLabel: "Persona",
			personaPlaceholder: "Who this subagent is and how it works",
			inheritParentLabel: "Inherit the main agent",
			inheritParentHint: "When on, the delegated child layers this subagent on top of the main agent's tools and prompt. When off, the child uses only this subagent's own configuration.",
			toolsTitle: "Tools",
			toolsLabel: "Tools",
			toolInstalled: "Enabled",
			toolUninstalled: "Not enabled",
			toolExprDisabled: "Locked by the deployment",
			model: "Model",
			inheritModel: "Inherit parent (default)",
			openLocation: "Open folder",
			showLocation: "Show location",
			revealedPathLabel: "Subagent files:",
			idRequired: "Give the subagent an identifier.",
			idInvalid: "Use lowercase letters, digits, and hyphens, starting with a letter or digit.",
			idTaken: "A subagent with this identifier already exists.",
			noDescription: "No description."
		};
		/** Simplified Chinese copy. */
		const zh = {
			nav: "子代理",
			sectionIntro: "子代理是你自定义的帮手 Agent，与 Agent 预设完全分开存储。主 Agent 可按名称把工作委派给已启用的子代理。每个子代理即一棵插件树 —— 它的人设、工具与提示词段 —— 在委派时挂到派出的子 Agent 上。",
			loading: "正在加载子代理…",
			error: "无法加载子代理。",
			unavailable: "还没有自定义子代理。创建一个，即可把工作委派给自定义帮手。",
			userTrust: "自定义",
			systemTrust: "内置",
			enabled: "已启用",
			disabled: "已停用",
			brokenBadge: "加载失败",
			create: "创建",
			creating: "正在创建…",
			createTitle: "创建子代理",
			createIntro: "整个子代理会在本机复制一份。标识符将成为目录名，事后无法更改；其余内容之后直接在子代理自己的文件里编辑。",
			copyOf: "复制自",
			delete: "删除",
			deleteTitle: "删除该子代理？",
			deleteDescription: "子代理目录将被删除。已在其上运行的委派子 Agent 不受影响；新委派将无法再选择它。",
			deleteConfirm: "删除",
			deleting: "正在删除…",
			view: "查看",
			viewTitle: "查看子代理",
			viewIntro: "该子代理被委派时挂载的插件树内容。只读。",
			edit: "编辑",
			editTitle: "编辑子代理",
			editIntro: "改动对此后发起的委派生效；已在运行的子 Agent 保持它开始时的组装。",
			save: "保存",
			saving: "正在保存…",
			cancel: "取消",
			close: "关闭",
			idLabel: "标识符",
			idPlaceholder: "主 agent 按此标识符引用它",
			descriptionLabel: "描述",
			descriptionPlaceholder: "一句话说明该子代理的用途",
			personaLabel: "人设",
			personaPlaceholder: "这个子代理是谁、该怎么干活",
			inheritParentLabel: "继承主 agent",
			inheritParentHint: "开启后，派出的子 agent 在主 agent 的工具和提示词之上叠加本子代理自己的配置；关闭后仅使用本子代理自己的配置。",
			toolsTitle: "工具",
			toolsLabel: "工具",
			toolInstalled: "已启用",
			toolUninstalled: "未启用",
			toolExprDisabled: "部署锁定的",
			model: "模型",
			inheritModel: "继承父级（默认）",
			openLocation: "打开目录",
			showLocation: "查看路径",
			revealedPathLabel: "子代理文件：",
			idRequired: "请填写标识符。",
			idInvalid: "只能使用小写字母、数字与连字符，且以字母或数字开头。",
			idTaken: "该标识符已被占用。",
			noDescription: "暂无描述。"
		};
		//#endregion
		//#region lib/types/ui/index.js
		/**
		* User-defined subagent surface plugin, browser half — an independent
		* settings section ("子代理") parallel to the agent-preset section, over its
		* OWN roster (the subagent registry), fully separate from the agent-preset
		* list.
		*
		* The section lists every user-defined subagent with its mode, Auto Run,
		* description, and an enable/disable switch on the row, and drives create,
		* edit, delete, and open-directory through the host.
		*/
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* Mount the independent "子代理" settings section.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const { api, rpc } = ctx.get("connection");
			const section = new SubagentSectionController({
				...api,
				subagentPresets: createSubagentPresetWire(rpc)
			});
			ctx.effect(() => ctx.locale.register("settings.subagentPreset", {
				zh,
				en
			}), "ui-subagent-preset: settings section dictionary");
			ctx.effect(() => {
				const refresh = () => {
					if (section.store.getSnapshot().status !== "idle") section.load();
				};
				const disposers = [ctx.on("connection/reset", () => {
					refresh();
				})];
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, "ui-subagent-preset: roster refresh");
			const sectionInjected = () => ({
				hooks: { subagentSection: section.store },
				load: () => section.load(),
				beginCreate: (from) => {
					section.beginCreate(from);
				},
				cancelCreate: () => {
					section.cancelCreate();
				},
				setCreateId: (id) => {
					section.setCreateId(id);
				},
				confirmCreate: () => section.confirmCreate(),
				toggle: (id, enabled) => {
					section.toggle(id, enabled);
				},
				beginView: (id) => section.beginView(id),
				closeView: () => {
					section.closeView();
				},
				beginEdit: (id) => section.beginEdit(id),
				cancelEdit: () => {
					section.cancelEdit();
				},
				setEditField: (scope, field, value) => {
					section.setEditField(scope, field, value);
				},
				confirmEdit: () => section.confirmEdit(),
				openLocation: (id) => section.openLocation(id),
				confirmDelete: (id) => {
					section.confirmDelete(id);
				},
				remove: () => section.remove()
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "subagent-presets",
				order: 21,
				label: () => ctx.locale.bind("settings.subagentPreset")("nav"),
				locale: "settings.subagentPreset",
				inject: sectionInjected
			}, SubagentPresetSection));
		}
		//#endregion
		exports.SubagentSectionController = SubagentSectionController;
		exports.apply = apply;
		exports.createBlocker = createBlocker;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map