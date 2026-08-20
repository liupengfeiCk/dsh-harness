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
		* new key=value rows appended. Every row is a plain key + value input — the bag
		* is passed through to the LLM request verbatim, so the editor judges nothing
		* about a key's meaning or capability. Three common wire names (temperature /
		* max_tokens / top_p) are pre-seeded blank. Validation rejects an empty key and
		* a value that is not a legal JSON scalar (the wire's JSON-value vocabulary:
		* string / number / boolean / null / array / object).
		*/
		/** The common wire names pre-seeded into the bag editor (blank, all removable). */
		const KNOWN_KEYS = [
			"temperature",
			"max_tokens",
			"top_p"
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
		function planBlocker(draft, creating, rows) {
			if (creating) {
				if (draft.id === "") return "idRequired";
				if (!PLAN_ID.test(draft.id)) return "idInvalid";
				if (rows.some((row) => row.id === draft.id)) return "idTaken";
			}
			if (draft.provider === "" || draft.model === "") return "modelRequired";
			for (const param of draft.params) {
				if (param.key.trim() === "") return "keyRequired";
				if (!isJsonValue(param.value)) return "valueInvalid";
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
		const css$1 = "._3Ut5vG_section{flex-direction:column;gap:12px;display:flex}._3Ut5vG_title{margin:0;font-size:16px;font-weight:600;line-height:1.4}._3Ut5vG_intro{color:var(--dsw-alias-text-secondary);margin:0;font-size:13px;line-height:1.6}._3Ut5vG_cards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}._3Ut5vG_card{border:1px solid var(--dsw-alias-divider,#80808033);background:var(--dsw-alias-surface-primary);border-radius:8px;flex-direction:column;gap:8px;padding:12px 14px;display:flex}._3Ut5vG_cardBroken{border-color:var(--dsw-alias-state-error-primary)}._3Ut5vG_cardHead{align-items:center;gap:8px;display:flex}._3Ut5vG_cardName{text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;overflow:hidden}._3Ut5vG_defaultBadge{color:var(--dsw-alias-state-warning-primary,#b45309);background:var(--dsw-alias-state-warning-soft,#b453091f);white-space:nowrap;border-radius:6px;align-items:center;gap:4px;padding:2px 6px;font-size:12px;display:inline-flex}._3Ut5vG_brokenBadge{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-soft,#dc26261f);white-space:nowrap;border-radius:6px;padding:2px 6px;font-size:12px}._3Ut5vG_cardModel{align-items:center;gap:8px;font-size:13px;display:flex}._3Ut5vG_cardModelValue{color:var(--dsw-alias-text-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}._3Ut5vG_paramSummary{color:var(--dsw-alias-text-tertiary);font-size:12px}._3Ut5vG_cardFoot{align-items:center;gap:4px;display:flex}._3Ut5vG_iconButton{width:28px;height:28px;color:var(--dsw-alias-text-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}._3Ut5vG_iconButton:hover:not(:disabled){background:var(--dsw-alias-surface-hover,#8080801a)}._3Ut5vG_iconButton:disabled{opacity:.4;cursor:default}._3Ut5vG_iconDanger{color:var(--dsw-alias-state-error-primary)}._3Ut5vG_creatorButton{border:1px dashed var(--dsw-alias-divider,#8080804d);color:var(--dsw-alias-text-primary);cursor:pointer;background:0 0;border-radius:8px;align-self:flex-start;align-items:center;gap:6px;padding:6px 12px;font-size:13px;display:inline-flex}._3Ut5vG_creatorButton:disabled{opacity:.4;cursor:default}._3Ut5vG_dialog{width:min(560px,92vw)}._3Ut5vG_dialogScroll{max-height:70vh;overflow-y:auto}._3Ut5vG_dialogFields{flex-direction:column;gap:12px;display:flex}._3Ut5vG_field{flex-direction:column;gap:4px;display:flex}._3Ut5vG_fieldLabel{color:var(--dsw-alias-text-secondary);font-size:12px}._3Ut5vG_input{box-sizing:border-box;border:1px solid var(--dsw-alias-divider,#8080804d);background:var(--dsw-alias-surface-primary);width:100%;color:var(--dsw-alias-text-primary);border-radius:6px;padding:6px 8px;font-size:13px}._3Ut5vG_select{cursor:pointer}._3Ut5vG_modelRow{grid-template-columns:1fr 1fr;gap:8px;display:grid}._3Ut5vG_editorBlock{border:1px solid var(--dsw-alias-divider,#80808033);border-radius:8px;flex-direction:column;gap:8px;padding:10px;display:flex}._3Ut5vG_blockTitle{margin:0;font-size:13px;font-weight:600}._3Ut5vG_paramsHint{color:var(--dsw-alias-text-secondary);margin:0;font-size:12px}._3Ut5vG_paramRow{grid-template-columns:1fr 1fr 28px;align-items:end;gap:8px;display:grid}._3Ut5vG_addParam{border:1px dashed var(--dsw-alias-divider,#8080804d);color:var(--dsw-alias-text-secondary);cursor:pointer;background:0 0;border-radius:6px;align-self:flex-start;align-items:center;gap:4px;padding:4px 10px;font-size:12px;display:inline-flex}._3Ut5vG_customNote{color:var(--dsw-alias-text-tertiary);margin:0;font-size:12px}._3Ut5vG_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px}._3Ut5vG_deleteDialog{width:min(440px,92vw)}._3Ut5vG_deleteConfirm{background:var(--dsw-alias-state-error-primary)}";
		const tagId$1 = "dsh-harness-model-plan-bundle/ModelPlanSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-model-plan-bundle";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ModelPlanSection_module_css_default = {
			"cardModel": "_3Ut5vG_cardModel",
			"defaultBadge": "_3Ut5vG_defaultBadge",
			"deleteConfirm": "_3Ut5vG_deleteConfirm",
			"cardModelValue": "_3Ut5vG_cardModelValue",
			"modelRow": "_3Ut5vG_modelRow",
			"card": "_3Ut5vG_card",
			"title": "_3Ut5vG_title",
			"paramsHint": "_3Ut5vG_paramsHint",
			"iconDanger": "_3Ut5vG_iconDanger",
			"dialogScroll": "_3Ut5vG_dialogScroll",
			"editorBlock": "_3Ut5vG_editorBlock",
			"input": "_3Ut5vG_input",
			"cards": "_3Ut5vG_cards",
			"select": "_3Ut5vG_select",
			"cardHead": "_3Ut5vG_cardHead",
			"cardBroken": "_3Ut5vG_cardBroken",
			"brokenBadge": "_3Ut5vG_brokenBadge",
			"error": "_3Ut5vG_error",
			"creatorButton": "_3Ut5vG_creatorButton",
			"cardFoot": "_3Ut5vG_cardFoot",
			"blockTitle": "_3Ut5vG_blockTitle",
			"addParam": "_3Ut5vG_addParam",
			"cardName": "_3Ut5vG_cardName",
			"customNote": "_3Ut5vG_customNote",
			"paramSummary": "_3Ut5vG_paramSummary",
			"paramRow": "_3Ut5vG_paramRow",
			"intro": "_3Ut5vG_intro",
			"deleteDialog": "_3Ut5vG_deleteDialog",
			"dialogFields": "_3Ut5vG_dialogFields",
			"section": "_3Ut5vG_section",
			"iconButton": "_3Ut5vG_iconButton",
			"dialog": "_3Ut5vG_dialog",
			"fieldLabel": "_3Ut5vG_fieldLabel",
			"field": "_3Ut5vG_field"
		};
		//#endregion
		//#region lib/types/ui/ModelPlanSection.js
		/**
		* Model-plan settings section ("模型方案"): the independent plan roster as
		* cards, with a create/edit dialog over a staged draft (provider-grouped model
		* pick, and a params bag) and delete with confirmation.
		*
		* The model pick reads the session-independent host catalog (`llm.models`):
		* provider-grouped. The params bag is an array of editable key/value rows —
		* every key can be deleted, re-valued, its spelling edited inline, and new
		* key=value rows appended. Every row is a plain key + value input: the bag is
		* passed through to the LLM request verbatim, so the editor judges nothing
		* about a key's meaning or capability. A note reminds the user that the params
		* pass through into the request body.
		*
		* A shipped (system) plan is read-only: it cannot be edited or deleted.
		*/
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
		/** One params-bag row: a plain key + value input (value is a typed JSON scalar). */
		function ParamRow(props) {
			const { param, index, t, onKey, onValue, onRemove } = props;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ModelPlanSection_module_css_default.paramRow,
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
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: ModelPlanSection_module_css_default.fieldLabel,
							children: t("paramValueLabel")
						}), (0, react_jsx_runtime.jsx)("input", {
							className: ModelPlanSection_module_css_default.input,
							value: param.value,
							placeholder: t("paramValuePlaceholder"),
							onChange: (e) => onValue(index, e.target.value)
						})]
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
			const { draft, creating, catalog, rows, t, setDialogId, setDialogProvider, setDialogModel, setParamKey, setParamValue, addParam, removeParam, confirm, cancel } = props;
			const group = catalog.groups.find((g) => g.id === draft.provider);
			const blocker = planBlocker(draft, creating, rows);
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
									t,
									onKey: setParamKey,
									onValue: setParamValue,
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
			overrideDraft: [],
			overrideError: null,
			options: [],
			busy: false,
			error: null,
			locked: false
		};
		/** The failure message of a rejected wire call. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** The common wire names pre-seeded into the override editor (blank, all removable). */
		const KNOWN_KEYS$1 = [
			"temperature",
			"max_tokens",
			"top_p"
		];
		/**
		* Whether a text is a legal JSON scalar per the wire's JSON-value vocabulary
		* (string / number / boolean / null / array / object). The empty string is not.
		* Mirrors the settings section's own check so both surfaces agree.
		*/
		function isJsonValue$1(text) {
			if (text.trim() === "") return false;
			try {
				JSON.parse(text);
				return true;
			} catch {
				return false;
			}
		}
		/** Map an overrides record onto editable draft rows (familiar-key order first). */
		function overridesToDraft(overrides) {
			const entries = Object.entries(overrides);
			if (entries.length === 0) return [{
				key: "",
				value: ""
			}];
			return [...KNOWN_KEYS$1.filter((key) => entries.some(([k]) => k === key)), ...entries.map(([k]) => k).filter((k) => !KNOWN_KEYS$1.includes(k))].map((key) => ({
				key,
				value: JSON.stringify(overrides[key])
			}));
		}
		/** Parse the typed override rows back onto a JSON-value params record. */
		function draftToOverrides(rows) {
			const bag = {};
			for (const row of rows) {
				if (row.key.trim() === "" || !isJsonValue$1(row.value)) continue;
				bag[row.key] = JSON.parse(row.value);
			}
			return bag;
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
						overrideDraft: overridesToDraft(selectionResult.value.overrides),
						overrideError: null,
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
			*
			* When `overrides` is omitted the CURRENT session overrides are carried over
			* to the new plan (a plan switch never drops the user's live overrides — they
			* ride above whichever plan is bound), so "换方案后覆盖仍在且优先级高于方案参数"
			* holds. Pass an explicit `{}` to clear them.
			*/
			async select(planId, overrides) {
				const before = this.store.getSnapshot();
				if (before.busy) return;
				const effective = overrides ?? before.overrides;
				this.set({
					busy: true,
					error: null,
					locked: false,
					overrideError: null
				});
				try {
					const result = await this.plans.select({
						sessionId: this.sessionId,
						planId,
						...Object.keys(effective).length === 0 ? {} : { overrides: effective }
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
						overrideDraft: overridesToDraft(result.value.overrides),
						overrideError: null,
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
			/**
			* Seed the override editor from the current session overrides (an empty bag
			* yields one blank row to type into). Called when the menu opens so the
			* active overrides are always visible and editable.
			*/
			beginOverrideDraft() {
				const { overrides, busy } = this.store.getSnapshot();
				if (busy) return;
				this.set({
					overrideDraft: overridesToDraft(overrides),
					overrideError: null
				});
			}
			/** Set one override row's key (editable inline). */
			setOverrideKey(index, key) {
				this.patchOverrideDraft((rows) => rows.map((row, i) => i === index ? {
					...row,
					key
				} : row));
			}
			/** Set one override row's value (typed string form). */
			setOverrideValue(index, value) {
				this.patchOverrideDraft((rows) => rows.map((row, i) => i === index ? {
					...row,
					value
				} : row));
			}
			/** Append an empty override row. */
			addOverrideRow() {
				this.patchOverrideDraft((rows) => [...rows, {
					key: "",
					value: ""
				}]);
			}
			/** Remove one override row. */
			removeOverrideRow(index) {
				this.patchOverrideDraft((rows) => rows.filter((_, i) => i !== index));
			}
			/** The first blocker preventing the override draft from saving, as a reason, or null. */
			overrideBlocker() {
				for (const row of this.store.getSnapshot().overrideDraft) {
					if (row.key.trim() === "") return "key";
					if (!isJsonValue$1(row.value)) return "value";
				}
				return null;
			}
			/**
			* Save the staged override rows as this session's overrides bag, then
			* refresh the selection. The bag rides above the bound plan's params on the
			* next request (merge: session overrides > plan params).
			*/
			async applyOverrides() {
				const { planId, busy } = this.store.getSnapshot();
				if (planId === void 0 || busy) return;
				const blocker = this.overrideBlocker();
				if (blocker !== null) {
					this.set({ overrideError: blocker === "key" ? "key" : "value" });
					return;
				}
				await this.select(planId, draftToOverrides(this.store.getSnapshot().overrideDraft));
			}
			/** Clear every session override, returning the session to its pure plan params. */
			async clearOverrides() {
				const { planId, busy } = this.store.getSnapshot();
				if (planId === void 0 || busy) return;
				await this.select(planId, {});
			}
			/** Patch the staged override rows, clearing the last save error. */
			patchOverrideDraft(update) {
				this.set({
					overrideDraft: update(this.store.getSnapshot().overrideDraft),
					overrideError: null
				});
			}
		};
		//#endregion
		//#region \0dsh-css:bundle/model-plan/src/ui/ModelPlanChip.module.css.mjs
		const css = ".wp_f9q_root{display:inline-flex;position:relative}.wp_f9q_chip{border:1px solid var(--dsw-alias-border-l2,#8080804d);background:var(--dsw-alias-interactive-bg-hover,#80808014);max-width:220px;color:var(--dsw-alias-label-primary);cursor:pointer;text-overflow:ellipsis;white-space:nowrap;border-radius:6px;align-items:center;gap:4px;padding:4px 8px;font-size:13px;display:inline-flex;overflow:hidden}.wp_f9q_chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,#80808014)}.wp_f9q_chip:disabled{opacity:.6;cursor:default}.wp_f9q_chevron{color:var(--dsw-alias-label-caption);flex-shrink:0}.wp_f9q_menu{z-index:1100;box-sizing:border-box;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-inverted);min-width:260px;max-width:340px;box-shadow:var(--dsw-shadow-lv3);border-radius:8px;flex-direction:column;gap:8px;padding:8px;display:flex;position:fixed;top:auto;left:auto}.wp_f9q_plans{flex-direction:column;gap:4px;max-height:40vh;display:flex;overflow-y:auto}.wp_f9q_option{color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:6px;flex-direction:column;gap:2px;padding:6px 8px;display:flex}.wp_f9q_option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8080801a)}.wp_f9q_option:disabled{opacity:.6;cursor:default}.wp_f9q_selected{background:var(--dsw-alias-interactive-bg-hover-solid,#80808024)}.wp_f9q_optionBroken{opacity:.6}.wp_f9q_optionMain{align-items:center;gap:6px;font-size:13px;font-weight:500;display:flex}.wp_f9q_optionName{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.wp_f9q_optionDefault{color:var(--dsw-alias-state-warn-primary,#b45309);background:var(--dsw-alias-state-warn-tertiary,#b453091f);border-radius:4px;flex-shrink:0;padding:0 4px;font-size:11px}.wp_f9q_optionBrokenTag{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger,#dc26261f);border-radius:4px;flex-shrink:0;padding:0 4px;font-size:11px}.wp_f9q_optionModel{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.wp_f9q_override{border-top:1px solid var(--dsw-alias-border-l2,#80808033);flex-direction:column;gap:6px;padding-top:10px;display:flex}.wp_f9q_overrideHead{align-items:center;gap:6px;display:flex}.wp_f9q_overrideTitle{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}.wp_f9q_overrideCount{color:var(--dsw-alias-state-business-primary,#3b82f6e6);background:var(--dsw-alias-state-business-tertiary,#3b82f61f);border-radius:8px;padding:0 5px;font-size:11px;font-weight:500}.wp_f9q_overrideHint{color:var(--dsw-alias-label-tertiary);font-size:11px}.wp_f9q_overrideTable{flex-direction:column;gap:4px;display:flex}.wp_f9q_overrideCols{grid-template-columns:1fr 1fr 24px;gap:6px;display:grid}.wp_f9q_overrideColKey,.wp_f9q_overrideColValue{color:var(--dsw-alias-label-tertiary);font-size:11px}.wp_f9q_overrideColRemove{width:24px}.wp_f9q_overrideRow{grid-template-columns:1fr 1fr 24px;align-items:center;gap:6px;display:grid}.wp_f9q_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#8080804d);background:var(--dsw-alias-bg-layer-2);width:100%;min-width:0;color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 6px;font-size:12px}.wp_f9q_removeRowButton{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:5px;justify-content:center;align-items:center;padding:0;display:inline-flex}.wp_f9q_removeRowButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8080801a);color:var(--dsw-alias-state-error-primary)}.wp_f9q_addOverride{border:1px dashed var(--dsw-alias-border-l2,#8080804d);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:6px;align-self:flex-start;align-items:center;gap:4px;padding:3px 8px;font-size:12px;display:inline-flex}.wp_f9q_overrideError{color:var(--dsw-alias-state-error-primary);font-size:11px}.wp_f9q_overrideActions{align-items:center;gap:8px;display:flex}.wp_f9q_applyButton{background:var(--dsw-alias-button-info-fill,#3b82f6e6);color:#fff;cursor:pointer;border:none;border-radius:6px;flex-shrink:0;padding:4px 12px;font-size:12px}.wp_f9q_applyButton:disabled{opacity:.5;cursor:default}.wp_f9q_clearButton{color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:none;padding:4px 6px;font-size:12px}.wp_f9q_clearButton:disabled{opacity:.5;cursor:default}.wp_f9q_rejected{color:var(--dsw-alias-state-error-primary);align-items:center;gap:6px;font-size:12px;display:flex}.wp_f9q_error{color:var(--dsw-alias-state-error-primary);font-size:12px}.wp_f9q_empty{color:var(--dsw-alias-label-tertiary);flex-direction:column;gap:2px;padding:4px 8px;font-size:12px;display:flex}.wp_f9q_emptyHint{color:var(--dsw-alias-label-tertiary);font-size:11px}";
		const tagId = "dsh-harness-model-plan-bundle/ModelPlanChip.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-model-plan-bundle";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ModelPlanChip_module_css_default = {
			"override": "wp_f9q_override",
			"error": "wp_f9q_error",
			"selected": "wp_f9q_selected",
			"applyButton": "wp_f9q_applyButton",
			"empty": "wp_f9q_empty",
			"emptyHint": "wp_f9q_emptyHint",
			"chevron": "wp_f9q_chevron",
			"overrideCols": "wp_f9q_overrideCols",
			"overrideRow": "wp_f9q_overrideRow",
			"overrideColKey": "wp_f9q_overrideColKey",
			"addOverride": "wp_f9q_addOverride",
			"clearButton": "wp_f9q_clearButton",
			"overrideHint": "wp_f9q_overrideHint",
			"overrideError": "wp_f9q_overrideError",
			"overrideCount": "wp_f9q_overrideCount",
			"root": "wp_f9q_root",
			"plans": "wp_f9q_plans",
			"optionMain": "wp_f9q_optionMain",
			"overrideTitle": "wp_f9q_overrideTitle",
			"overrideColValue": "wp_f9q_overrideColValue",
			"rejected": "wp_f9q_rejected",
			"overrideActions": "wp_f9q_overrideActions",
			"chip": "wp_f9q_chip",
			"optionName": "wp_f9q_optionName",
			"overrideColRemove": "wp_f9q_overrideColRemove",
			"removeRowButton": "wp_f9q_removeRowButton",
			"menu": "wp_f9q_menu",
			"optionBrokenTag": "wp_f9q_optionBrokenTag",
			"optionBroken": "wp_f9q_optionBroken",
			"option": "wp_f9q_option",
			"overrideTable": "wp_f9q_overrideTable",
			"optionDefault": "wp_f9q_optionDefault",
			"overrideHead": "wp_f9q_overrideHead",
			"optionModel": "wp_f9q_optionModel",
			"input": "wp_f9q_input"
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
			const overrideCount = Object.keys(state.overrides).length;
			const bound = state.options.find((option) => option.id === state.planId);
			if (bound !== void 0) {
				const base = `${t("seatPrefix")}${bound.id}`;
				return overrideCount > 0 ? `${base} · ${overrideCount}` : base;
			}
			const fallback = state.options.find((option) => option.isDefault);
			return `${t("seatPrefix")}${fallback?.id ?? t("seatEmpty")}`;
		}
		/**
		* Render the composer model-seat chip.
		* @param props - composed slot props.
		* @returns the chip trigger and, while open, the plan menu.
		*/
		function ModelPlanChip({ locked, useModelPlanChip, t, load, select, beginOverrideDraft, setOverrideKey, setOverrideValue, addOverrideRow, removeOverrideRow, overrideBlocker, applyOverrides, clearOverrides }) {
			const state = useModelPlanChip((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			const menuRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const [menuPos, setMenuPos] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (state.status === "idle") load();
			}, [state.status, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			(0, react.useLayoutEffect)(() => {
				if (!open) {
					setMenuPos(null);
					return;
				}
				const place = () => {
					const trigger = triggerRef.current;
					if (trigger === null) return;
					const r = trigger.getBoundingClientRect();
					const menuEl = menuRef.current;
					const MARGIN = 12;
					const vw = window.innerWidth;
					const vh = window.innerHeight;
					const mw = menuEl?.offsetWidth ?? 0;
					const mh = menuEl?.offsetHeight ?? 0;
					let x = r.right - mw;
					let y = r.top - mh - 4;
					if (mw > 0) x = Math.min(Math.max(x, MARGIN), vw - mw - MARGIN);
					if (mh > 0) y = Math.min(Math.max(y, MARGIN), vh - mh - MARGIN);
					setMenuPos({
						left: x,
						top: y
					});
				};
				place();
				window.addEventListener("scroll", place, true);
				window.addEventListener("resize", place);
				return () => {
					window.removeEventListener("scroll", place, true);
					window.removeEventListener("resize", place);
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
			const overrideCount = Object.keys(state.overrides).length;
			const blocker = state.planId === void 0 || state.busy ? null : overrideBlocker();
			const overrideMessage = state.overrideError === "key" ? t("keyRequired") : state.overrideError === "value" ? t("valueInvalid") : null;
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
							if (!open) {
								load();
								beginOverrideDraft();
							}
							setOpen((value) => !value);
						},
						children: [label, (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: ModelPlanChip_module_css_default.chevron })]
					})
				}), open && !disabled && (0, react_jsx_runtime.jsxs)("div", {
					ref: menuRef,
					className: ModelPlanChip_module_css_default.menu,
					role: "menu",
					"aria-label": t("seatSelect"),
					style: menuPos ?? void 0,
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
								(0, react_jsx_runtime.jsxs)("div", {
									className: ModelPlanChip_module_css_default.overrideHead,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: ModelPlanChip_module_css_default.overrideTitle,
										children: t("seatOverrides")
									}), overrideCount > 0 ? (0, react_jsx_runtime.jsx)("span", {
										className: ModelPlanChip_module_css_default.overrideCount,
										children: overrideCount
									}) : null]
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: ModelPlanChip_module_css_default.overrideHint,
									children: t("seatOverrideHint")
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: ModelPlanChip_module_css_default.overrideTable,
									children: [(0, react_jsx_runtime.jsxs)("div", {
										className: ModelPlanChip_module_css_default.overrideCols,
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: ModelPlanChip_module_css_default.overrideColKey,
												children: t("paramKeyLabel")
											}),
											(0, react_jsx_runtime.jsx)("span", {
												className: ModelPlanChip_module_css_default.overrideColValue,
												children: t("paramValueLabel")
											}),
											(0, react_jsx_runtime.jsx)("span", { className: ModelPlanChip_module_css_default.overrideColRemove })
										]
									}), state.overrideDraft.map((row, index) => (0, react_jsx_runtime.jsxs)("div", {
										className: ModelPlanChip_module_css_default.overrideRow,
										children: [
											(0, react_jsx_runtime.jsx)("input", {
												className: ModelPlanChip_module_css_default.input,
												value: row.key,
												placeholder: t("paramKeyPlaceholder"),
												onChange: (e) => setOverrideKey(index, e.target.value)
											}),
											(0, react_jsx_runtime.jsx)("input", {
												className: ModelPlanChip_module_css_default.input,
												value: row.value,
												placeholder: t("paramValuePlaceholder"),
												onChange: (e) => setOverrideValue(index, e.target.value)
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: ModelPlanChip_module_css_default.removeRowButton,
												"aria-label": t("removeParam"),
												title: t("removeParam"),
												onClick: () => removeOverrideRow(index),
												children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
											})
										]
									}, `${index}-${row.key}`))]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: ModelPlanChip_module_css_default.addOverride,
									onClick: addOverrideRow,
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {}), t("addParam")]
								}),
								overrideMessage !== null ? (0, react_jsx_runtime.jsx)("span", {
									className: ModelPlanChip_module_css_default.overrideError,
									children: overrideMessage
								}) : null,
								(0, react_jsx_runtime.jsxs)("div", {
									className: ModelPlanChip_module_css_default.overrideActions,
									children: [(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelPlanChip_module_css_default.applyButton,
										disabled: state.planId === void 0 || state.busy || blocker !== null,
										onClick: () => {
											applyOverrides();
										},
										children: t("save")
									}), overrideCount > 0 ? (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelPlanChip_module_css_default.clearButton,
										disabled: state.busy,
										onClick: () => {
											clearOverrides();
										},
										children: t("seatClearOverrides")
									}) : null]
								})
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
			keyRequired: "Give every param a key.",
			valueInvalid: "The value must be a valid JSON scalar.",
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
			keyRequired: "请为每个参数填写键。",
			valueInvalid: "值必须是合法的 JSON 标量。",
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
						select: (planId, overrides) => chip.select(planId, overrides),
						beginOverrideDraft: () => chip.beginOverrideDraft(),
						setOverrideKey: (index, key) => chip.setOverrideKey(index, key),
						setOverrideValue: (index, value) => chip.setOverrideValue(index, value),
						addOverrideRow: () => chip.addOverrideRow(),
						removeOverrideRow: (index) => chip.removeOverrideRow(index),
						overrideBlocker: () => chip.overrideBlocker(),
						applyOverrides: () => chip.applyOverrides(),
						clearOverrides: () => chip.clearOverrides()
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