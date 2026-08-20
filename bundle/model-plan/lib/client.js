window.__ModuleLoader__.load({
	id: "dsh-harness-model-plan-bundle",
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
		* Model-plan management controller: the plan roster as a list, a create/edit
		* dialog over a staged draft (name, provider-grouped model pick, and a params
		* bag), set-default, and delete.
		*
		* The host stays the single fact source. Every mutation writes through the
		* wire and the page re-reads the roster afterwards, because a create/edit/
		* default flip changes more than the row it targeted (the default marker
		* recomputes from the host).
		*
		* The params bag is edited as an array of `{ key, value }` rows: every key can
		* be deleted, its value re-typed, its spelling edited inline, and arbitrary
		* new key=value rows appended. The three familiar keys (temperature / maxTokens
		* / reasoningEffort) are pre-seeded with friendly labels, and
		* `reasoningEffort` renders as a dropdown sourced from the selected model's
		* reasoning metadata when that model exposes any. Validation rejects an empty
		* key and a value that is not a legal JSON scalar (the wire's JSON-value
		* vocabulary: string / number / boolean / null / array / object).
		*/
		/** The familiar params pre-seeded into the bag editor. */
		const KNOWN_KEYS = [
			"temperature",
			"reasoningEffort",
			"maxTokens"
		];
		/** A plan id may be named by, mirroring the host's own rule (id = file name). */
		const PLAN_ID = /^[a-z0-9][a-z0-9-]*$/;
		const INITIAL$2 = {
			status: "idle",
			error: null,
			authorable: false,
			rows: [],
			dialog: null,
			pendingDelete: null,
			deleting: false
		};
		/** A fresh empty params-bag (the familiar keys pre-seeded, values blank). */
		function seedParams() {
			return KNOWN_KEYS.map((key) => ({
				key,
				value: ""
			}));
		}
		/** A fresh create draft: id + the pre-seeded params bag. */
		function emptyCreateDraft() {
			return {
				creating: true,
				id: "",
				provider: "",
				model: "",
				params: seedParams(),
				saving: false,
				error: null
			};
		}
		/** The failure message of a rejected wire call. */
		function messageOf$1(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary.
		* Any text `JSON.parse` accepts is a legal JSON value; the empty string is not.
		*/
		function isJsonValue(text) {
			if (text.trim() === "") return false;
			try {
				JSON.parse(text);
				return true;
			} catch {
				return false;
			}
		}
		function planBlocker(draft, creating, rows, ability = { reasoningEffort: null }) {
			if (creating) {
				if (draft.id === "") return "idRequired";
				if (!PLAN_ID.test(draft.id)) return "idInvalid";
				if (rows.some((row) => row.id === draft.id)) return "idTaken";
			}
			if (draft.provider === "" || draft.model === "") return "modelRequired";
			for (const param of draft.params) {
				if (param.key.trim() === "") return "keyRequired";
				if (!isJsonValue(param.value)) return "valueInvalid";
				if (param.value.trim() !== "") {
					if (param.key === "reasoningEffort" && ability.reasoningEffort === false) return "reasoningUnsupported";
				}
			}
		}
		/** Map the wire's params record onto editable draft rows. */
		function paramsToDraft(params) {
			const entries = Object.entries(params);
			return [...KNOWN_KEYS.filter((key) => entries.some(([k]) => k === key)), ...entries.map(([k]) => k).filter((k) => !KNOWN_KEYS.includes(k))].map((key) => ({
				key,
				value: JSON.stringify(params[key])
			}));
		}
		/**
		* Read the roster and drive the create/edit dialog, set-default, and delete.
		*/
		var ModelPlanSectionController = class {
			plans;
			rosterChanged;
			/** Page snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL$2);
			constructor(plans, rosterChanged = () => {}) {
				this.plans = plans;
				this.rosterChanged = rosterChanged;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			patchDialog(patch) {
				const { dialog } = this.store.getSnapshot();
				if (dialog === null) return;
				this.set({ dialog: {
					...dialog,
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
					const result = await this.plans.list({});
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
				const { plans, authorable } = value;
				if (plans.length === 0) {
					this.set({
						status: "unavailable",
						rows: [],
						authorable,
						dialog: null,
						pendingDelete: null
					});
					return;
				}
				this.set({
					status: "ready",
					error: null,
					authorable,
					rows: plans.map(planToRow)
				});
			}
			/** Open the create dialog with the pre-seeded params bag. */
			beginCreate() {
				this.set({
					error: null,
					dialog: emptyCreateDraft()
				});
			}
			/** Open the edit dialog over one plan's full fields. */
			async beginEdit(id) {
				this.set({
					error: null,
					dialog: null
				});
				try {
					const result = await this.plans.read({ id });
					if (!result.ok) {
						this.set({ error: result.error.message });
						return;
					}
					const plan = result.value.plan;
					this.set({ dialog: {
						creating: false,
						id: plan.id,
						provider: plan.provider,
						model: plan.model,
						params: paramsToDraft(plan.params),
						saving: false,
						error: null
					} });
				} catch (error) {
					this.set({ error: messageOf$1(error) });
				}
			}
			/** Close the create/edit dialog, discarding whatever was staged. */
			closeDialog() {
				this.set({ dialog: null });
			}
			/** Set the draft's id (create only). */
			setDialogId(id) {
				this.patchDialog({
					id,
					error: null
				});
			}
			/** Set the draft's provider route (clears the model under a different provider). */
			setDialogProvider(provider) {
				this.patchDialog({
					provider,
					model: "",
					error: null
				});
			}
			/** Set the draft's model id. */
			setDialogModel(model) {
				this.patchDialog({
					model,
					error: null
				});
			}
			/** Set one params-bag row's key (editable inline). */
			setParamKey(index, key) {
				const { dialog } = this.store.getSnapshot();
				if (dialog === null) return;
				this.patchDialog({
					params: dialog.params.map((param, i) => i === index ? {
						...param,
						key
					} : param),
					error: null
				});
			}
			/** Set one params-bag row's value (typed string form). */
			setParamValue(index, value) {
				const { dialog } = this.store.getSnapshot();
				if (dialog === null) return;
				this.patchDialog({
					params: dialog.params.map((param, i) => i === index ? {
						...param,
						value
					} : param),
					error: null
				});
			}
			/** Append an empty params-bag row. */
			addParam() {
				const { dialog } = this.store.getSnapshot();
				if (dialog === null) return;
				this.patchDialog({
					params: [...dialog.params, {
						key: "",
						value: ""
					}],
					error: null
				});
			}
			/** Remove one params-bag row. */
			removeParam(index) {
				const { dialog } = this.store.getSnapshot();
				if (dialog === null) return;
				this.patchDialog({
					params: dialog.params.filter((_, i) => i !== index),
					error: null
				});
			}
			/** Set the draft's `reasoningEffort` value through the dropdown. */
			setReasoningEffort(effort) {
				const { dialog } = this.store.getSnapshot();
				if (dialog === null) return;
				if (dialog.params.find((param) => param.key === "reasoningEffort") === void 0) return;
				this.patchDialog({
					params: dialog.params.map((param) => param.key === "reasoningEffort" ? {
						...param,
						value: effort
					} : param),
					error: null
				});
			}
			/** Submit the create or edit (the draft's own `creating` decides), then re-read. */
			async confirmSave() {
				const draft = this.store.getSnapshot().dialog;
				if (draft === null || draft.saving) return;
				if (planBlocker(draft, draft.creating, this.store.getSnapshot().rows) !== void 0) return;
				this.patchDialog({
					saving: true,
					error: null
				});
				const params = paramsToWire(draft.params);
				try {
					const result = draft.creating ? await this.plans.create({
						id: draft.id,
						provider: draft.provider,
						model: draft.model,
						params
					}) : await this.plans.update({
						id: draft.id,
						provider: draft.provider,
						model: draft.model,
						params
					});
					if (!result.ok) {
						this.patchDialog({
							saving: false,
							error: result.error.message
						});
						return;
					}
					this.set({ dialog: null });
					await this.load();
					this.rosterChanged();
				} catch (error) {
					this.patchDialog({
						saving: false,
						error: messageOf$1(error)
					});
				}
			}
			/** Submit the dialog (create or edit, decided by the draft). */
			confirmCreate() {
				return this.confirmSave();
			}
			/** Submit the dialog (create or edit, decided by the draft). */
			confirmEdit() {
				return this.confirmSave();
			}
			/** Set one plan as the deployment default, then re-read the roster. */
			async setDefault(id) {
				try {
					const result = await this.plans.update({
						id,
						default: true
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
			/** Ask for confirmation before deleting one plan. */
			confirmDelete(id) {
				if (this.store.getSnapshot().deleting) return;
				this.set({ pendingDelete: id });
			}
			/** Delete the plan awaiting confirmation, then re-read the roster. */
			async remove() {
				const { pendingDelete, deleting } = this.store.getSnapshot();
				if (pendingDelete === null || deleting) return;
				this.set({
					deleting: true,
					error: null
				});
				try {
					const result = await this.plans.remove({ id: pendingDelete });
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
		/** Map one wire plan onto a roster row. */
		function planToRow(plan) {
			return {
				id: plan.id,
				provider: plan.provider,
				model: plan.model,
				paramCount: Object.keys(plan.params).length,
				isDefault: plan.isDefault,
				trust: plan.trust,
				...plan.broken === void 0 ? {} : { broken: plan.broken }
			};
		}
		/** Parse the typed draft rows back onto a JSON-value params record (validated by planBlocker). */
		function paramsToWire(params) {
			const bag = {};
			for (const param of params) {
				if (param.key.trim() === "" || !isJsonValue(param.value)) continue;
				bag[param.key] = JSON.parse(param.value);
			}
			return bag;
		}
		//#endregion
		//#region \0dsh-css:bundle/model-plan/src/ui/ModelPlanSection.module.css.mjs
		const css$1 = "._03yStW_section{flex-direction:column;gap:12px;display:flex}._03yStW_title{margin:0;font-size:16px;font-weight:600;line-height:1.4}._03yStW_intro{color:var(--dsw-alias-text-secondary);margin:0;font-size:13px;line-height:1.6}._03yStW_cards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}._03yStW_card{border:1px solid var(--dsw-alias-divider,#80808033);background:var(--dsw-alias-surface-primary);border-radius:8px;flex-direction:column;gap:8px;padding:12px 14px;display:flex}._03yStW_cardBroken{border-color:var(--dsw-alias-state-error-primary)}._03yStW_cardHead{align-items:center;gap:8px;display:flex}._03yStW_cardName{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;overflow:hidden}._03yStW_defaultBadge{color:var(--dsw-alias-state-warning-primary,#b45309);background:var(--dsw-alias-state-warning-soft,#b453091f);white-space:nowrap;border-radius:6px;align-items:center;gap:4px;padding:2px 6px;font-size:12px;display:inline-flex}._03yStW_brokenBadge{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-soft,#dc26261f);white-space:nowrap;border-radius:6px;padding:2px 6px;font-size:12px}._03yStW_cardModel{align-items:center;gap:8px;font-size:13px;display:flex}._03yStW_cardModelValue{color:var(--dsw-alias-text-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}._03yStW_paramSummary{color:var(--dsw-alias-text-tertiary);font-size:12px}._03yStW_cardFoot{align-items:center;gap:4px;display:flex}._03yStW_iconButton{width:28px;height:28px;color:var(--dsw-alias-text-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}._03yStW_iconButton:hover:not(:disabled){background:var(--dsw-alias-surface-hover,#8080801a)}._03yStW_iconButton:disabled{opacity:.4;cursor:default}._03yStW_iconDanger{color:var(--dsw-alias-state-error-primary)}._03yStW_creatorButton{border:1px dashed var(--dsw-alias-divider,#8080804d);color:var(--dsw-alias-text-primary);cursor:pointer;background:0 0;border-radius:8px;align-self:flex-start;align-items:center;gap:6px;padding:6px 12px;font-size:13px;display:inline-flex}._03yStW_creatorButton:disabled{opacity:.4;cursor:default}._03yStW_dialog{width:min(560px,92vw)}._03yStW_dialogScroll{max-height:70vh;overflow-y:auto}._03yStW_dialogFields{flex-direction:column;gap:12px;display:flex}._03yStW_field{flex-direction:column;gap:4px;display:flex}._03yStW_fieldLabel{color:var(--dsw-alias-text-secondary);font-size:12px}._03yStW_input{box-sizing:border-box;border:1px solid var(--dsw-alias-divider,#8080804d);background:var(--dsw-alias-surface-primary);width:100%;color:var(--dsw-alias-text-primary);border-radius:6px;padding:6px 8px;font-size:13px}._03yStW_select{cursor:pointer}._03yStW_modelRow{grid-template-columns:1fr 1fr;gap:8px;display:grid}._03yStW_editorBlock{border:1px solid var(--dsw-alias-divider,#80808033);border-radius:8px;flex-direction:column;gap:8px;padding:10px;display:flex}._03yStW_blockTitle{margin:0;font-size:13px;font-weight:600}._03yStW_paramsHint{color:var(--dsw-alias-text-secondary);margin:0;font-size:12px}._03yStW_paramRow{grid-template-columns:1fr 1fr 28px;align-items:end;gap:8px;display:grid}._03yStW_paramRowBlocked{opacity:.6}._03yStW_paramBlocked{color:var(--dsw-alias-state-error-primary);margin:0;font-size:11px}._03yStW_addParam{border:1px dashed var(--dsw-alias-divider,#8080804d);color:var(--dsw-alias-text-secondary);cursor:pointer;background:0 0;border-radius:6px;align-self:flex-start;align-items:center;gap:4px;padding:4px 10px;font-size:12px;display:inline-flex}._03yStW_customNote{color:var(--dsw-alias-text-tertiary);margin:0;font-size:12px}._03yStW_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px}._03yStW_deleteDialog{width:min(440px,92vw)}._03yStW_deleteConfirm{background:var(--dsw-alias-state-error-primary)}";
		const tagId$1 = "dsh-harness-model-plan-bundle/ModelPlanSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-model-plan-bundle";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ModelPlanSection_module_css_default = {
			"creatorButton": "_03yStW_creatorButton",
			"dialogFields": "_03yStW_dialogFields",
			"brokenBadge": "_03yStW_brokenBadge",
			"addParam": "_03yStW_addParam",
			"deleteConfirm": "_03yStW_deleteConfirm",
			"section": "_03yStW_section",
			"title": "_03yStW_title",
			"select": "_03yStW_select",
			"editorBlock": "_03yStW_editorBlock",
			"fieldLabel": "_03yStW_fieldLabel",
			"cardHead": "_03yStW_cardHead",
			"input": "_03yStW_input",
			"iconButton": "_03yStW_iconButton",
			"paramSummary": "_03yStW_paramSummary",
			"dialog": "_03yStW_dialog",
			"card": "_03yStW_card",
			"paramRowBlocked": "_03yStW_paramRowBlocked",
			"cardFoot": "_03yStW_cardFoot",
			"paramRow": "_03yStW_paramRow",
			"deleteDialog": "_03yStW_deleteDialog",
			"paramBlocked": "_03yStW_paramBlocked",
			"defaultBadge": "_03yStW_defaultBadge",
			"cardModelValue": "_03yStW_cardModelValue",
			"field": "_03yStW_field",
			"paramsHint": "_03yStW_paramsHint",
			"customNote": "_03yStW_customNote",
			"dialogScroll": "_03yStW_dialogScroll",
			"modelRow": "_03yStW_modelRow",
			"blockTitle": "_03yStW_blockTitle",
			"cardModel": "_03yStW_cardModel",
			"intro": "_03yStW_intro",
			"cardBroken": "_03yStW_cardBroken",
			"cardName": "_03yStW_cardName",
			"cards": "_03yStW_cards",
			"iconDanger": "_03yStW_iconDanger",
			"error": "_03yStW_error"
		};
		//#endregion
		//#region lib/types/ui/ModelPlanSection.js
		/**
		* Model-plan settings section ("模型方案"): the independent plan roster as
		* cards, with a create/edit dialog over a staged draft (provider-grouped model
		* pick, and a params bag) and delete with confirmation.
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
		/** The `reasoningEffort` bag row's dropdown choices for the selected model. */
		function reasoningChoices(reasoning) {
			if (reasoning === void 0) return [];
			return [...reasoning.defaultEffort === void 0 ? [""] : [], ...reasoning.efforts.map((effort) => effort.id)];
		}
		/** One plan card: name, model, param summary, default badge, broken marker, and row controls. */
		function PlanCard(props) {
			const { row, t, custom, onEdit, onSetDefault, onDelete } = props;
			const broken = row.broken !== void 0;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: `${ModelPlanSection_module_css_default.card} ${broken ? ModelPlanSection_module_css_default.cardBroken : ""}`,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: ModelPlanSection_module_css_default.cardHead,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: ModelPlanSection_module_css_default.cardName,
								children: row.id
							}),
							row.isDefault ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("defaultLabel"),
								side: "top",
								children: (0, react_jsx_runtime.jsxs)("span", {
									className: ModelPlanSection_module_css_default.defaultBadge,
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}), t("providerDefaultBadge")]
								})
							}) : null,
							broken ? (0, react_jsx_runtime.jsx)("span", {
								className: ModelPlanSection_module_css_default.brokenBadge,
								children: t("brokenBadge")
							}) : null
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: ModelPlanSection_module_css_default.cardModel,
						children: [(0, react_jsx_runtime.jsxs)("span", {
							className: ModelPlanSection_module_css_default.cardModelValue,
							children: [
								row.provider,
								"/",
								row.model
							]
						}), (0, react_jsx_runtime.jsxs)("span", {
							className: ModelPlanSection_module_css_default.paramSummary,
							children: [
								row.paramCount,
								" ",
								t("paramSummary")
							]
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: ModelPlanSection_module_css_default.cardFoot,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("editTitle"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ModelPlanSection_module_css_default.iconButton,
									disabled: !custom,
									onClick: () => onEdit(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("setDefault"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ModelPlanSection_module_css_default.iconButton,
									disabled: !custom || row.isDefault,
									onClick: () => onSetDefault(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {})
								})
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("delete"),
								side: "top",
								children: (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${ModelPlanSection_module_css_default.iconButton} ${ModelPlanSection_module_css_default.iconDanger}`,
									disabled: !custom,
									onClick: () => onDelete(row.id),
									children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
								})
							})
						]
					})
				]
			});
		}
		/** One params-bag row: key + value (value is a typed JSON scalar). */
		function ParamRow(props) {
			const { param, index, reasoningEffortOptions, reasoningUnsupported, t, onKey, onValue, onRemove } = props;
			const isReasoningEffort = param.key === "reasoningEffort";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: `${ModelPlanSection_module_css_default.paramRow} ${reasoningUnsupported ? ModelPlanSection_module_css_default.paramRowBlocked : ""}`,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: ModelPlanSection_module_css_default.field,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: ModelPlanSection_module_css_default.fieldLabel,
							children: t("paramKeyLabel")
						}), (0, react_jsx_runtime.jsx)("input", {
							className: ModelPlanSection_module_css_default.input,
							value: param.key,
							placeholder: t("paramKeyPlaceholder"),
							onChange: (e) => onKey(index, e.target.value)
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: ModelPlanSection_module_css_default.field,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: ModelPlanSection_module_css_default.fieldLabel,
								children: t("paramValueLabel")
							}),
							isReasoningEffort && reasoningEffortOptions.length > 0 ? (0, react_jsx_runtime.jsx)("select", {
								className: `${ModelPlanSection_module_css_default.input} ${ModelPlanSection_module_css_default.select}`,
								value: param.value,
								disabled: reasoningUnsupported,
								onChange: (e) => onValue(index, e.target.value),
								children: reasoningEffortOptions.map((effort) => (0, react_jsx_runtime.jsx)("option", {
									value: JSON.stringify(effort),
									children: effort === "" ? t("reasoningProviderDefault") : effort
								}, effort))
							}) : (0, react_jsx_runtime.jsx)("input", {
								className: ModelPlanSection_module_css_default.input,
								value: param.value,
								disabled: reasoningUnsupported,
								placeholder: t("paramValuePlaceholder"),
								onChange: (e) => onValue(index, e.target.value)
							}),
							reasoningUnsupported ? (0, react_jsx_runtime.jsx)("p", {
								className: ModelPlanSection_module_css_default.paramBlocked,
								children: t("reasoningUnavailable")
							}) : null
						]
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: t("removeParam"),
						side: "top",
						children: (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${ModelPlanSection_module_css_default.iconButton} ${ModelPlanSection_module_css_default.iconDanger}`,
							onClick: () => onRemove(index),
							"aria-label": t("removeParam"),
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
						})
					})
				]
			});
		}
		/** The create/edit dialog: identifier, provider-grouped model pick, and the params bag editor. */
		function PlanDialog(props) {
			const { draft, creating, catalog, rows, t, setDialogId, setDialogProvider, setDialogModel, setParamKey, setParamValue, setReasoningEffort, addParam, removeParam, confirm, cancel } = props;
			const group = catalog.groups.find((g) => g.id === draft.provider);
			const model = group?.models.find((m) => m.id === draft.model);
			const reasoningOptions = reasoningChoices(model?.reasoning);
			const reasoningUnsupported = model !== void 0 && (model.reasoning?.efforts.length ?? 0) === 0;
			const blocker = planBlocker(draft, creating, rows, { reasoningEffort: model === void 0 ? null : !reasoningUnsupported });
			const message = draft.error ?? (blocker === void 0 ? null : t(blocker));
			const catalogFailed = catalog.status === "error";
			const modelSelectable = catalog.status === "ready" && catalog.groups.length > 0;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: cancel,
				title: creating ? t("createTitle") : t("editTitle"),
				closeLabel: t("close"),
				description: creating ? t("createIntro") : t("editIntro"),
				className: ModelPlanSection_module_css_default.dialog,
				contentClassName: ModelPlanSection_module_css_default.dialogScroll,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: draft.saving,
					onClick: cancel,
					children: t("cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: draft.saving || blocker !== void 0,
					onClick: confirm,
					children: draft.saving ? t("saving") : t("save")
				})] }),
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: ModelPlanSection_module_css_default.dialogFields,
					children: [
						creating ? (0, react_jsx_runtime.jsxs)("div", {
							className: ModelPlanSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: ModelPlanSection_module_css_default.fieldLabel,
								children: t("idLabel")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: ModelPlanSection_module_css_default.input,
								value: draft.id,
								placeholder: t("idPlaceholder"),
								onChange: (e) => setDialogId(e.target.value)
							})]
						}) : null,
						(0, react_jsx_runtime.jsxs)("div", {
							className: ModelPlanSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: ModelPlanSection_module_css_default.fieldLabel,
								children: t("modelLabel")
							}), catalogFailed ? (0, react_jsx_runtime.jsx)("p", {
								className: ModelPlanSection_module_css_default.error,
								children: t("error")
							}) : (0, react_jsx_runtime.jsxs)("div", {
								className: ModelPlanSection_module_css_default.modelRow,
								children: [(0, react_jsx_runtime.jsxs)("select", {
									className: `${ModelPlanSection_module_css_default.input} ${ModelPlanSection_module_css_default.select}`,
									value: draft.provider,
									disabled: !modelSelectable,
									onChange: (e) => setDialogProvider(e.target.value),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "",
										disabled: true,
										children: t("modelPlaceholder")
									}), catalog.groups.map((group) => (0, react_jsx_runtime.jsx)("option", {
										value: group.id,
										children: group.name
									}, group.id))]
								}), (0, react_jsx_runtime.jsxs)("select", {
									className: `${ModelPlanSection_module_css_default.input} ${ModelPlanSection_module_css_default.select}`,
									value: draft.model,
									disabled: group === void 0,
									onChange: (e) => setDialogModel(e.target.value),
									children: [(0, react_jsx_runtime.jsx)("option", {
										value: "",
										disabled: true,
										children: t("modelPlaceholder")
									}), group?.models.map((model) => (0, react_jsx_runtime.jsx)("option", {
										value: model.id,
										children: model.name
									}, model.id))]
								})]
							})]
						}),
						(0, react_jsx_runtime.jsxs)("section", {
							className: ModelPlanSection_module_css_default.editorBlock,
							children: [
								(0, react_jsx_runtime.jsx)("h4", {
									className: ModelPlanSection_module_css_default.blockTitle,
									children: t("paramsLabel")
								}),
								(0, react_jsx_runtime.jsx)("p", {
									className: ModelPlanSection_module_css_default.paramsHint,
									children: t("paramsHint")
								}),
								draft.params.map((param, index) => (0, react_jsx_runtime.jsx)(ParamRow, {
									param,
									index,
									reasoningEffortOptions: reasoningOptions,
									reasoningUnsupported,
									t,
									onKey: setParamKey,
									onValue: param.key === "reasoningEffort" ? (_i, v) => setReasoningEffort(v) : setParamValue,
									onRemove: removeParam
								}, `${index}-${param.key}`)),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: ModelPlanSection_module_css_default.addParam,
									onClick: addParam,
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("addParam")]
								})
							]
						}),
						(0, react_jsx_runtime.jsx)("p", {
							className: ModelPlanSection_module_css_default.customNote,
							children: t("customKeyNote")
						}),
						message !== null ? (0, react_jsx_runtime.jsx)("p", {
							className: ModelPlanSection_module_css_default.error,
							children: message
						}) : null
					]
				})
			});
		}
		/**
		* Render the model-plan settings section content column.
		* @param props - composed slot props.
		* @returns the section, or null when the deployment composes no plans.
		*/
		function ModelPlanSection(props) {
			const { useModelPlanSection, useModelCatalog, t, load, loadCatalog } = props;
			const state = useModelPlanSection((snapshot) => snapshot);
			const catalog = useModelCatalog((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				if (state.status === "idle") load();
			}, [state.status, load]);
			(0, react.useEffect)(() => {
				if (state.dialog !== null && catalog.status === "idle") loadCatalog();
			}, [
				state.dialog,
				catalog.status,
				loadCatalog
			]);
			if (state.status === "loading") return (0, react_jsx_runtime.jsx)("div", { children: t("loading") });
			if (state.status === "error") return (0, react_jsx_runtime.jsx)("div", {
				style: { color: "var(--dsw-alias-state-error-primary)" },
				children: t("error")
			});
			if (state.status !== "ready" && state.status !== "unavailable") return null;
			const dialog = state.dialog;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ModelPlanSection_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: ModelPlanSection_module_css_default.title,
						children: t("nav")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: ModelPlanSection_module_css_default.intro,
						children: state.status === "unavailable" ? t("unavailable") : t("sectionIntro")
					}),
					(0, react_jsx_runtime.jsx)("ul", {
						className: ModelPlanSection_module_css_default.cards,
						children: state.rows.map((row) => (0, react_jsx_runtime.jsx)(PlanCard, {
							row,
							t,
							custom: row.trust === "user",
							onEdit: props.beginEdit,
							onSetDefault: props.setDefault,
							onDelete: props.confirmDelete
						}, row.id))
					}),
					(0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: ModelPlanSection_module_css_default.creatorButton,
						disabled: !state.authorable,
						onClick: () => props.beginCreate(),
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("create")]
					}),
					dialog !== null ? (0, react_jsx_runtime.jsx)(PlanDialog, {
						draft: dialog,
						creating: dialog.creating,
						catalog,
						rows: state.rows,
						t,
						setDialogId: props.setDialogId,
						setDialogProvider: props.setDialogProvider,
						setDialogModel: props.setDialogModel,
						setParamKey: props.setParamKey,
						setParamValue: props.setParamValue,
						setReasoningEffort: props.setReasoningEffort,
						addParam: props.addParam,
						removeParam: props.removeParam,
						confirm: () => void (dialog.creating ? props.confirmCreate() : props.confirmEdit()),
						cancel: props.closeDialog
					}) : null,
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.pendingDelete !== null,
						onClose: () => props.confirmDelete(null),
						title: t("deleteTitle"),
						closeLabel: t("close"),
						description: t("deleteDescription"),
						className: ModelPlanSection_module_css_default.deleteDialog,
						footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: state.deleting,
							onClick: () => props.confirmDelete(null),
							children: t("cancel")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: ModelPlanSection_module_css_default.deleteConfirm,
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
		//#region lib/types/ui/directory.js
		const INITIAL$1 = {
			groups: [],
			failures: [],
			status: "idle",
			error: null
		};
		/** The session-independent model-catalog controller shared by every editor. */
		var ModelCatalogController = class {
			models;
			/** The snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL$1);
			constructor(models) {
				this.models = models;
			}
			/**
			* Refresh the catalog. Failure preserves the last good groups and surfaces
			* on the store.
			*/
			async load() {
				const before = this.store.getSnapshot();
				if (before.status === "loading") return;
				this.store.set({
					...before,
					status: "loading",
					error: null
				});
				try {
					const { result } = await this.models.models({});
					if (!result.ok) {
						this.store.set({
							...before,
							status: "error",
							error: `${result.error.code}: ${result.error.message}`
						});
						return;
					}
					this.store.set({
						groups: result.value.groups,
						failures: result.value.failures,
						status: "ready",
						error: null
					});
				} catch (error) {
					this.store.set({
						...before,
						status: "error",
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		};
		//#endregion
		//#region lib/types/ui/mode-store.js
		/**
		* Session model-plan chip controller: the composer model seat's binding state.
		*
		* Each session binds a plan (not a bare model) plus an optional session-level
		* overrides bag. The host stays the single fact source: this controller reads
		* the session's current folded selection (`readSelection`) and the plan roster
		* (`list`) on load, and writes through `select`. A pick flips the local
		* current immediately and the host's reply reconciles it; a rejection (a
		* started session answers `model-plan-locked`) rolls the binding back and
		* surfaces the failure so the chip can tell the user why.
		*/
		const INITIAL = {
			status: "idle",
			planId: void 0,
			overrides: {},
			options: [],
			busy: false,
			error: null,
			locked: false
		};
		/** The failure message of a rejected wire call. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Map a wire plan onto a chip menu option. */
		function planToOption(plan) {
			return {
				id: plan.id,
				provider: plan.provider,
				model: plan.model,
				paramCount: Object.keys(plan.params).length,
				isDefault: plan.isDefault,
				...plan.broken === void 0 ? {} : { broken: plan.broken }
			};
		}
		/**
		* The composer model seat's plan-binding controller. One per session, created
		* on the slot's session-scoped inject.
		*/
		var ModelPlanChipController = class {
			plans;
			sessionId;
			/** Chip snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			constructor(plans, sessionId) {
				this.plans = plans;
				this.sessionId = sessionId;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			/** Read the session's binding and the plan roster (parallel). */
			async load() {
				if (this.store.getSnapshot().status === "loading") return;
				this.set({
					status: "loading",
					error: null,
					locked: false
				});
				try {
					const selectionResult = await this.plans.readSelection({ sessionId: this.sessionId });
					if (!selectionResult.ok) {
						this.set({
							status: "error",
							error: selectionResult.error.message
						});
						return;
					}
					const rosterResult = await this.plans.list({});
					if (!rosterResult.ok) {
						this.set({
							status: "error",
							error: rosterResult.error.message
						});
						return;
					}
					this.set({
						status: "ready",
						planId: selectionResult.value.planId,
						overrides: selectionResult.value.overrides,
						options: rosterResult.value.plans.map(planToOption),
						error: null,
						locked: false
					});
				} catch (error) {
					this.set({
						status: "error",
						error: messageOf(error)
					});
				}
			}
			/**
			* Bind the session to one plan, optionally with session-level overrides.
			* A rejected pick (a started session) rolls the binding back and marks the
			* failure as a lock so the chip can explain it.
			*/
			async select(planId, overrides) {
				if (this.store.getSnapshot().busy) return;
				this.set({
					busy: true,
					error: null,
					locked: false
				});
				try {
					const result = await this.plans.select({
						sessionId: this.sessionId,
						planId,
						...overrides === void 0 || Object.keys(overrides).length === 0 ? {} : { overrides }
					});
					if (!result.ok) {
						const locked = result.error.code === "model-plan-locked";
						this.set({
							busy: false,
							error: result.error.message,
							locked
						});
						return;
					}
					this.set({
						busy: false,
						planId: result.value.planId,
						overrides: result.value.overrides,
						error: null,
						locked: false
					});
				} catch (error) {
					this.set({
						busy: false,
						error: messageOf(error)
					});
				}
			}
		};
		//#endregion
		//#region \0dsh-css:bundle/model-plan/src/ui/ModelPlanChip.module.css.mjs
		const css = "._7vW-La_root{display:inline-flex;position:relative}._7vW-La_chip{border:1px solid var(--dsw-alias-divider,#8080804d);background:var(--dsw-alias-surface-primary);max-width:220px;color:var(--dsw-alias-text-primary);cursor:pointer;text-overflow:ellipsis;white-space:nowrap;border-radius:6px;align-items:center;gap:4px;padding:4px 8px;font-size:13px;display:inline-flex;overflow:hidden}._7vW-La_chip:hover:not(:disabled){background:var(--dsw-alias-surface-hover,#80808014)}._7vW-La_chip:disabled{opacity:.6;cursor:default}._7vW-La_chevron{color:var(--dsw-alias-text-secondary);flex-shrink:0}._7vW-La_menu{z-index:50;background:var(--dsw-alias-surface-primary);border:1px solid var(--dsw-alias-divider,#80808040);border-radius:8px;flex-direction:column;gap:8px;min-width:260px;max-width:340px;padding:8px;display:flex;position:absolute;top:calc(100% + 4px);right:0;box-shadow:0 6px 20px #0000002e}._7vW-La_plans{flex-direction:column;gap:4px;max-height:40vh;display:flex;overflow-y:auto}._7vW-La_option{color:var(--dsw-alias-text-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:6px;flex-direction:column;gap:2px;padding:6px 8px;display:flex}._7vW-La_option:hover:not(:disabled){background:var(--dsw-alias-surface-hover,#8080801a)}._7vW-La_option:disabled{opacity:.6;cursor:default}._7vW-La_selected{background:var(--dsw-alias-surface-hover,#80808024)}._7vW-La_optionBroken{opacity:.6}._7vW-La_optionMain{align-items:center;gap:6px;font-size:13px;font-weight:500;display:flex}._7vW-La_optionName{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._7vW-La_optionDefault{color:var(--dsw-alias-state-warning-primary,#b45309);background:var(--dsw-alias-state-warning-soft,#b453091f);border-radius:4px;flex-shrink:0;padding:0 4px;font-size:11px}._7vW-La_optionBrokenTag{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-soft,#dc26261f);border-radius:4px;flex-shrink:0;padding:0 4px;font-size:11px}._7vW-La_optionModel{color:var(--dsw-alias-text-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}._7vW-La_override{border-top:1px solid var(--dsw-alias-divider,#80808033);flex-direction:column;gap:4px;padding-top:8px;display:flex}._7vW-La_overrideTitle{color:var(--dsw-alias-text-secondary);font-size:12px;font-weight:600}._7vW-La_overrideHint{color:var(--dsw-alias-text-tertiary);font-size:11px}._7vW-La_overrideRow{align-items:center;gap:6px;display:flex}._7vW-La_overrideKey{color:var(--dsw-alias-text-secondary);flex-shrink:0;font-size:12px}._7vW-La_input{border:1px solid var(--dsw-alias-divider,#8080804d);background:var(--dsw-alias-surface-primary);min-width:0;color:var(--dsw-alias-text-primary);border-radius:6px;flex:1;padding:4px 6px;font-size:12px}._7vW-La_applyButton{background:var(--dsw-alias-state-primary,#3b82f6e6);color:#fff;cursor:pointer;border:none;border-radius:6px;flex-shrink:0;padding:4px 10px;font-size:12px}._7vW-La_applyButton:disabled{opacity:.5;cursor:default}._7vW-La_clearButton{color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:none;align-self:flex-start;padding:2px 4px;font-size:12px}._7vW-La_rejected{color:var(--dsw-alias-state-error-primary);align-items:center;gap:6px;font-size:12px;display:flex}._7vW-La_error{color:var(--dsw-alias-state-error-primary);font-size:12px}._7vW-La_empty{color:var(--dsw-alias-text-tertiary);flex-direction:column;gap:2px;padding:4px 8px;font-size:12px;display:flex}._7vW-La_emptyHint{color:var(--dsw-alias-text-tertiary);font-size:11px}";
		const tagId = "dsh-harness-model-plan-bundle/ModelPlanChip.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-model-plan-bundle";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ModelPlanChip_module_css_default = {
			"applyButton": "_7vW-La_applyButton",
			"chevron": "_7vW-La_chevron",
			"clearButton": "_7vW-La_clearButton",
			"empty": "_7vW-La_empty",
			"optionModel": "_7vW-La_optionModel",
			"emptyHint": "_7vW-La_emptyHint",
			"error": "_7vW-La_error",
			"option": "_7vW-La_option",
			"root": "_7vW-La_root",
			"overrideHint": "_7vW-La_overrideHint",
			"plans": "_7vW-La_plans",
			"overrideRow": "_7vW-La_overrideRow",
			"overrideKey": "_7vW-La_overrideKey",
			"optionBroken": "_7vW-La_optionBroken",
			"optionDefault": "_7vW-La_optionDefault",
			"optionName": "_7vW-La_optionName",
			"override": "_7vW-La_override",
			"rejected": "_7vW-La_rejected",
			"chip": "_7vW-La_chip",
			"menu": "_7vW-La_menu",
			"optionMain": "_7vW-La_optionMain",
			"optionBrokenTag": "_7vW-La_optionBrokenTag",
			"overrideTitle": "_7vW-La_overrideTitle",
			"selected": "_7vW-La_selected",
			"input": "_7vW-La_input"
		};
		//#endregion
		//#region lib/types/ui/ModelPlanChip.js
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
		/** The trigger's current label: the bound plan's name, else the default, else a prompt. */
		function triggerLabel(state, t) {
			const bound = state.options.find((option) => option.id === state.planId);
			if (bound !== void 0) return `${t("seatPrefix")}${bound.id}`;
			const fallback = state.options.find((option) => option.isDefault);
			return `${t("seatPrefix")}${fallback?.id ?? t("seatEmpty")}`;
		}
		/**
		* Render the composer model-seat chip.
		* @param props - composed slot props.
		* @returns the chip trigger and, while open, the plan menu.
		*/
		function ModelPlanChip({ locked, useModelPlanChip, t, load, select }) {
			const state = useModelPlanChip((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [overrideTemp, setOverrideTemp] = (0, react.useState)("");
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (state.status === "idle") load();
			}, [state.status, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			const disabled = locked || state.busy;
			const label = triggerLabel(state, t);
			const onTriggerKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					setOpen(false);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
				setOpen(false);
			};
			const applyOverride = () => {
				if (state.planId === void 0) return;
				if (overrideTemp.trim() === "") select(state.planId, {});
				else {
					const parsed = Number(overrideTemp);
					if (!Number.isNaN(parsed)) select(state.planId, { temperature: parsed });
				}
				setOverrideTemp("");
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: ModelPlanChip_module_css_default.root,
				onBlur,
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: state.locked ? t("seatLocked") : state.error ?? t("seatHint"),
					side: "top",
					delayMs: state.locked ? 0 : 500,
					children: (0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						type: "button",
						className: ModelPlanChip_module_css_default.chip,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-label": t("seatSelectAria"),
						title: label,
						disabled,
						onKeyDown: onTriggerKeyDown,
						onClick: () => {
							if (!open) load();
							setOpen((value) => !value);
						},
						children: [label, (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: ModelPlanChip_module_css_default.chevron })]
					})
				}), open && !disabled && (0, react_jsx_runtime.jsxs)("div", {
					className: ModelPlanChip_module_css_default.menu,
					role: "menu",
					"aria-label": t("seatSelect"),
					children: [
						state.status === "error" && (0, react_jsx_runtime.jsx)("div", {
							className: ModelPlanChip_module_css_default.error,
							children: t("error")
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: ModelPlanChip_module_css_default.plans,
							children: state.options.length === 0 ? (0, react_jsx_runtime.jsxs)("div", {
								className: ModelPlanChip_module_css_default.empty,
								children: [(0, react_jsx_runtime.jsx)("div", { children: t("noPlans") }), (0, react_jsx_runtime.jsx)("div", {
									className: ModelPlanChip_module_css_default.emptyHint,
									children: t("noPlansHint")
								})]
							}) : state.options.map((option) => {
								const selected = option.id === state.planId;
								const broken = option.broken !== void 0;
								return (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "menuitemradio",
									"aria-checked": selected,
									className: `${ModelPlanChip_module_css_default.option} ${selected ? ModelPlanChip_module_css_default.selected : ""} ${broken ? ModelPlanChip_module_css_default.optionBroken : ""}`,
									disabled: state.busy,
									onClick: () => {
										select(option.id);
									},
									children: [(0, react_jsx_runtime.jsxs)("span", {
										className: ModelPlanChip_module_css_default.optionMain,
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: ModelPlanChip_module_css_default.optionName,
												children: option.id
											}),
											option.isDefault && (0, react_jsx_runtime.jsx)("span", {
												className: ModelPlanChip_module_css_default.optionDefault,
												children: t("seatDefaultPlan")
											}),
											broken && (0, react_jsx_runtime.jsx)("span", {
												className: ModelPlanChip_module_css_default.optionBrokenTag,
												children: t("brokenPlan")
											})
										]
									}), (0, react_jsx_runtime.jsxs)("span", {
										className: ModelPlanChip_module_css_default.optionModel,
										children: [
											option.provider,
											"/",
											option.model,
											" · ",
											option.paramCount,
											" ",
											t("paramCount")
										]
									})]
								}, option.id);
							})
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: ModelPlanChip_module_css_default.override,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: ModelPlanChip_module_css_default.overrideTitle,
									children: t("seatOverrides")
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ModelPlanChip_module_css_default.overrideHint,
									children: t("seatOverrideHint")
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: ModelPlanChip_module_css_default.overrideRow,
									children: [
										(0, react_jsx_runtime.jsx)("label", {
											className: ModelPlanChip_module_css_default.overrideKey,
											children: t("temperatureKey")
										}),
										(0, react_jsx_runtime.jsx)("input", {
											className: ModelPlanChip_module_css_default.input,
											type: "number",
											step: "0.1",
											value: overrideTemp,
											placeholder: t("paramValuePlaceholder"),
											onChange: (e) => setOverrideTemp(e.target.value)
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: ModelPlanChip_module_css_default.applyButton,
											disabled: state.planId === void 0,
											onClick: applyOverride,
											children: t("save")
										})
									]
								}),
								state.overrides !== void 0 && Object.keys(state.overrides).length > 0 ? (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ModelPlanChip_module_css_default.clearButton,
									onClick: () => {
										if (state.planId !== void 0) select(state.planId, {});
									},
									children: t("seatClearOverrides")
								}) : null
							]
						}),
						state.locked ? (0, react_jsx_runtime.jsxs)("div", {
							className: ModelPlanChip_module_css_default.rejected,
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {}), t("seatSelectRejected")]
						}) : null
					]
				})]
			});
		}
		//#endregion
		//#region lib/types/ui/wire-client.js
		/**
		* Browser transport for the model-plan management wire channel.
		*
		* The model-plan registry ("模型方案") rides the connection's dedicated
		* `/model-plan` channel, so this module adapts
		* {@link ClientConnectionRpc.call} into the management surface the settings
		* section controller and the composer model-seat controller consume. Each
		* method mints the payload the Host handler validates against its zod schema
		* and returns the Host's `RpcResult` — the same success/failure shape the
		* team-management wire returns.
		* @module dsh-harness-model-plan-bundle/ui/wire-client
		*/
		/** Absolute logical channel the Host serves model-plan management on. */
		const MODEL_PLAN_CHANNEL = "/model-plan";
		/** Build the management wire face over one connection RPC caller. */
		function createModelPlanWire(rpc) {
			return {
				list: (payload, signal) => call("list", payload, signal),
				read: (payload, signal) => call("read", payload, signal),
				readSelection: (payload, signal) => call("readSelection", payload, signal),
				create: (payload, signal) => call("create", payload, signal),
				update: (payload, signal) => call("update", payload, signal),
				remove: (payload, signal) => call("remove", payload, signal),
				select: (payload, signal) => call("select", payload, signal)
			};
			/** Call one endpoint, returning the caller's declared result type. */
			function call(endpoint, payload, signal) {
				return rpc.call(MODEL_PLAN_CHANNEL, endpoint, payload, signal);
			}
		}
		//#endregion
		//#region lib/types/ui/locales.js
		/** Locale bundles for the model-plan ("模型方案") settings section and the composer model-seat selector. */
		/** English copy. */
		const en = {
			nav: "Model plans",
			sectionIntro: "Model plans are your fixed assets: each binds a display name to a provider/model plus a bag of params. A session binds a plan (not a bare model), so editing a plan is picked up by every session already bound to it.",
			loading: "Loading model plans…",
			error: "Could not load model plans.",
			unavailable: "No model plans yet. Create one to bind a session to a fixed provider/model.",
			create: "Create",
			creating: "Creating…",
			createTitle: "Create model plan",
			createIntro: "A model plan binds a display name to a provider/model route and a bag of params. Pick the model from the provider-grouped pool; the params ride into every request assembled under this plan.",
			editTitle: "Edit model plan",
			editIntro: "Edit the plan's name, its provider/model route, and its params bag. Sessions already bound to this plan follow the edit (they bind the plan, not a snapshot of it).",
			save: "Save",
			saving: "Saving…",
			cancel: "Cancel",
			close: "Close",
			idLabel: "Identifier",
			idPlaceholder: "Sessions bind to this plan by this identifier",
			modelLabel: "Model",
			modelPlaceholder: "Pick a model from the provider-grouped pool",
			paramsLabel: "Params",
			paramsHint: "Every param rides into the assembled request body.",
			addParam: "Add param",
			paramKeyLabel: "Key",
			paramKeyPlaceholder: "e.g. temperature",
			paramValueLabel: "Value",
			paramValuePlaceholder: "A JSON scalar, e.g. 0.7 or \"high\"",
			removeParam: "Remove",
			temperatureKey: "Temperature",
			maxTokensKey: "Max tokens",
			stopKey: "Stop",
			reasoningEffortKey: "Reasoning effort",
			reasoningProviderDefault: "Provider default",
			paramsEmpty: "No params — the model's defaults apply.",
			keyRequired: "Give every param a key.",
			valueInvalid: "The value must be a valid JSON scalar.",
			reasoningUnavailable: "This model does not support a reasoning effort.",
			reasoningUnsupported: "This model does not support a reasoning effort; remove the value to save.",
			providerDefaultBadge: "Default",
			brokenBadge: "Failed to load",
			setDefault: "Set default",
			defaultLabel: "Default plan",
			delete: "Delete",
			deleteTitle: "Delete this model plan?",
			deleteDescription: "The plan is removed. Sessions already bound to it keep their current plan params; new sessions cannot bind it.",
			deleteConfirm: "Delete",
			deleting: "Deleting…",
			idRequired: "Give the plan an id.",
			idInvalid: "Use a lowercase letter or digit followed by letters, digits, or dashes.",
			idTaken: "A model plan with this identifier already exists.",
			modelRequired: "Pick a model.",
			noPlans: "No plans yet — create one to bind a session to a fixed model.",
			noPlansHint: "Create one in Settings → Model plans.",
			paramSummary: "params",
			paramCount: "params",
			customKeyNote: "Custom keys are passed through into the request body. Registering a key does not mean the provider supports it.",
			seatPrefix: "Plan: ",
			seatEmpty: "Select a plan",
			seatHint: "Model plan for this session",
			seatLocked: "The conversation has started; the model plan can no longer be changed.",
			seatSelect: "Model plan",
			seatSelectAria: "Choose the model plan for this session",
			seatOverrides: "Session overrides",
			seatOverrideHint: "Temporarily adjust params for this session only.",
			seatClearOverrides: "Clear overrides",
			seatSelectRejected: "The session has already started; the plan binding was not changed.",
			seatDefaultPlan: "Default plan",
			brokenPlan: "Failed to load"
		};
		/** Simplified Chinese copy. */
		const zh = {
			nav: "模型方案",
			sectionIntro: "模型方案是你的固定资产：每个方案把一个显示名绑定到一个 provider/型号，外加一袋参数。会话绑定的是方案（而非裸型号），所以编辑方案后，已绑定它的会话会跟着生效。",
			loading: "正在加载模型方案…",
			error: "无法加载模型方案。",
			unavailable: "还没有模型方案。创建一个，即可把会话绑定到固定的 provider/型号。",
			create: "创建",
			creating: "正在创建…",
			createTitle: "创建模型方案",
			createIntro: "一个模型方案把一个显示名绑定到一个 provider/型号，外加一袋参数。从按 provider 分组的型号池里选型号；这袋参数会带进该方案下每次组装的请求。",
			editTitle: "编辑模型方案",
			editIntro: "编辑方案的名字、它的 provider/型号，以及参数袋。已绑定该方案的会话会跟随编辑（它们绑的是方案本身，不是它的一份快照）。",
			save: "保存",
			saving: "正在保存…",
			cancel: "取消",
			close: "关闭",
			idLabel: "标识符",
			idPlaceholder: "会话按此标识符绑定该方案",
			modelLabel: "型号",
			modelPlaceholder: "从按 provider 分组的型号池里选",
			paramsLabel: "参数",
			paramsHint: "每个参数都会带进组装的请求体。",
			addParam: "添加参数",
			paramKeyLabel: "键",
			paramKeyPlaceholder: "例如 temperature",
			paramValueLabel: "值",
			paramValuePlaceholder: "合法的 JSON 标量，如 0.7 或 \"high\"",
			removeParam: "移除",
			temperatureKey: "温度",
			maxTokensKey: "最大 tokens",
			stopKey: "停止词",
			reasoningEffortKey: "推理档位",
			reasoningProviderDefault: "跟随服务商默认",
			paramsEmpty: "没有参数——使用型号默认值。",
			keyRequired: "请为每个参数填写键。",
			valueInvalid: "值必须是合法的 JSON 标量。",
			reasoningUnavailable: "该型号不支持思考档。",
			reasoningUnsupported: "该型号不支持思考档；请删除该值后再保存。",
			providerDefaultBadge: "默认",
			brokenBadge: "加载失败",
			setDefault: "设为默认",
			defaultLabel: "默认方案",
			delete: "删除",
			deleteTitle: "删除该模型方案？",
			deleteDescription: "该方案将被删除。已绑定它的会话继续使用当前的方案参数；新会话将无法再绑定它。",
			deleteConfirm: "删除",
			deleting: "正在删除…",
			idRequired: "请填写方案 id。",
			idInvalid: "以小写字母或数字开头，后面只能是小写字母、数字或短横线。",
			idTaken: "该标识符已被占用。",
			modelRequired: "请选择一个型号。",
			noPlans: "还没有方案——创建一个，即可把会话绑定到固定型号。",
			noPlansHint: "请到「设置 → 模型方案」里创建。",
			paramSummary: "个参数",
			paramCount: "个参数",
			customKeyNote: "自定义键将透传进请求体。登记不代表服务商支持该参数。",
			seatPrefix: "方案：",
			seatEmpty: "选择方案",
			seatHint: "本会话的模型方案",
			seatLocked: "对话已开始，模型方案无法再更改。",
			seatSelect: "模型方案",
			seatSelectAria: "选择本会话的模型方案",
			seatOverrides: "会话临时覆盖",
			seatOverrideHint: "仅对本会话临时调整参数。",
			seatClearOverrides: "清除覆盖",
			seatSelectRejected: "会话已开始，方案绑定未能更改。",
			seatDefaultPlan: "默认方案",
			brokenPlan: "加载失败"
		};
		//#endregion
		//#region lib/types/ui/index.js
		/**
		* Model-plan surface plugin, browser half — an independent settings section
		* ("模型方案") plus the composer model-seat selector, both over the `/model-plan`
		* wire channel.
		*
		* The settings section lists every user-defined plan with its name, model,
		* param summary, default marker, and broken flag, and drives create/edit (over
		* a staged draft with a provider-grouped model pick and a params bag),
		* set-default, and delete. The composer model seat replaces the official model
		* selector with a plan-bound picker.
		*
		* The section's apply is called from the package's single browser client entry
		* so both surfaces ship in one client bundle; the `settings.modelPlan` locale
		* namespace keeps the copy apart from the subagent/team sections'.
		*/
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* Mount the model-plan settings section and the composer model-seat selector.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const { api, rpc } = ctx.get("connection");
			const plans = createModelPlanWire(rpc);
			const section = new ModelPlanSectionController(plans);
			const catalog = new ModelCatalogController(api.llm);
			ctx.effect(() => ctx.locale.register("settings.modelPlan", {
				zh,
				en
			}), "ui-model-plan: settings section dictionary");
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
			}, "ui-model-plan: roster refresh");
			const sectionInjected = () => ({
				hooks: {
					modelPlanSection: section.store,
					modelCatalog: catalog.store
				},
				load: () => section.load(),
				loadCatalog: () => catalog.load(),
				beginCreate: () => {
					section.beginCreate();
				},
				beginEdit: (id) => section.beginEdit(id),
				closeDialog: () => {
					section.closeDialog();
				},
				setDialogId: (id) => {
					section.setDialogId(id);
				},
				setDialogProvider: (provider) => {
					section.setDialogProvider(provider);
				},
				setDialogModel: (model) => {
					section.setDialogModel(model);
				},
				setParamKey: (index, key) => {
					section.setParamKey(index, key);
				},
				setParamValue: (index, value) => {
					section.setParamValue(index, value);
				},
				addParam: () => {
					section.addParam();
				},
				removeParam: (index) => {
					section.removeParam(index);
				},
				setReasoningEffort: (effort) => {
					section.setReasoningEffort(effort);
				},
				confirmCreate: () => section.confirmCreate(),
				confirmEdit: () => section.confirmEdit(),
				setDefault: (id) => {
					section.setDefault(id);
				},
				confirmDelete: (id) => {
					section.confirmDelete(id);
				},
				remove: () => section.remove()
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "model-plans",
				order: 23,
				label: () => ctx.locale.bind("settings.modelPlan")("nav"),
				locale: "settings.modelPlan",
				inject: sectionInjected
			}, ModelPlanSection));
			ctx.slots.inject("conversation.input.model", () => ctx.slots.register({
				name: "conversation.input.model",
				priority: -1,
				locale: "settings.modelPlan",
				inject: (sessionId) => {
					const chip = new ModelPlanChipController(plans, sessionId);
					return {
						hooks: { modelPlanChip: chip.store },
						load: () => chip.load(),
						select: (planId, overrides) => chip.select(planId, overrides)
					};
				}
			}, ModelPlanChip));
		}
		//#endregion
		exports.KNOWN_KEYS = KNOWN_KEYS;
		exports.ModelCatalogController = ModelCatalogController;
		exports.ModelPlanChipController = ModelPlanChipController;
		exports.ModelPlanSectionController = ModelPlanSectionController;
		exports.apply = apply;
		exports.inject = inject;
		exports.isJsonValue = isJsonValue;
		exports.planBlocker = planBlocker;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map