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
		const INITIAL$1 = {
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
		function messageOf$1(error) {
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
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL$1);
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
						error: messageOf$1(error)
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
						error: messageOf$1(error)
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
					this.set({ error: messageOf$1(error) });
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
					this.set({ error: messageOf$1(error) });
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
					this.set({ error: messageOf$1(error) });
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
					this.set({ error: messageOf$1(error) });
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
						error: messageOf$1(error)
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
						error: messageOf$1(error)
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
		const css$1 = "._52rPSG_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}._52rPSG_title{margin:0;font-size:18px;font-weight:600}._52rPSG_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}._52rPSG_cards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}._52rPSG_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;transition:border-color .16s,background .16s;display:flex}._52rPSG_card:hover{border-color:var(--dsw-alias-label-dimmed)}._52rPSG_cardBroken,._52rPSG_cardBroken:hover{border-color:var(--dsw-alias-state-error-primary)}._52rPSG_cardHead{flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px 0;display:flex}._52rPSG_cardName{font-size:15px;font-weight:600;line-height:1.4}._52rPSG_badge,._52rPSG_brokenBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}._52rPSG_badge{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}._52rPSG_brokenBadge{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3)}._52rPSG_headSpacer{margin-left:auto}._52rPSG_toggle{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:999px;flex:none;width:34px;height:20px;transition:background .16s,border-color .16s;position:relative}._52rPSG_toggle:after{content:\"\";background:var(--dsw-alias-label-dimmed);border-radius:50%;width:14px;height:14px;transition:transform .16s,background .16s;position:absolute;top:2px;left:2px}._52rPSG_toggle:checked{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._52rPSG_toggle:checked:after{background:var(--dsw-alias-bg-layer-3);transform:translate(14px)}._52rPSG_toggle:disabled{opacity:.5;cursor:default}._52rPSG_cardDesc{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;padding:6px 16px 0;font-size:13px;line-height:1.55}._52rPSG_cardId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-dimmed);padding:6px 16px 0;font-size:11px}._52rPSG_cardFoot{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;gap:2px;margin-top:8px;padding:6px 10px 8px;display:flex}._52rPSG_iconButton{appearance:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;align-items:center;padding:6px;display:inline-flex;position:relative}._52rPSG_iconButton:disabled{opacity:.4;cursor:default}._52rPSG_iconButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}._52rPSG_iconButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}._52rPSG_iconDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}._52rPSG_editorBlock{flex-direction:column;gap:10px;padding-top:4px;display:flex}._52rPSG_blockTitle{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;font-weight:600}._52rPSG_toolRow{grid-template-columns:34px minmax(0,1fr) auto auto;align-items:center;gap:8px;width:100%;display:grid}._52rPSG_toolState{color:var(--dsw-alias-label-dimmed);border:1px solid var(--dsw-alias-border-l2);white-space:nowrap;border-radius:999px;padding:3px 8px;font-size:11px;line-height:1}._52rPSG_toolId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}._52rPSG_toolExpr{color:var(--dsw-alias-label-dimmed);white-space:nowrap;font-size:11px}._52rPSG_toolInfo{position:relative}._52rPSG_toolInfoSummary{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:20px;height:20px;color:var(--dsw-alias-label-dimmed);user-select:none;border-radius:50%;justify-content:center;align-items:center;font-size:11px;font-weight:600;line-height:1;list-style:none;transition:color .16s,border-color .16s;display:flex}._52rPSG_toolInfoSummary:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._52rPSG_toolInfoSummary::marker,._52rPSG_toolInfoSummary::-webkit-details-marker{display:none}._52rPSG_toolInfoBody{z-index:10;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:8px;width:min(320px,70vw);padding:10px 12px;position:absolute;top:calc(100% + 6px);right:0;box-shadow:0 4px 16px #0000001f}._52rPSG_toolInfoSpacer{width:20px}._52rPSG_toolDesc{font-size:12px;line-height:1.5}._52rPSG_viewer{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);max-height:420px;font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;border-radius:10px;margin:0;padding:12px;font-size:12px;line-height:1.5;overflow:auto}._52rPSG_creatorButton{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l3);height:44px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:12px;justify-content:center;align-self:stretch;align-items:center;gap:6px;font-size:14px;line-height:22px;display:flex}._52rPSG_creatorButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._52rPSG_creatorButton:disabled{opacity:.4;cursor:default}._52rPSG_field{flex-direction:column;gap:6px;display:flex}._52rPSG_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}._52rPSG_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 12px;font-size:13px}._52rPSG_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}._52rPSG_textarea{resize:vertical;min-height:96px;font-family:inherit;line-height:1.5}._52rPSG_input::placeholder{color:var(--dsw-alias-label-dimmed)}._52rPSG_select{appearance:none;cursor:pointer}._52rPSG_toggleField{flex-direction:row;justify-content:space-between;align-items:center;gap:8px}._52rPSG_inheritRow{cursor:pointer;align-items:center;gap:10px;display:flex}._52rPSG_inheritLabel{color:var(--dsw-alias-label-primary);font-size:13px}._52rPSG_fieldHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}._52rPSG_dialog{width:min(560px,100%)}._52rPSG_dialogScroll{max-height:min(80vh,640px);overflow:auto}._52rPSG_dialogFields{flex-direction:column;gap:12px;display:flex}._52rPSG_deleteDialog{width:min(480px,100%)}._52rPSG_deleteConfirm:not(:disabled){border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}._52rPSG_deleteConfirm:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}._52rPSG_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px}._52rPSG_revealedPath{color:var(--dsw-alias-label-tertiary);align-items:baseline;gap:6px;margin:0;padding:0 16px 10px;font-size:11px;display:flex}._52rPSG_revealedPath code{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary);user-select:all;overflow-wrap:anywhere}._52rPSG_revealedPathLabel{white-space:nowrap}";
		const tagId$1 = "dsh-harness-subagent-bundle/SubagentPresetSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-subagent-bundle";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var SubagentPresetSection_module_css_default = {
			"toggleField": "_52rPSG_toggleField",
			"intro": "_52rPSG_intro",
			"headSpacer": "_52rPSG_headSpacer",
			"inheritLabel": "_52rPSG_inheritLabel",
			"cardBroken": "_52rPSG_cardBroken",
			"editorBlock": "_52rPSG_editorBlock",
			"toolInfo": "_52rPSG_toolInfo",
			"cards": "_52rPSG_cards",
			"fieldLabel": "_52rPSG_fieldLabel",
			"cardHead": "_52rPSG_cardHead",
			"toolInfoBody": "_52rPSG_toolInfoBody",
			"dialog": "_52rPSG_dialog",
			"dialogFields": "_52rPSG_dialogFields",
			"blockTitle": "_52rPSG_blockTitle",
			"input": "_52rPSG_input",
			"revealedPath": "_52rPSG_revealedPath",
			"revealedPathLabel": "_52rPSG_revealedPathLabel",
			"brokenBadge": "_52rPSG_brokenBadge",
			"badge": "_52rPSG_badge",
			"viewer": "_52rPSG_viewer",
			"cardFoot": "_52rPSG_cardFoot",
			"toolRow": "_52rPSG_toolRow",
			"fieldHint": "_52rPSG_fieldHint",
			"dialogScroll": "_52rPSG_dialogScroll",
			"cardId": "_52rPSG_cardId",
			"toolDesc": "_52rPSG_toolDesc",
			"iconButton": "_52rPSG_iconButton",
			"inheritRow": "_52rPSG_inheritRow",
			"select": "_52rPSG_select",
			"cardDesc": "_52rPSG_cardDesc",
			"toolInfoSummary": "_52rPSG_toolInfoSummary",
			"section": "_52rPSG_section",
			"card": "_52rPSG_card",
			"toolState": "_52rPSG_toolState",
			"toggle": "_52rPSG_toggle",
			"field": "_52rPSG_field",
			"deleteDialog": "_52rPSG_deleteDialog",
			"cardName": "_52rPSG_cardName",
			"title": "_52rPSG_title",
			"toolInfoSpacer": "_52rPSG_toolInfoSpacer",
			"textarea": "_52rPSG_textarea",
			"deleteConfirm": "_52rPSG_deleteConfirm",
			"iconDanger": "_52rPSG_iconDanger",
			"toolExpr": "_52rPSG_toolExpr",
			"error": "_52rPSG_error",
			"toolId": "_52rPSG_toolId",
			"creatorButton": "_52rPSG_creatorButton"
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
		function CreateDialog$1(props) {
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
					(0, react_jsx_runtime.jsx)(CreateDialog$1, {
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
		const en$1 = {
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
		const zh$1 = {
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
		//#region lib/types/ui-team/section-store.js
		/**
		* Team management controller: the roster as a list, a create dialog, a
		* row-level enable/disable toggle, an edit detail over the team's role roster
		* (subagent/prompt/memory per role), delete, and opening a team's directory.
		*
		* The host stays the single fact source. Every mutation writes through the
		* wire and the page re-reads the roster afterwards, because a toggle or edit
		* changes more than the row it targeted (the roster order and states recompute
		* from the host).
		*
		* Inside one team's edit detail, the role roster is rendered as compact list
		* rows. Tapping a row (or tapping "add role") opens a single-role edit
		* dialog over a staged draft. The open edit holds its own `dirty` flag so
		* `cancel` rolls back without touching the roster (for an existing role) and
		* without leaving a phantom row behind (for a new role). A role edit must be
		* either saved or cancelled before the team-level save; the controller
		* enforces that ordering at `confirmDetail`.
		*/
		/** Ids a team directory may be named, mirroring the host's own rule. */
		const TEAM_ID = /^[a-z0-9][a-z0-9-]*$/;
		const INITIAL = {
			status: "idle",
			error: null,
			authorable: false,
			hasDocument: false,
			subagents: [],
			rows: [],
			create: null,
			detail: null,
			pendingDelete: null,
			deleting: false,
			revealedPaths: {}
		};
		/** A fresh empty role row. */
		function emptyRole() {
			return {
				id: "",
				description: "",
				prompt: "",
				subagent: "",
				memory: "one-shot"
			};
		}
		/** The failure message of a rejected wire call. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Why this create cannot be submitted yet, as a locale key, or undefined. */
		function createBlocker$1(draft, rows) {
			if (draft.id === "") return "idRequired";
			if (!TEAM_ID.test(draft.id)) return "idInvalid";
			if (rows.some((row) => row.id === draft.id)) return "idTaken";
			return roleBlocker(draft.roles);
		}
		/** Why an edit detail cannot be saved yet, as a locale key, or undefined. */
		function detailBlocker(draft) {
			return roleBlocker(draft.roles);
		}
		/** Why the role roster cannot be submitted, as a locale key, or undefined. */
		function roleBlocker(roles) {
			if (roles.length === 0) return "roleIdRequired";
			for (const role of roles) {
				if (role.id === "") return "roleIdRequired";
				if (role.subagent === "") return "roleSubagentRequired";
			}
		}
		/**
		* Read the roster and drive the create, edit detail, toggle, delete, and
		* location reveals.
		*/
		var TeamSectionController = class {
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
			patchDetail(patch) {
				const { detail } = this.store.getSnapshot();
				if (detail === null) return;
				this.set({ detail: {
					...detail,
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
					const result = await this.api.teamPresets.list({});
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
				const { teams, authorable, hasDocument, subagents } = value;
				if (teams.length === 0) {
					this.set({
						status: "unavailable",
						rows: [],
						authorable,
						hasDocument,
						subagents,
						create: null,
						detail: null
					});
					return;
				}
				const revealed = this.store.getSnapshot().revealedPaths;
				const kept = Object.fromEntries(Object.entries(revealed).filter(([id]) => teams.some((team) => team.id === id)));
				this.set({
					status: "ready",
					error: null,
					authorable,
					hasDocument,
					subagents,
					rows: teams.map((team) => ({
						id: team.id,
						trust: team.trust,
						metadata: team.metadata,
						roleCount: team.roles.length,
						...team.broken === void 0 ? {} : { broken: team.broken }
					})),
					revealedPaths: kept
				});
			}
			/** Open the create dialog with one fresh empty role. */
			beginCreate() {
				this.set({
					error: null,
					create: {
						id: "",
						name: "",
						roles: [emptyRole()],
						saving: false,
						error: null
					}
				});
			}
			/** Close the create dialog, discarding whatever was typed. */
			cancelCreate() {
				this.set({ create: null });
			}
			/** Name the team the create makes. */
			setCreateId(id) {
				this.patchCreate({
					id,
					error: null
				});
			}
			/** Set the create dialog's display name. */
			setCreateName(name) {
				this.patchCreate({
					name,
					error: null
				});
			}
			/** Stage one field of one create role row. */
			setCreateRoleField(index, field, value) {
				const { create } = this.store.getSnapshot();
				if (create === null) return;
				this.patchCreate({
					roles: create.roles.map((role, i) => i === index ? patchRole(role, field, value) : role),
					error: null
				});
			}
			/** Add an empty role row to the create dialog. */
			addCreateRole() {
				const { create } = this.store.getSnapshot();
				if (create === null) return;
				this.patchCreate({
					roles: [...create.roles, emptyRole()],
					error: null
				});
			}
			/** Remove one role row from the create dialog. */
			removeCreateRole(index) {
				const { create } = this.store.getSnapshot();
				if (create === null) return;
				this.patchCreate({
					roles: create.roles.filter((_, i) => i !== index),
					error: null
				});
			}
			/** Submit the create, then re-read the roster. */
			async confirmCreate() {
				const draft = this.store.getSnapshot().create;
				if (draft === null || draft.saving) return;
				if (createBlocker$1(draft, this.store.getSnapshot().rows) !== void 0) return;
				this.patchCreate({
					saving: true,
					error: null
				});
				try {
					const result = await this.api.teamPresets.create({
						id: draft.id,
						...draft.name === "" ? {} : { name: draft.name },
						roles: draft.roles.map(roleToWire)
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
				} catch (error) {
					this.patchCreate({
						saving: false,
						error: messageOf(error)
					});
				}
			}
			/** Open one team's directory on the host desktop, or reveal its path. */
			async openLocation(id) {
				try {
					const result = await this.api.teamPresets.openLocation({ id });
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
			* Toggle one team's enabled switch on the row. An enabled-only metadata
			* write through `update`, mirroring the subagent surface.
			*/
			async toggle(id, enabled) {
				try {
					const result = await this.api.teamPresets.update({
						id,
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
			/** Open the edit detail over one team's full role roster. */
			async beginDetail(id) {
				const row = this.store.getSnapshot().rows.find((candidate) => candidate.id === id);
				this.set({
					error: null,
					detail: null
				});
				try {
					const result = await this.api.teamPresets.read({ id });
					if (!result.ok) {
						this.set({ error: result.error.message });
						return;
					}
					const team = result.value.team;
					this.set({ detail: {
						id,
						title: team.metadata.name ?? row?.id ?? id,
						metadata: team.metadata,
						roles: team.roles.map((role) => ({
							id: role.id,
							description: role.description ?? "",
							prompt: role.prompt ?? "",
							subagent: role.subagent,
							memory: role.memory
						})),
						saving: false,
						error: null,
						roleEdit: null
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/** Close the edit detail, discarding whatever was typed. */
			closeDetail() {
				this.set({ detail: null });
			}
			/** Set the detail dialog's display name. */
			setDetailName(name) {
				const { detail } = this.store.getSnapshot();
				if (detail === null) return;
				this.patchDetail({
					metadata: {
						...detail.metadata,
						name
					},
					error: null
				});
			}
			/** Set the detail dialog's display description. */
			setDetailDescription(description) {
				const { detail } = this.store.getSnapshot();
				if (detail === null) return;
				this.patchDetail({
					metadata: {
						...detail.metadata,
						description
					},
					error: null
				});
			}
			/**
			* Append a blank role to the team detail's roster and open the edit
			* dialog over it in a `'new'` draft state. The new row stays in the roster
			* through `saveRoleEdit` and is unwound on `cancelRoleEdit`.
			*/
			addRoleInDetail() {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.saving) return;
				const newRole = emptyRole();
				this.patchDetail({
					roles: [...detail.roles, newRole],
					roleEdit: {
						kind: "new",
						draft: newRole,
						dirty: true,
						error: null
					},
					error: null
				});
			}
			/** Open the single-role edit over one existing roster row. */
			beginRoleEdit(index) {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.saving) return;
				const role = detail.roles[index];
				if (role === void 0) return;
				this.patchDetail({
					roleEdit: {
						kind: "existing",
						index,
						draft: { ...role },
						original: { ...role },
						dirty: false,
						error: null
					},
					error: null
				});
			}
			/** Remove one role row from the team detail (and any open edit on it). */
			removeRole(index) {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.saving) return;
				const open = detail.roleEdit;
				const roleEdit = open !== null ? open.kind === "existing" && open.index === index ? null : open.kind === "new" && detail.roles.length - 1 === index ? null : open : null;
				this.patchDetail({
					roles: detail.roles.filter((_, i) => i !== index),
					roleEdit,
					error: null
				});
			}
			/** Stage one field on the open role edit draft, marking it dirty. */
			setRoleEditField(field, value) {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.roleEdit === null) return;
				this.patchDetail({
					roleEdit: {
						...detail.roleEdit,
						draft: patchRole(detail.roleEdit.draft, field, value),
						dirty: true,
						error: null
					},
					error: null
				});
			}
			/**
			* Commit the open role edit: validate, then write back into the roster
			* (replacing the existing row, or trimming the trailing new row). The
			* team-level save (`confirmDetail`) is a separate step.
			*/
			saveRoleEdit() {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.roleEdit === null) return;
				const edit = detail.roleEdit;
				if (roleBlocker([edit.draft]) !== void 0) return;
				if (edit.kind === "new") {
					const head = detail.roles.slice(0, detail.roles.length - 1);
					this.patchDetail({
						roles: [...head, edit.draft],
						roleEdit: null,
						error: null
					});
					return;
				}
				const index = edit.index;
				if (index >= detail.roles.length) {
					this.patchDetail({ roleEdit: null });
					return;
				}
				this.patchDetail({
					roles: detail.roles.map((role, i) => i === index ? edit.draft : role),
					roleEdit: null,
					error: null
				});
			}
			/**
			* Cancel the open role edit. For an existing row, the staged draft is
			* discarded (the roster was never touched, so rollback is a no-op). For a
			* new row, the trailing blank row that `addRoleInDetail` appended is
			* removed along with the discarded draft.
			*/
			cancelRoleEdit() {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.roleEdit === null) return;
				if (detail.roleEdit.kind === "new") {
					const next = detail.roles.slice(0, detail.roles.length - 1);
					this.patchDetail({
						roles: next,
						roleEdit: null,
						error: null
					});
					return;
				}
				this.patchDetail({ roleEdit: null });
			}
			/** Save the edit detail's staged roster and metadata, then re-read. */
			async confirmDetail() {
				const { detail } = this.store.getSnapshot();
				if (detail === null || detail.saving) return;
				if (detail.roleEdit !== null) return;
				if (detailBlocker(detail) !== void 0) return;
				this.patchDetail({
					saving: true,
					error: null
				});
				try {
					const result = await this.api.teamPresets.update({
						id: detail.id,
						metadata: {
							...detail.metadata.name === void 0 || detail.metadata.name === "" ? {} : { name: detail.metadata.name },
							...detail.metadata.description === void 0 || detail.metadata.description === "" ? {} : { description: detail.metadata.description },
							...detail.metadata.enabled === void 0 ? {} : { enabled: detail.metadata.enabled }
						},
						roles: detail.roles.map(roleToWire)
					});
					if (!result.ok) {
						this.patchDetail({
							saving: false,
							error: result.error.message
						});
						return;
					}
					this.set({ detail: null });
					await this.load();
					this.rosterChanged();
				} catch (error) {
					this.patchDetail({
						saving: false,
						error: messageOf(error)
					});
				}
			}
			/** Ask for confirmation before deleting one team. */
			confirmDelete(id) {
				if (this.store.getSnapshot().deleting) return;
				this.set({ pendingDelete: id });
			}
			/** Delete the team awaiting confirmation, then re-read the roster. */
			async remove() {
				const { pendingDelete, deleting } = this.store.getSnapshot();
				if (pendingDelete === null || deleting) return;
				this.set({
					deleting: true,
					error: null
				});
				try {
					const result = await this.api.teamPresets.remove({ id: pendingDelete });
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
		/** Patch one staged role field (id/description/prompt/subagent/memory). */
		function patchRole(role, field, value) {
			if (field === "id") return {
				...role,
				id: value
			};
			if (field === "description") return {
				...role,
				description: value
			};
			if (field === "prompt") return {
				...role,
				prompt: value
			};
			if (field === "subagent") return {
				...role,
				subagent: value
			};
			if (field === "memory") return {
				...role,
				memory: value === "persistent" ? "persistent" : "one-shot"
			};
			return role;
		}
		/** Map a staged role onto the wire's role shape. */
		function roleToWire(role) {
			return {
				id: role.id,
				...role.description === "" ? {} : { description: role.description },
				...role.prompt === "" ? {} : { prompt: role.prompt },
				subagent: role.subagent,
				memory: role.memory
			};
		}
		//#endregion
		//#region \0dsh-css:bundle/subagent/src/ui-team/TeamSection.module.css.mjs
		const css = "._56J2oq_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}._56J2oq_title{margin:0;font-size:18px;font-weight:600}._56J2oq_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}._56J2oq_cards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}._56J2oq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;transition:border-color .16s,background .16s;display:flex}._56J2oq_card:hover{border-color:var(--dsw-alias-label-dimmed)}._56J2oq_cardBroken,._56J2oq_cardBroken:hover{border-color:var(--dsw-alias-state-error-primary)}._56J2oq_cardHead{flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px 0;display:flex}._56J2oq_cardName{font-size:15px;font-weight:600;line-height:1.4}._56J2oq_badge,._56J2oq_brokenBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}._56J2oq_badge{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}._56J2oq_brokenBadge{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3)}._56J2oq_headSpacer{margin-left:auto}._56J2oq_toggle{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:999px;flex:none;width:34px;height:20px;transition:background .16s,border-color .16s;position:relative}._56J2oq_toggle:after{content:\"\";background:var(--dsw-alias-label-dimmed);border-radius:50%;width:14px;height:14px;transition:transform .16s,background .16s;position:absolute;top:2px;left:2px}._56J2oq_toggle:checked{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._56J2oq_toggle:checked:after{background:var(--dsw-alias-bg-layer-3);transform:translate(14px)}._56J2oq_toggle:disabled{opacity:.5;cursor:default}._56J2oq_cardDesc{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;padding:6px 16px 0;font-size:13px;line-height:1.55}._56J2oq_cardId{color:var(--dsw-alias-label-dimmed);padding:6px 16px 0;font-size:11px}._56J2oq_roleCount{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace)}._56J2oq_cardFoot{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;gap:2px;margin-top:8px;padding:6px 10px 8px;display:flex}._56J2oq_iconButton{appearance:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;align-items:center;padding:6px;display:inline-flex;position:relative}._56J2oq_iconButton:disabled{opacity:.4;cursor:default}._56J2oq_iconButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}._56J2oq_iconButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}._56J2oq_iconDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}._56J2oq_editorBlock{flex-direction:column;gap:10px;padding-top:4px;display:flex}._56J2oq_blockTitle{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;font-weight:600}._56J2oq_roleRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;gap:10px;padding:10px 12px;display:flex}._56J2oq_roleGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;display:grid}._56J2oq_roleRowFoot{justify-content:flex-end;display:flex}._56J2oq_removeRole{appearance:none;font:inherit;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:0;border-radius:7px;padding:4px 8px;font-size:12px}._56J2oq_removeRole:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}._56J2oq_addRole{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l3);height:40px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:10px;justify-content:center;align-self:stretch;align-items:center;gap:6px;font-size:13px;display:flex}._56J2oq_addRole:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._56J2oq_addRole:disabled{opacity:.4;cursor:default}._56J2oq_rolesList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}._56J2oq_roleListRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;align-items:stretch;gap:6px;padding:6px 6px 6px 12px;transition:border-color .16s,background .16s;display:flex}._56J2oq_roleListRow:hover{border-color:var(--dsw-alias-label-dimmed)}._56J2oq_roleListMain{appearance:none;min-width:0;font:inherit;text-align:left;color:inherit;cursor:pointer;background:0 0;border:0;border-radius:8px;flex:1;grid-template-columns:minmax(72px,auto) minmax(0,1fr) auto;align-items:center;column-gap:16px;padding:6px 0;display:grid}._56J2oq_roleListMain:disabled{cursor:default}._56J2oq_roleListMain:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}._56J2oq_roleListId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600}._56J2oq_roleListSummary{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13px;line-height:1.4;overflow:hidden}._56J2oq_roleListMeta{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:12px;font-size:12px;display:flex}._56J2oq_roleListSubagent,._56J2oq_roleListMemory{align-items:center;gap:4px;display:inline-flex}._56J2oq_roleListLabel{color:var(--dsw-alias-label-tertiary)}._56J2oq_roleListSubagentValue{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary)}._56J2oq_roleListMemoryValue{color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}._56J2oq_emptyRoles{color:var(--dsw-alias-label-tertiary);margin:0;padding:8px 4px;font-size:12px}._56J2oq_roleEditDialog{width:min(560px,100%)}._56J2oq_roleEditForm{flex-direction:column;gap:14px;display:flex}._56J2oq_roleEditPrompt{min-height:160px}._56J2oq_field{flex-direction:column;gap:6px;display:flex}._56J2oq_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}._56J2oq_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 12px;font-size:13px}._56J2oq_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}._56J2oq_textarea{resize:vertical;min-height:72px;font-family:inherit;line-height:1.5}._56J2oq_input::placeholder{color:var(--dsw-alias-label-dimmed)}._56J2oq_select{appearance:none;cursor:pointer}._56J2oq_creatorButton{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l3);height:44px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:12px;justify-content:center;align-self:stretch;align-items:center;gap:6px;font-size:14px;line-height:22px;display:flex}._56J2oq_creatorButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._56J2oq_creatorButton:disabled{opacity:.4;cursor:default}._56J2oq_dialog{width:min(640px,100%)}._56J2oq_dialogScroll{max-height:min(80vh,640px);overflow:auto}._56J2oq_dialogFields{flex-direction:column;gap:12px;display:flex}._56J2oq_deleteDialog{width:min(480px,100%)}._56J2oq_deleteConfirm:not(:disabled){border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}._56J2oq_deleteConfirm:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}._56J2oq_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px}._56J2oq_revealedPath{color:var(--dsw-alias-label-tertiary);align-items:baseline;gap:6px;margin:0;padding:0 16px 10px;font-size:11px;display:flex}._56J2oq_revealedPath code{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary);user-select:all;overflow-wrap:anywhere}._56J2oq_revealedPathLabel{white-space:nowrap}";
		const tagId = "dsh-harness-subagent-bundle/TeamSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-subagent-bundle";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TeamSection_module_css_default = {
			"cards": "_56J2oq_cards",
			"cardDesc": "_56J2oq_cardDesc",
			"fieldLabel": "_56J2oq_fieldLabel",
			"cardName": "_56J2oq_cardName",
			"select": "_56J2oq_select",
			"dialogScroll": "_56J2oq_dialogScroll",
			"roleListRow": "_56J2oq_roleListRow",
			"deleteDialog": "_56J2oq_deleteDialog",
			"error": "_56J2oq_error",
			"intro": "_56J2oq_intro",
			"title": "_56J2oq_title",
			"iconButton": "_56J2oq_iconButton",
			"roleGrid": "_56J2oq_roleGrid",
			"dialogFields": "_56J2oq_dialogFields",
			"revealedPathLabel": "_56J2oq_revealedPathLabel",
			"revealedPath": "_56J2oq_revealedPath",
			"roleListMemoryValue": "_56J2oq_roleListMemoryValue",
			"roleRow": "_56J2oq_roleRow",
			"cardFoot": "_56J2oq_cardFoot",
			"badge": "_56J2oq_badge",
			"textarea": "_56J2oq_textarea",
			"field": "_56J2oq_field",
			"roleListSummary": "_56J2oq_roleListSummary",
			"roleEditPrompt": "_56J2oq_roleEditPrompt",
			"brokenBadge": "_56J2oq_brokenBadge",
			"addRole": "_56J2oq_addRole",
			"cardId": "_56J2oq_cardId",
			"roleListMeta": "_56J2oq_roleListMeta",
			"cardBroken": "_56J2oq_cardBroken",
			"roleListId": "_56J2oq_roleListId",
			"roleRowFoot": "_56J2oq_roleRowFoot",
			"roleListSubagent": "_56J2oq_roleListSubagent",
			"roleListLabel": "_56J2oq_roleListLabel",
			"emptyRoles": "_56J2oq_emptyRoles",
			"input": "_56J2oq_input",
			"editorBlock": "_56J2oq_editorBlock",
			"roleEditForm": "_56J2oq_roleEditForm",
			"blockTitle": "_56J2oq_blockTitle",
			"roleCount": "_56J2oq_roleCount",
			"card": "_56J2oq_card",
			"roleListMemory": "_56J2oq_roleListMemory",
			"deleteConfirm": "_56J2oq_deleteConfirm",
			"headSpacer": "_56J2oq_headSpacer",
			"creatorButton": "_56J2oq_creatorButton",
			"roleListMain": "_56J2oq_roleListMain",
			"roleListSubagentValue": "_56J2oq_roleListSubagentValue",
			"dialog": "_56J2oq_dialog",
			"iconDanger": "_56J2oq_iconDanger",
			"rolesList": "_56J2oq_rolesList",
			"cardHead": "_56J2oq_cardHead",
			"toggle": "_56J2oq_toggle",
			"section": "_56J2oq_section",
			"roleEditDialog": "_56J2oq_roleEditDialog",
			"removeRole": "_56J2oq_removeRole"
		};
		//#endregion
		//#region lib/types/ui-team/TeamSection.js
		/**
		* Teams settings section: the independent "团队" (编制表) roster as cards, with
		* a create dialog, a row-level enable/disable switch, an edit detail over the
		* team's full role roster (subagent/prompt/memory per role), delete, and
		* open-directory.
		*
		* This section reads the team registry — fully separate from both the
		* agent-preset roster and the subagent roster — so the rosters never mix. A
		* shipped (system) team is read-only: it cannot be toggled, edited, or deleted.
		*
		* The role roster renders as compact list rows (id + description one-line
		* summary + subagent id + memory tag + remove control); tapping a row opens a
		* single-role edit dialog over id / description / subagent / memory / prompt
		* — a single-column vertical form so future role attributes become one more
		* field row, not a layout overhaul. Adding a role enters the same edit dialog
		* in a fresh-draft state.
		*/
		/** A compact role-row: id + one-line description summary + subagent + memory tag + remove. */
		function RoleListRow(props) {
			const { role, index, t, canEdit, saving, onEdit, onRemove } = props;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: TeamSection_module_css_default.roleListRow,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: TeamSection_module_css_default.roleListMain,
					disabled: !canEdit,
					onClick: () => onEdit(index),
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: TeamSection_module_css_default.roleListId,
							children: role.id === "" ? t("roleIdEmpty") : role.id
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: TeamSection_module_css_default.roleListSummary,
							children: role.description === "" ? t("noRoleSummary") : role.description
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: TeamSection_module_css_default.roleListMeta,
							children: [(0, react_jsx_runtime.jsxs)("span", {
								className: TeamSection_module_css_default.roleListSubagent,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.roleListLabel,
									children: t("roleSubagentLabelShort")
								}), (0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.roleListSubagentValue,
									children: role.subagent === "" ? "—" : role.subagent
								})]
							}), (0, react_jsx_runtime.jsxs)("span", {
								className: TeamSection_module_css_default.roleListMemory,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.roleListLabel,
									children: t("roleMemoryLabelShort")
								}), (0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.roleListMemoryValue,
									children: role.memory === "persistent" ? t("memoryPersistent") : t("memoryOneShot")
								})]
							})]
						})
					]
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("removeRole"),
					side: "top",
					children: (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${TeamSection_module_css_default.iconButton} ${TeamSection_module_css_default.iconDanger}`,
						disabled: !canEdit || saving,
						onClick: () => onRemove(index),
						"aria-label": t("removeRole"),
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
					})
				})]
			});
		}
		/** A one-card row rendering a team's identity, role count, and switch. */
		function TeamRowView(props) {
			const { row, t, onToggle, onDetail, onDelete, onOpen, hasDocument, revealedPath } = props;
			const custom = row.trust === "user";
			const broken = row.broken !== void 0;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: `${TeamSection_module_css_default.card} ${broken ? TeamSection_module_css_default.cardBroken : ""}`,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamSection_module_css_default.cardHead,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.cardName,
								children: row.metadata.name ?? row.id
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.badge,
								children: custom ? t("userTrust") : t("systemTrust")
							}),
							broken ? (0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.brokenBadge,
								children: t("brokenBadge")
							}) : null,
							(0, react_jsx_runtime.jsx)("span", { className: TeamSection_module_css_default.headSpacer }),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: row.metadata.enabled !== false ? t("enabled") : t("disabled"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									className: TeamSection_module_css_default.toggle,
									checked: row.metadata.enabled !== false,
									disabled: broken,
									onChange: (e) => onToggle(row.id, e.target.checked)
								})
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: TeamSection_module_css_default.cardDesc,
						children: row.metadata.description ?? t("noDescription")
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: TeamSection_module_css_default.cardId,
						children: (0, react_jsx_runtime.jsxs)("span", {
							className: TeamSection_module_css_default.roleCount,
							children: [
								row.roleCount,
								" ",
								t("roleCount")
							]
						})
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamSection_module_css_default.cardFoot,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("detailTitle"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: TeamSection_module_css_default.iconButton,
									disabled: !custom,
									onClick: () => onDetail(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("delete"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${TeamSection_module_css_default.iconButton} ${TeamSection_module_css_default.iconDanger}`,
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
									className: TeamSection_module_css_default.iconButton,
									onClick: () => onOpen(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16, {})
								})
							})
						]
					}),
					revealedPath !== void 0 ? (0, react_jsx_runtime.jsxs)("p", {
						className: TeamSection_module_css_default.revealedPath,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.revealedPathLabel,
								children: t("revealedPathLabel")
							}),
							" ",
							(0, react_jsx_runtime.jsx)("code", { children: revealedPath })
						]
					}) : null
				]
			});
		}
		/** The create dialog. */
		function CreateDialog(props) {
			const { state, t, setCreateId, setCreateName, setRoleField, addRole, removeRole, confirm, cancel } = props;
			const draft = state.create;
			if (draft === null) return null;
			const blocker = createBlocker$1(draft, state.rows);
			const message = draft.error ?? (blocker === void 0 ? null : t(blocker));
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: cancel,
				title: t("createTitle"),
				closeLabel: t("close"),
				description: t("createIntro"),
				className: TeamSection_module_css_default.dialog,
				contentClassName: TeamSection_module_css_default.dialogScroll,
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
					className: TeamSection_module_css_default.dialogFields,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("idLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: TeamSection_module_css_default.input,
								value: draft.id,
								placeholder: t("idPlaceholder"),
								onChange: (e) => setCreateId(e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("nameLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: TeamSection_module_css_default.input,
								value: draft.name,
								placeholder: t("namePlaceholder"),
								onChange: (e) => setCreateName(e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsx)(CreateRolesEditor, {
							roles: draft.roles,
							subagents: state.subagents,
							t,
							setRoleField,
							addRole,
							removeRole
						}),
						message !== null ? (0, react_jsx_runtime.jsx)("p", {
							className: TeamSection_module_css_default.error,
							children: message
						}) : null
					]
				})
			});
		}
		/** The roster editor used inside the create dialog (the only place a team is born with several roles at once). */
		function CreateRolesEditor(props) {
			const { roles, subagents, t, setRoleField, addRole, removeRole } = props;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: TeamSection_module_css_default.editorBlock,
				children: [
					(0, react_jsx_runtime.jsx)("h4", {
						className: TeamSection_module_css_default.blockTitle,
						children: t("rolesLabel")
					}),
					roles.map((role, index) => (0, react_jsx_runtime.jsx)(CreateRoleRow, {
						role,
						index,
						subagents,
						t,
						onField: setRoleField,
						onRemove: removeRole,
						removable: roles.length > 1
					}, index)),
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: TeamSection_module_css_default.addRole,
						onClick: addRole,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("addRole")]
					})
				]
			});
		}
		/** One dense role row inside the create dialog (the multi-role seed keeps the existing flat layout). */
		function CreateRoleRow(props) {
			const { role, index, subagents, t, onField, onRemove, removable } = props;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: TeamSection_module_css_default.roleRow,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamSection_module_css_default.roleGrid,
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: TeamSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.fieldLabel,
									children: t("roleIdLabel")
								}), (0, react_jsx_runtime.jsx)("input", {
									className: TeamSection_module_css_default.input,
									value: role.id,
									placeholder: t("roleIdPlaceholder"),
									onChange: (e) => onField(index, "id", e.target.value)
								})]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: TeamSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.fieldLabel,
									children: t("roleDescriptionLabel")
								}), (0, react_jsx_runtime.jsx)("input", {
									className: TeamSection_module_css_default.input,
									value: role.description,
									placeholder: t("roleDescriptionPlaceholder"),
									onChange: (e) => onField(index, "description", e.target.value)
								})]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: TeamSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.fieldLabel,
									children: t("roleSubagentLabel")
								}), (0, react_jsx_runtime.jsxs)("select", {
									className: `${TeamSection_module_css_default.input} ${TeamSection_module_css_default.select}`,
									value: role.subagent,
									onChange: (e) => onField(index, "subagent", e.target.value),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "",
										disabled: true,
										children: subagents.length === 0 ? t("noSubagents") : t("roleSubagentPlaceholder")
									}), subagents.map((subagent) => (0, react_jsx_runtime.jsx)("option", {
										value: subagent,
										children: subagent
									}, subagent))]
								})]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: TeamSection_module_css_default.field,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamSection_module_css_default.fieldLabel,
									children: t("roleMemoryLabel")
								}), (0, react_jsx_runtime.jsxs)("select", {
									className: `${TeamSection_module_css_default.input} ${TeamSection_module_css_default.select}`,
									value: role.memory,
									onChange: (e) => onField(index, "memory", e.target.value),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "one-shot",
										children: t("memoryOneShot")
									}), (0, react_jsx_runtime.jsx)("option", {
										value: "persistent",
										children: t("memoryPersistent")
									})]
								})]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamSection_module_css_default.field,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: TeamSection_module_css_default.fieldLabel,
							children: t("rolePromptLabel")
						}), (0, react_jsx_runtime.jsx)("textarea", {
							className: `${TeamSection_module_css_default.input} ${TeamSection_module_css_default.textarea}`,
							value: role.prompt,
							placeholder: t("rolePromptPlaceholder"),
							onChange: (e) => onField(index, "prompt", e.target.value)
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: TeamSection_module_css_default.roleRowFoot,
						children: removable ? (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: TeamSection_module_css_default.removeRole,
							onClick: () => onRemove(index),
							children: t("removeRole")
						}) : (0, react_jsx_runtime.jsx)("span", {})
					})
				]
			});
		}
		/** The team-detail modal: metadata fields + a compact role roster (rows + add). */
		function DetailDialog(props) {
			const { detail, subagents: _subagents, t, setDetailName, setDetailDescription, beginRoleEdit, addRole, removeRole, confirm, cancel } = props;
			const rolesEditable = detail.id !== "";
			const blocker = detailBlocker(detail);
			const message = detail.error ?? (blocker === void 0 ? null : t(blocker));
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: cancel,
				title: `${t("detailTitle")}: ${detail.title}`,
				closeLabel: t("close"),
				description: t("detailIntro"),
				className: TeamSection_module_css_default.dialog,
				contentClassName: TeamSection_module_css_default.dialogScroll,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: detail.saving,
					onClick: cancel,
					children: t("cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: detail.saving || blocker !== void 0,
					onClick: confirm,
					children: detail.saving ? t("saving") : t("save")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: TeamSection_module_css_default.dialogFields,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("nameLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: TeamSection_module_css_default.input,
								value: detail.metadata.name ?? "",
								placeholder: t("namePlaceholder"),
								onChange: (e) => setDetailName(e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("descriptionLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: TeamSection_module_css_default.input,
								value: detail.metadata.description ?? "",
								placeholder: t("descriptionPlaceholder"),
								onChange: (e) => setDetailDescription(e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: TeamSection_module_css_default.editorBlock,
							children: [
								(0, react_jsx_runtime.jsx)("h4", {
									className: TeamSection_module_css_default.blockTitle,
									children: t("rolesLabel")
								}),
								detail.roles.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: TeamSection_module_css_default.emptyRoles,
									children: t("noRoles")
								}) : (0, react_jsx_runtime.jsx)("ul", {
									className: TeamSection_module_css_default.rolesList,
									children: detail.roles.map((role, index) => (0, react_jsx_runtime.jsx)(RoleListRow, {
										role,
										index,
										t,
										canEdit: rolesEditable && !detail.saving,
										saving: detail.saving,
										onEdit: beginRoleEdit,
										onRemove: removeRole
									}, `${detail.id}\u0000${index}`))
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: TeamSection_module_css_default.addRole,
									disabled: !rolesEditable || detail.saving,
									onClick: addRole,
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("addRole")]
								})
							]
						}),
						message !== null ? (0, react_jsx_runtime.jsx)("p", {
							className: TeamSection_module_css_default.error,
							children: message
						}) : null
					]
				})
			});
		}
		/** The single-role edit dialog: a single-column vertical form over the staged draft. */
		function RoleEditDialog(props) {
			const { edit, subagents, t, setField, saving, confirm, cancel } = props;
			const draft = edit.draft;
			const blocker = roleBlocker([draft]);
			const message = edit.error ?? (blocker === void 0 ? null : t(blocker));
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: cancel,
				title: t("roleEditTitle"),
				closeLabel: t("close"),
				description: t("roleEditIntro"),
				className: `${TeamSection_module_css_default.dialog} ${TeamSection_module_css_default.roleEditDialog}`,
				contentClassName: TeamSection_module_css_default.dialogScroll,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: saving,
					onClick: cancel,
					icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
					children: t("roleEditBack")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: saving || blocker !== void 0 || !edit.dirty,
					onClick: confirm,
					children: saving ? t("saving") : t("roleEditSave")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: TeamSection_module_css_default.roleEditForm,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("roleIdLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: TeamSection_module_css_default.input,
								value: draft.id,
								placeholder: t("roleIdPlaceholder"),
								onChange: (e) => setField("id", e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("roleDescriptionLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: TeamSection_module_css_default.input,
								value: draft.description,
								placeholder: t("roleDescriptionPlaceholder"),
								onChange: (e) => setField("description", e.target.value)
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("roleSubagentLabel")
							}), (0, react_jsx_runtime.jsxs)("select", {
								className: `${TeamSection_module_css_default.input} ${TeamSection_module_css_default.select}`,
								value: draft.subagent,
								onChange: (e) => setField("subagent", e.target.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "",
									disabled: true,
									children: subagents.length === 0 ? t("noSubagents") : t("roleSubagentPlaceholder")
								}), subagents.map((subagent) => (0, react_jsx_runtime.jsx)("option", {
									value: subagent,
									children: subagent
								}, subagent))]
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("roleMemoryLabel")
							}), (0, react_jsx_runtime.jsxs)("select", {
								className: `${TeamSection_module_css_default.input} ${TeamSection_module_css_default.select}`,
								value: draft.memory,
								onChange: (e) => setField("memory", e.target.value),
								children: [(0, react_jsx_runtime.jsx)("option", {
									value: "one-shot",
									children: t("memoryOneShot")
								}), (0, react_jsx_runtime.jsx)("option", {
									value: "persistent",
									children: t("memoryPersistent")
								})]
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: TeamSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: TeamSection_module_css_default.fieldLabel,
								children: t("rolePromptLabel")
							}), (0, react_jsx_runtime.jsx)("textarea", {
								className: `${TeamSection_module_css_default.input} ${TeamSection_module_css_default.textarea} ${TeamSection_module_css_default.roleEditPrompt}`,
								value: draft.prompt,
								placeholder: t("rolePromptPlaceholder"),
								onChange: (e) => setField("prompt", e.target.value)
							})]
						}),
						message !== null ? (0, react_jsx_runtime.jsx)("p", {
							className: TeamSection_module_css_default.error,
							children: message
						}) : null
					]
				})
			});
		}
		/**
		* Render the Teams section content column.
		* @param props - composed slot props.
		* @returns the section, or null when the deployment composes no teams.
		*/
		function TeamSection(props) {
			const { useTeamSection, t, load } = props;
			const state = useTeamSection((snapshot) => snapshot);
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
			const roleEdit = state.detail?.roleEdit ?? null;
			const inRoleEdit = roleEdit !== null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: TeamSection_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: TeamSection_module_css_default.title,
						children: t("nav")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: TeamSection_module_css_default.intro,
						children: t("sectionIntro")
					}),
					(0, react_jsx_runtime.jsx)("ul", {
						className: TeamSection_module_css_default.cards,
						children: state.rows.map((row) => (0, react_jsx_runtime.jsx)(TeamRowView, {
							row,
							t,
							onToggle: props.toggle,
							onDetail: props.beginDetail,
							onDelete: props.confirmDelete,
							onOpen: props.openLocation,
							hasDocument: state.hasDocument,
							revealedPath: state.revealedPaths[row.id]
						}, row.id))
					}),
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: TeamSection_module_css_default.creatorButton,
						disabled: !state.authorable,
						onClick: () => props.beginCreate(),
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("create")]
					}),
					(0, react_jsx_runtime.jsx)(CreateDialog, {
						state,
						t,
						setCreateId: props.setCreateId,
						setCreateName: props.setCreateName,
						setRoleField: props.setCreateRoleField,
						addRole: props.addCreateRole,
						removeRole: props.removeCreateRole,
						confirm: () => void props.confirmCreate(),
						cancel: props.cancelCreate
					}),
					state.detail !== null ? inRoleEdit ? null : (0, react_jsx_runtime.jsx)(DetailDialog, {
						detail: state.detail,
						subagents: state.subagents,
						t,
						setDetailName: props.setDetailName,
						setDetailDescription: props.setDetailDescription,
						beginRoleEdit: props.beginRoleEdit,
						addRole: props.addRoleInDetail,
						removeRole: props.removeRole,
						confirm: () => void props.confirmDetail(),
						cancel: props.closeDetail
					}) : null,
					inRoleEdit && state.detail !== null ? (0, react_jsx_runtime.jsx)(RoleEditDialog, {
						edit: roleEdit,
						subagents: state.subagents,
						t,
						setField: props.setRoleEditField,
						saving: state.detail.saving,
						confirm: () => void props.saveRoleEdit(),
						cancel: props.cancelRoleEdit
					}) : null,
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.pendingDelete !== null,
						onClose: () => props.confirmDelete(null),
						title: t("deleteTitle"),
						closeLabel: t("close"),
						description: t("deleteDescription"),
						className: TeamSection_module_css_default.deleteDialog,
						footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: state.deleting,
							onClick: () => props.confirmDelete(null),
							children: t("cancel")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: TeamSection_module_css_default.deleteConfirm,
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
		//#region lib/types/ui-team/wire-client.js
		/**
		* Browser transport for the team-management wire channel.
		*
		* The team roster ("编制表") management rides the connection's dedicated
		* `/team-preset` channel, so this module adapts
		* {@link ClientConnectionRpc.call} into the management surface the team
		* section controller consumes. Each method mints the payload the Host handler
		* validates against its zod schema and returns the Host's `RpcResult` — the
		* same success/failure shape the subagent-management wire returns.
		* @module dsh-harness-subagent-bundle/ui-team/wire-client
		*/
		/** Absolute logical channel the Host serves team management on. */
		const TEAM_PRESET_CHANNEL = "/team-preset";
		/** Build the management wire face over one connection RPC caller. */
		function createTeamPresetWire(rpc) {
			return {
				list: (payload, signal) => call("list", payload, signal),
				read: (payload, signal) => call("read", payload, signal),
				create: (payload, signal) => call("create", payload, signal),
				update: (payload, signal) => call("update", payload, signal),
				remove: (payload, signal) => call("remove", payload, signal),
				openLocation: (payload, signal) => call("openLocation", payload, signal)
			};
			/** Call one endpoint, returning the caller's declared result type. */
			function call(endpoint, payload, signal) {
				return rpc.call(TEAM_PRESET_CHANNEL, endpoint, payload, signal);
			}
		}
		//#endregion
		//#region lib/types/ui-team/locales.js
		/** Locale bundles for the user-defined team ("编制表") settings section. */
		/** English copy. */
		const en = {
			nav: "Teams",
			sectionIntro: "Teams are your own role rosters (\"编制表\"), stored independently from subagents. Each role binds a prompt (the role's own) to a subagent (a user-defined subagent id that bounds the role's capability surface). A team-shaped deployment delegates to roles by name.",
			loading: "Loading teams…",
			error: "Could not load teams.",
			unavailable: "No user-defined teams yet. Create one to compose a roster of roles.",
			userTrust: "Custom",
			systemTrust: "Built-in",
			enabled: "Enabled",
			disabled: "Disabled",
			brokenBadge: "Failed to load",
			rolesLabel: "Roles",
			roleCount: "roles",
			create: "Create",
			creating: "Creating…",
			createTitle: "Create team",
			createIntro: "A team is one directory holding a team.yml. The identifier becomes its directory name and cannot be changed later; the roster of roles is edited in the team's detail view.",
			detailTitle: "Edit team",
			detailIntro: "Each role binds a prompt (its own, injected as the child's persona) to a subagent (a subagent id bounding what the role may do). Memory decides whether the role is a fresh child per call or a durable one that remembers earlier work.",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			close: "Close",
			roleIdLabel: "Role id",
			roleIdPlaceholder: "A stable id the model names this role by",
			roleDescriptionLabel: "Description",
			roleDescriptionPlaceholder: "One sentence on what this role is for",
			roleSubagentLabel: "Bound subagent",
			roleSubagentPlaceholder: "The subagent bounding this role's capability surface",
			noSubagents: "No usable subagents",
			roleMemoryLabel: "Memory",
			memoryOneShot: "One-shot",
			memoryPersistent: "Persistent",
			rolePromptLabel: "Prompt",
			rolePromptPlaceholder: "Who this role is and how it works (multiline)",
			addRole: "Add role",
			removeRole: "Remove",
			roleSubagentLabelShort: "Subagent",
			roleMemoryLabelShort: "Memory",
			roleIdEmpty: "(unnamed)",
			noRoleSummary: "No description yet.",
			noRoles: "No roles on the roster yet — add one to delegate to this team.",
			roleEditTitle: "Edit role",
			roleEditIntro: "Edit one role on the team's roster. Future role attributes will become one more row in this form.",
			roleEditBack: "Back to roster",
			roleEditSave: "Save role",
			idLabel: "Identifier",
			idPlaceholder: "The id the delegation refers to the team by",
			nameLabel: "Name",
			namePlaceholder: "Display name of the team (defaults to the id)",
			descriptionLabel: "Description",
			descriptionPlaceholder: "One sentence on what this team is for",
			delete: "Delete",
			deleteTitle: "Delete this team?",
			deleteDescription: "The team directory is deleted. A role already running keeps working; new delegations cannot select it.",
			deleteConfirm: "Delete",
			deleting: "Deleting…",
			openLocation: "Open folder",
			showLocation: "Show location",
			revealedPathLabel: "Team files:",
			idRequired: "Give the team an identifier.",
			idInvalid: "Use lowercase letters, digits, and hyphens, starting with a letter or digit.",
			idTaken: "A team with this identifier already exists.",
			roleIdRequired: "Give every role an identifier.",
			roleSubagentRequired: "Bind every role to a subagent.",
			noDescription: "No description."
		};
		/** Simplified Chinese copy. */
		const zh = {
			nav: "团队",
			sectionIntro: "团队是你自定义的角色编制表，与子代理分开存储。每个角色把提示词（角色自己的）绑定到一个子代理（一个用户自定义子代理 id，界定该角色的能力边界）。团队形态的部署按名称把任务委派给角色。",
			loading: "正在加载团队…",
			error: "无法加载团队。",
			unavailable: "还没有自定义团队。创建一个，即可编排一份角色编制表。",
			userTrust: "自定义",
			systemTrust: "内置",
			enabled: "已启用",
			disabled: "已停用",
			brokenBadge: "加载失败",
			rolesLabel: "角色",
			roleCount: "个角色",
			create: "创建",
			creating: "正在创建…",
			createTitle: "创建团队",
			createIntro: "一个团队即一个目录，内含 team.yml。标识符将成为目录名，事后无法更改；角色编制表在团队的详情视图里编辑。",
			detailTitle: "编辑团队",
			detailIntro: "每个角色把提示词（自己的，注入为子代理的 persona）绑定到一个子代理（界定该角色能力范围的子代理 id）。记忆模式决定该角色是每次调用都全新、还是保留可续对话的长期角色。",
			save: "保存",
			saving: "正在保存…",
			cancel: "取消",
			close: "关闭",
			roleIdLabel: "角色 id",
			roleIdPlaceholder: "模型按此 id 引用该角色",
			roleDescriptionLabel: "职责描述",
			roleDescriptionPlaceholder: "一句话说明该角色的职责",
			roleSubagentLabel: "绑定子代理",
			roleSubagentPlaceholder: "界定该角色能力范围的子代理",
			noSubagents: "没有可用子代理",
			roleMemoryLabel: "记忆模式",
			memoryOneShot: "一次性",
			memoryPersistent: "长期",
			rolePromptLabel: "提示词",
			rolePromptPlaceholder: "这个角色是谁、该怎么干活（多行）",
			addRole: "添加角色",
			removeRole: "移除",
			roleSubagentLabelShort: "子代理",
			roleMemoryLabelShort: "记忆",
			roleIdEmpty: "（未命名）",
			noRoleSummary: "尚未填写职责描述。",
			noRoles: "编制表还没有角色，先添加一个角色即可委派此团队。",
			roleEditTitle: "编辑角色",
			roleEditIntro: "编辑团队编制表中的一个角色。以后角色有新的属性时，会在这里多出一行表单字段。",
			roleEditBack: "返回编制表",
			roleEditSave: "保存角色",
			idLabel: "标识符",
			idPlaceholder: "委派按此标识符引用该团队",
			nameLabel: "名称",
			namePlaceholder: "团队显示名称（缺省用 id）",
			descriptionLabel: "描述",
			descriptionPlaceholder: "一句话说明该团队的用途",
			delete: "删除",
			deleteTitle: "删除该团队？",
			deleteDescription: "团队目录将被删除。已在运行的角色不受影响；新委派将无法再选择它。",
			deleteConfirm: "删除",
			deleting: "正在删除…",
			openLocation: "打开目录",
			showLocation: "查看路径",
			revealedPathLabel: "团队文件：",
			idRequired: "请填写团队标识符。",
			idInvalid: "只能使用小写字母、数字与连字符，且以字母或数字开头。",
			idTaken: "该标识符已被占用。",
			roleIdRequired: "请为每个角色填写标识符。",
			roleSubagentRequired: "请为每个角色绑定一个子代理。",
			noDescription: "暂无描述。"
		};
		//#endregion
		//#region lib/types/ui-team/index.js
		/**
		* User-defined team surface plugin, browser half — an independent settings
		* section ("团队"/"编制表") parallel to the subagent section, over its OWN
		* roster (the team registry), fully separate from both the agent-preset list
		* and the subagent list.
		*
		* The section lists every user-defined team with its name, description, role
		* count, and an enable/disable switch on the row, and drives create, edit
		* (over the full role roster), delete, and open-directory through the host.
		*
		* The section's apply is called from the package's single browser client
		* entry (`src/ui/index.ts`) so both settings sections ship in one client
		* bundle; the `settings.subagentTeam` locale namespace keeps its copy apart
		* from the subagent section's `settings.subagentPreset`.
		*/
		/**
		* Mount the independent "团队" settings section.
		* @param ctx - the browser plugin context.
		*/
		function apply$1(ctx) {
			const { api, rpc } = ctx.get("connection");
			const section = new TeamSectionController({
				...api,
				teamPresets: createTeamPresetWire(rpc)
			});
			ctx.effect(() => ctx.locale.register("settings.subagentTeam", {
				zh,
				en
			}), "ui-teams: settings section dictionary");
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
			}, "ui-teams: roster refresh");
			const sectionInjected = () => ({
				hooks: { teamSection: section.store },
				load: () => section.load(),
				beginCreate: () => {
					section.beginCreate();
				},
				cancelCreate: () => {
					section.cancelCreate();
				},
				setCreateId: (id) => {
					section.setCreateId(id);
				},
				setCreateName: (name) => {
					section.setCreateName(name);
				},
				setCreateRoleField: (index, field, value) => {
					section.setCreateRoleField(index, field, value);
				},
				addCreateRole: () => {
					section.addCreateRole();
				},
				removeCreateRole: (index) => {
					section.removeCreateRole(index);
				},
				confirmCreate: () => section.confirmCreate(),
				toggle: (id, enabled) => {
					section.toggle(id, enabled);
				},
				beginDetail: (id) => section.beginDetail(id),
				closeDetail: () => {
					section.closeDetail();
				},
				setDetailName: (name) => {
					section.setDetailName(name);
				},
				setDetailDescription: (description) => {
					section.setDetailDescription(description);
				},
				beginRoleEdit: (index) => {
					section.beginRoleEdit(index);
				},
				addRoleInDetail: () => {
					section.addRoleInDetail();
				},
				setRoleEditField: (field, value) => {
					section.setRoleEditField(field, value);
				},
				saveRoleEdit: async () => {
					section.saveRoleEdit();
				},
				cancelRoleEdit: () => {
					section.cancelRoleEdit();
				},
				removeRole: (index) => {
					section.removeRole(index);
				},
				confirmDetail: () => section.confirmDetail(),
				openLocation: (id) => section.openLocation(id),
				confirmDelete: (id) => {
					section.confirmDelete(id);
				},
				remove: () => section.remove()
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "teams",
				order: 22,
				label: () => ctx.locale.bind("settings.subagentTeam")("nav"),
				locale: "settings.subagentTeam",
				inject: sectionInjected
			}, TeamSection));
		}
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
				zh: zh$1,
				en: en$1
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
			apply$1(ctx);
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