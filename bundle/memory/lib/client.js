window.__ModuleLoader__.load({
	id: "dsh-harness-memory-bundle",
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
		* Memory settings section controller ("记忆").
		*
		* Drives the settings-section block over the `/memory` wire channel: the three
		* scope tabs (team / team+role / project), each rendering the three memory
		* layers (L1 atomic facts / L2 scene profiles / L3 personas), asset view +
		* delete (with confirmation), role↔asset binding (装配规则), the pipeline
		* status summary, and the live memory settings.
		*
		* The host stays the single fact source. Every mutation writes through the
		* wire and the section re-reads the affected scope afterwards, because a
		* delete or a bind changes more than the row it targeted (binding counts
		* re-read from the host).
		*
		* @module dsh-harness-memory-bundle/ui/section-store
		*/
		/** The three scope tabs, in render order. */
		const SCOPE_TABS = [
			{
				key: "team",
				isolation: {}
			},
			{
				key: "teamRole",
				isolation: {}
			},
			{
				key: "project",
				isolation: {}
			}
		];
		const INITIAL = {
			status: "idle",
			error: null,
			active: "team",
			l1: [],
			l2: [],
			l3: [],
			statusSummary: null,
			config: null,
			detail: null,
			pendingDelete: null,
			deleting: false,
			bindRoleId: "",
			roleAssets: []
		};
		/** Map one wire asset entry onto a render row. */
		function assetRow(entry) {
			return {
				ref: entry.ref,
				layer: entry.layer,
				title: entry.title,
				preview: entry.preview
			};
		}
		/**
		* The memory settings section controller.
		*/
		var MemorySectionController = class {
			wire;
			/** Page snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			constructor(wire) {
				this.wire = wire;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			/** Load the active tab's assets + status and the settings (parallel). */
			async load() {
				if (this.store.getSnapshot().status === "loading") return;
				this.set({
					status: "loading",
					error: null
				});
				await Promise.all([this.loadActiveTab(), this.loadConfig()]);
				this.set({
					status: "ready",
					error: null
				});
			}
			/** Switch the active tab and reload its assets + status. */
			async setActive(scope) {
				if (this.store.getSnapshot().active === scope) return;
				this.set({
					active: scope,
					status: "loading",
					error: null,
					detail: null,
					pendingDelete: null
				});
				await Promise.all([this.loadActiveTab(), this.loadStatus()]);
				this.set({
					status: "ready",
					error: null
				});
			}
			/** Reload the active tab's assets (used after a mutation). */
			async loadActiveTab() {
				const { active } = this.store.getSnapshot();
				const tab = SCOPE_TABS.find((t) => t.key === active) ?? SCOPE_TABS[0];
				if (tab === void 0) return;
				const [assetsResult, statusResult] = await Promise.all([this.wire.assets({
					scope: active,
					isolation: tab.isolation
				}), this.wire.status({
					scope: active,
					isolation: tab.isolation
				})]);
				if (assetsResult.ok) this.set({
					l1: assetsResult.value.l1.map(assetRow),
					l2: assetsResult.value.l2.map(assetRow),
					l3: assetsResult.value.l3.map(assetRow)
				});
				else {
					this.set({ error: assetsResult.error.message });
					return;
				}
				if (statusResult.ok) this.set({ statusSummary: statusOf(statusResult.value) });
			}
			/** Reload just the status summary. */
			async loadStatus() {
				const { active } = this.store.getSnapshot();
				const tab = SCOPE_TABS.find((t) => t.key === active) ?? SCOPE_TABS[0];
				if (tab === void 0) return;
				const result = await this.wire.status({
					scope: active,
					isolation: tab.isolation
				});
				if (result.ok) this.set({ statusSummary: statusOf(result.value) });
			}
			/** Load the memory settings into the config surface. */
			async loadConfig() {
				const result = await this.wire.config({});
				if (!result.ok) return;
				this.set({ config: configOf(result.value) });
			}
			/** Open one asset's detail. */
			async viewAsset(ref) {
				const result = await this.wire.assetRead({ ref });
				if (!result.ok) {
					this.set({ error: result.error.message });
					return;
				}
				this.set({ detail: {
					ref,
					title: result.value.title,
					content: result.value.content
				} });
			}
			/** Close the detail. */
			closeDetail() {
				this.set({ detail: null });
			}
			/** Ask for confirmation before deleting one asset. */
			confirmDelete(ref) {
				if (this.store.getSnapshot().deleting) return;
				this.set({ pendingDelete: ref });
			}
			/** Delete the asset awaiting confirmation, then reload the tab. */
			async remove() {
				const { pendingDelete, deleting } = this.store.getSnapshot();
				if (pendingDelete === null || deleting) return;
				this.set({
					deleting: true,
					error: null
				});
				const result = await this.wire.assetDelete({ ref: pendingDelete });
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
				await this.loadActiveTab();
			}
			/** Set the role id for the binding editor. */
			setBindRoleId(roleId) {
				this.set({
					bindRoleId: roleId,
					error: null
				});
			}
			/** Load the assets bound to one role into the editor. */
			async loadRoleBindings(roleId) {
				const result = await this.wire.roleBindings({ roleId });
				if (!result.ok) {
					this.set({ error: result.error.message });
					return;
				}
				this.set({
					bindRoleId: roleId,
					roleAssets: result.value.assets
				});
			}
			/** Bind one asset to the current role, then refresh the bindings. */
			async bindAsset(ref) {
				const { bindRoleId } = this.store.getSnapshot();
				if (bindRoleId === "") return;
				const result = await this.wire.bindRole({
					roleId: bindRoleId,
					assetRef: ref
				});
				if (!result.ok) {
					this.set({ error: result.error.message });
					return;
				}
				this.set({ roleAssets: result.value.assets });
			}
			/** Unbind one asset from the current role, then refresh the bindings. */
			async unbindAsset(ref) {
				const { bindRoleId } = this.store.getSnapshot();
				if (bindRoleId === "") return;
				const result = await this.wire.unbindRole({
					roleId: bindRoleId,
					assetRef: ref
				});
				if (!result.ok) {
					this.set({ error: result.error.message });
					return;
				}
				this.set({ roleAssets: result.value.assets });
			}
		};
		/** Map one wire status onto the summary shape. */
		function statusOf(status) {
			return {
				l0Count: status.l0Count,
				l1Count: status.l1Count,
				l2Count: status.l2Count,
				l3Count: status.l3Count,
				lastExtractedAtMs: status.lastExtractedAtMs
			};
		}
		/** Map one wire settings value onto the config surface. */
		function configOf(settings) {
			return {
				enabled: settings.enabled,
				refinementPlan: settings.refinementPlan,
				compressionMode: settings.compression.mode,
				compressionPlan: settings.compression.planId,
				injectionLimit: settings.injectionLimit,
				compressionLine: settings.compressionLine,
				retainLine: settings.retainLine
			};
		}
		//#endregion
		//#region \0dsh-css:bundle/memory/src/ui/MemorySection.module.css.mjs
		const css = ".TRB71a_section{flex-direction:column;gap:16px;max-width:720px;display:flex}.TRB71a_title{margin:0;font-size:18px;font-weight:600}.TRB71a_intro{color:var(--dsw-alias-text-2,#8b94a6);margin:0;font-size:13px;line-height:1.6}.TRB71a_tabs{gap:8px;display:flex}.TRB71a_tab{border:1px solid var(--dsw-alias-stroke,#2a3242);color:var(--dsw-alias-text-2,#8b94a6);cursor:pointer;background:0 0;border-radius:6px;padding:6px 12px;font-size:13px}.TRB71a_tabActive{border-color:var(--dsw-alias-stroke-focus,#4f7cff);color:var(--dsw-alias-text-1,#e6e9f0);background:color-mix(in srgb, var(--dsw-alias-stroke-focus,#4f7cff) 12%, transparent)}.TRB71a_statusRow{flex-wrap:wrap;gap:12px;display:flex}.TRB71a_statusBlock,.TRB71a_bindBlock,.TRB71a_configBlock{border:1px solid var(--dsw-alias-stroke,#2a3242);border-radius:8px;padding:12px 14px}.TRB71a_blockTitle{margin:0 0 8px;font-size:13px;font-weight:600}.TRB71a_statusGrid{grid-template-columns:repeat(4,auto);gap:12px;margin:0;padding:0;list-style:none;display:grid}.TRB71a_statusGrid li{flex-direction:column;gap:2px;display:flex}.TRB71a_statusGrid span{color:var(--dsw-alias-text-2,#8b94a6);font-size:11px}.TRB71a_statusGrid strong{font-size:16px}.TRB71a_statusLast{color:var(--dsw-alias-text-2,#8b94a6);margin:8px 0 0;font-size:12px}.TRB71a_layers{flex-direction:column;gap:14px;display:flex}.TRB71a_layer{border:1px solid var(--dsw-alias-stroke,#2a3242);border-radius:8px;padding:10px 12px}.TRB71a_layerTitle{color:var(--dsw-alias-text-2,#8b94a6);text-transform:uppercase;letter-spacing:.04em;margin:0 0 6px;font-size:12px;font-weight:600}.TRB71a_assetList{flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;display:flex}.TRB71a_emptyLayer{color:var(--dsw-alias-text-3,#5b6472);margin:0;font-size:12px}.TRB71a_assetRow{align-items:center;gap:8px;display:flex}.TRB71a_assetTitle{color:inherit;cursor:pointer;background:0 0;border:none;flex-shrink:0;padding:0;font-size:13px;font-weight:500}.TRB71a_assetTitle:hover{text-decoration:underline}.TRB71a_assetPreview{color:var(--dsw-alias-text-2,#8b94a6);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:12px;overflow:hidden}.TRB71a_assetActions{flex-shrink:0;gap:4px;display:flex}.TRB71a_iconButton{color:var(--dsw-alias-text-2,#8b94a6);cursor:pointer;background:0 0;border:none;border-radius:4px;align-items:center;gap:2px;padding:2px 4px;font-size:12px;display:inline-flex}.TRB71a_iconButton:hover{background:color-mix(in srgb, var(--dsw-alias-stroke,#2a3242) 40%, transparent)}.TRB71a_iconDanger{color:var(--dsw-alias-state-error-primary,#e5484d)}.TRB71a_iconWarn{color:var(--dsw-alias-state-warning-primary,#e5a340)}.TRB71a_bindRow{align-items:center;gap:8px;display:flex}.TRB71a_bindLabel{color:var(--dsw-alias-text-2,#8b94a6);font-size:12px}.TRB71a_input{border:1px solid var(--dsw-alias-stroke,#2a3242);color:inherit;background:0 0;border-radius:6px;flex:1;padding:6px 8px;font-size:13px}.TRB71a_bindHint{color:var(--dsw-alias-text-2,#8b94a6);margin:0 0 8px;font-size:12px}.TRB71a_boundAssets{color:var(--dsw-alias-text-2,#8b94a6);word-break:break-all;margin:8px 0 0;font-size:12px}.TRB71a_configGrid{grid-template-columns:repeat(3,auto);gap:10px;margin:0;padding:0;list-style:none;display:grid}.TRB71a_configGrid li{flex-direction:column;gap:2px;display:flex}.TRB71a_configGrid span{color:var(--dsw-alias-text-2,#8b94a6);font-size:11px}.TRB71a_configGrid strong{font-size:13px}.TRB71a_detailContent{white-space:pre-wrap;word-break:break-word;max-height:320px;color:inherit;margin:0;font-size:13px;line-height:1.6;overflow:auto}.TRB71a_detailDialog{width:100%;max-width:560px}.TRB71a_deleteDialog{width:100%;max-width:420px}.TRB71a_deleteConfirm{background:var(--dsw-alias-state-error-primary,#e5484d)}";
		const tagId = "dsh-harness-memory-bundle/MemorySection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-memory-bundle";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var MemorySection_module_css_default = {
			"statusGrid": "TRB71a_statusGrid",
			"section": "TRB71a_section",
			"iconDanger": "TRB71a_iconDanger",
			"layer": "TRB71a_layer",
			"assetTitle": "TRB71a_assetTitle",
			"tab": "TRB71a_tab",
			"bindHint": "TRB71a_bindHint",
			"configGrid": "TRB71a_configGrid",
			"assetActions": "TRB71a_assetActions",
			"assetList": "TRB71a_assetList",
			"tabActive": "TRB71a_tabActive",
			"bindRow": "TRB71a_bindRow",
			"detailDialog": "TRB71a_detailDialog",
			"boundAssets": "TRB71a_boundAssets",
			"detailContent": "TRB71a_detailContent",
			"bindLabel": "TRB71a_bindLabel",
			"layers": "TRB71a_layers",
			"emptyLayer": "TRB71a_emptyLayer",
			"iconButton": "TRB71a_iconButton",
			"input": "TRB71a_input",
			"deleteDialog": "TRB71a_deleteDialog",
			"blockTitle": "TRB71a_blockTitle",
			"configBlock": "TRB71a_configBlock",
			"layerTitle": "TRB71a_layerTitle",
			"statusBlock": "TRB71a_statusBlock",
			"statusLast": "TRB71a_statusLast",
			"tabs": "TRB71a_tabs",
			"deleteConfirm": "TRB71a_deleteConfirm",
			"intro": "TRB71a_intro",
			"title": "TRB71a_title",
			"statusRow": "TRB71a_statusRow",
			"iconWarn": "TRB71a_iconWarn",
			"assetRow": "TRB71a_assetRow",
			"assetPreview": "TRB71a_assetPreview",
			"bindBlock": "TRB71a_bindBlock"
		};
		//#endregion
		//#region lib/types/ui/MemorySection.js
		/**
		* Memory settings section ("记忆"): the independent settings block over the
		* `/memory` wire channel.
		*
		* Renders the three scope tabs (team / team+role / project), each showing the
		* three memory layers (L1 / L2 / L3), with view-detail, delete-with-
		* confirmation, role↔asset binding (装配规则), the pipeline status summary, and
		* the live memory configuration.
		*
		* @module dsh-harness-memory-bundle/ui/MemorySection
		*/
		/** One asset row in a layer list. */
		function AssetRowView(props) {
			const { row, t, onView, onDelete, onBind, onUnbind, bound } = props;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: MemorySection_module_css_default.assetRow,
				children: [
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MemorySection_module_css_default.assetTitle,
						onClick: () => onView(row.ref),
						children: row.title
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: MemorySection_module_css_default.assetPreview,
						children: row.preview
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: MemorySection_module_css_default.assetActions,
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MemorySection_module_css_default.iconButton,
								onClick: () => onView(row.ref),
								"aria-label": t("view"),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, {})
							}),
							bound ? (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${MemorySection_module_css_default.iconButton} ${MemorySection_module_css_default.iconWarn}`,
								onClick: () => onUnbind(row.ref),
								"aria-label": t("unbind"),
								children: t("unbind")
							}) : (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: MemorySection_module_css_default.iconButton,
								onClick: () => onBind(row.ref),
								"aria-label": t("bind"),
								children: t("bind")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${MemorySection_module_css_default.iconButton} ${MemorySection_module_css_default.iconDanger}`,
								onClick: () => onDelete(row.ref),
								"aria-label": t("delete"),
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
							})
						]
					})
				]
			});
		}
		/** One layer's asset list with an empty state. */
		function LayerList(props) {
			const { title, rows, t, onView, onDelete, onBind, onUnbind, bound } = props;
			if (rows.length === 0) return (0, react_jsx_runtime.jsxs)("section", {
				className: MemorySection_module_css_default.layer,
				children: [(0, react_jsx_runtime.jsx)("h4", {
					className: MemorySection_module_css_default.layerTitle,
					children: title
				}), (0, react_jsx_runtime.jsx)("p", {
					className: MemorySection_module_css_default.emptyLayer,
					children: t("emptyLayer")
				})]
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				className: MemorySection_module_css_default.layer,
				children: [(0, react_jsx_runtime.jsx)("h4", {
					className: MemorySection_module_css_default.layerTitle,
					children: title
				}), (0, react_jsx_runtime.jsx)("ul", {
					className: MemorySection_module_css_default.assetList,
					children: rows.map((row) => (0, react_jsx_runtime.jsx)(AssetRowView, {
						row,
						t,
						onView,
						onDelete,
						onBind,
						onUnbind,
						bound: bound(row.ref)
					}, row.ref))
				})]
			});
		}
		/** The status summary block. */
		function StatusBlock(props) {
			const { t, l0Count, l1Count, l2Count, l3Count, lastExtractedAtMs } = props;
			const last = lastExtractedAtMs > 0 ? new Date(lastExtractedAtMs).toLocaleString() : t("statusNever");
			return (0, react_jsx_runtime.jsxs)("section", {
				className: MemorySection_module_css_default.statusBlock,
				children: [
					(0, react_jsx_runtime.jsx)("h4", {
						className: MemorySection_module_css_default.blockTitle,
						children: t("statusTitle")
					}),
					(0, react_jsx_runtime.jsxs)("ul", {
						className: MemorySection_module_css_default.statusGrid,
						children: [
							(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("statusL0") }), (0, react_jsx_runtime.jsx)("strong", { children: l0Count })] }),
							(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("statusL1") }), (0, react_jsx_runtime.jsx)("strong", { children: l1Count })] }),
							(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("statusL2") }), (0, react_jsx_runtime.jsx)("strong", { children: l2Count })] }),
							(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("statusL3") }), (0, react_jsx_runtime.jsx)("strong", { children: l3Count })] })
						]
					}),
					(0, react_jsx_runtime.jsxs)("p", {
						className: MemorySection_module_css_default.statusLast,
						children: [
							t("statusLastExtracted"),
							": ",
							last
						]
					})
				]
			});
		}
		/**
		* Render the memory settings section content column.
		* @param props - composed slot props.
		* @returns the section, or null when loading/error states resolve elsewhere.
		*/
		function MemorySection(props) {
			const { useMemorySection, t, load, setActive, viewAsset, closeDetail, confirmDelete, remove, setBindRoleId, loadRoleBindings, bindAsset, unbindAsset } = props;
			const state = useMemorySection((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				if (state.status === "idle") load();
			}, [state.status, load]);
			if (state.status === "loading") return (0, react_jsx_runtime.jsx)("div", { children: t("loading") });
			if (state.status === "error") return (0, react_jsx_runtime.jsx)("div", {
				style: { color: "var(--dsw-alias-state-error-primary)" },
				children: t("error")
			});
			if (state.status !== "ready") return null;
			const bound = (ref) => state.roleAssets.includes(ref);
			const tab = state.active;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: MemorySection_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: MemorySection_module_css_default.title,
						children: t("nav")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: MemorySection_module_css_default.intro,
						children: t("sectionIntro")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: MemorySection_module_css_default.tabs,
						children: [
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${MemorySection_module_css_default.tab} ${tab === "team" ? MemorySection_module_css_default.tabActive : ""}`,
								onClick: () => void setActive("team"),
								children: t("scopeTeam")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${MemorySection_module_css_default.tab} ${tab === "teamRole" ? MemorySection_module_css_default.tabActive : ""}`,
								onClick: () => void setActive("teamRole"),
								children: t("scopeTeamRole")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${MemorySection_module_css_default.tab} ${tab === "project" ? MemorySection_module_css_default.tabActive : ""}`,
								onClick: () => void setActive("project"),
								children: t("scopeProject")
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: MemorySection_module_css_default.statusRow,
						children: state.statusSummary !== null ? (0, react_jsx_runtime.jsx)(StatusBlock, {
							t,
							l0Count: state.statusSummary.l0Count,
							l1Count: state.statusSummary.l1Count,
							l2Count: state.statusSummary.l2Count,
							l3Count: state.statusSummary.l3Count,
							lastExtractedAtMs: state.statusSummary.lastExtractedAtMs
						}) : null
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: MemorySection_module_css_default.layers,
						children: [
							(0, react_jsx_runtime.jsx)(LayerList, {
								title: t("layerL1"),
								rows: state.l1,
								t,
								onView: viewAsset,
								onDelete: confirmDelete,
								onBind: bindAsset,
								onUnbind: unbindAsset,
								bound
							}),
							(0, react_jsx_runtime.jsx)(LayerList, {
								title: t("layerL2"),
								rows: state.l2,
								t,
								onView: viewAsset,
								onDelete: confirmDelete,
								onBind: bindAsset,
								onUnbind: unbindAsset,
								bound
							}),
							(0, react_jsx_runtime.jsx)(LayerList, {
								title: t("layerL3"),
								rows: state.l3,
								t,
								onView: viewAsset,
								onDelete: confirmDelete,
								onBind: bindAsset,
								onUnbind: unbindAsset,
								bound
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: MemorySection_module_css_default.bindBlock,
						children: [
							(0, react_jsx_runtime.jsx)("h4", {
								className: MemorySection_module_css_default.blockTitle,
								children: t("bindTitle")
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: MemorySection_module_css_default.bindHint,
								children: t("bindHint")
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: MemorySection_module_css_default.bindRow,
								children: [
									(0, react_jsx_runtime.jsx)("label", {
										className: MemorySection_module_css_default.bindLabel,
										htmlFor: "memory-bind-role",
										children: t("bindRoleLabel")
									}),
									(0, react_jsx_runtime.jsx)("input", {
										id: "memory-bind-role",
										className: MemorySection_module_css_default.input,
										value: state.bindRoleId,
										placeholder: t("bindRolePlaceholder"),
										onChange: (e) => setBindRoleId(e.target.value)
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										onClick: () => void loadRoleBindings(state.bindRoleId),
										children: t("loadBindings")
									})
								]
							}),
							state.bindRoleId !== "" ? (0, react_jsx_runtime.jsx)("p", {
								className: MemorySection_module_css_default.boundAssets,
								children: state.roleAssets.length === 0 ? t("noBindings") : `${t("boundAssets")}: ${state.roleAssets.join(", ")}`
							}) : null
						]
					}),
					state.config !== null ? (0, react_jsx_runtime.jsxs)("section", {
						className: MemorySection_module_css_default.configBlock,
						children: [(0, react_jsx_runtime.jsx)("h4", {
							className: MemorySection_module_css_default.blockTitle,
							children: t("configTitle")
						}), (0, react_jsx_runtime.jsxs)("ul", {
							className: MemorySection_module_css_default.configGrid,
							children: [
								(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("configEnabled") }), (0, react_jsx_runtime.jsx)("strong", { children: state.config.enabled ? "on" : "off" })] }),
								(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("configRefinementPlan") }), (0, react_jsx_runtime.jsx)("strong", { children: state.config.refinementPlan || "—" })] }),
								(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("configCompression") }), (0, react_jsx_runtime.jsx)("strong", { children: state.config.compressionMode === "follow" ? t("configCompressionFollow") : state.config.compressionPlan })] }),
								(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("configInjectionLimit") }), (0, react_jsx_runtime.jsxs)("strong", { children: [Math.round(state.config.injectionLimit * 100), t("percent")] })] }),
								(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("configCompressionLine") }), (0, react_jsx_runtime.jsxs)("strong", { children: [Math.round(state.config.compressionLine * 100), t("percent")] })] }),
								(0, react_jsx_runtime.jsxs)("li", { children: [(0, react_jsx_runtime.jsx)("span", { children: t("configRetainLine") }), (0, react_jsx_runtime.jsxs)("strong", { children: [Math.round(state.config.retainLine * 100), t("percent")] })] })
							]
						})]
					}) : null,
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.detail !== null,
						onClose: closeDetail,
						title: state.detail?.title ?? "",
						closeLabel: t("close"),
						className: MemorySection_module_css_default.detailDialog,
						footer: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							onClick: closeDetail,
							children: t("close")
						}),
						children: (0, react_jsx_runtime.jsx)("pre", {
							className: MemorySection_module_css_default.detailContent,
							children: state.detail?.content ?? ""
						})
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.pendingDelete !== null,
						onClose: () => confirmDelete(null),
						title: t("deleteTitle"),
						closeLabel: t("close"),
						description: t("deleteDescription"),
						className: MemorySection_module_css_default.deleteDialog,
						footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: state.deleting,
							onClick: () => confirmDelete(null),
							children: t("close")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: MemorySection_module_css_default.deleteConfirm,
							disabled: state.deleting,
							onClick: () => void remove(),
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
		* Browser transport for the memory-management wire channel.
		*
		* The "记忆" settings section rides the connection's dedicated `/memory`
		* channel, so this module adapts {@link ClientConnectionRpc.call} into the
		* management surface the section controller consumes. Each method mints the
		* payload the Host handler validates against its zod schema and returns the
		* Host's `RpcResult` — the same success/failure shape the model-plan and
		* task-management wires return.
		* @module dsh-harness-memory-bundle/ui/wire-client
		*/
		/** Absolute logical channel the Host serves memory management on. */
		const MEMORY_CHANNEL = "/memory";
		/** Build the management wire face over one connection RPC caller. */
		function createMemoryWire(rpc) {
			return {
				assets: (payload, signal) => call("assets", payload, signal),
				assetRead: (payload, signal) => call("assetRead", payload, signal),
				assetDelete: (payload, signal) => call("assetDelete", payload, signal),
				bindRole: (payload, signal) => call("bindRole", payload, signal),
				unbindRole: (payload, signal) => call("unbindRole", payload, signal),
				roleBindings: (payload, signal) => call("roleBindings", payload, signal),
				status: (payload, signal) => call("status", payload, signal),
				config: (payload, signal) => call("config", payload, signal)
			};
			/** Call one endpoint, returning the caller's declared result type. */
			function call(endpoint, payload, signal) {
				return rpc.call(MEMORY_CHANNEL, endpoint, payload, signal);
			}
		}
		//#endregion
		//#region lib/types/ui/locales.js
		/** Locale bundles for the memory ("记忆") settings section. */
		/** English copy. */
		const en = {
			nav: "Memory",
			sectionIntro: "Memory keeps your fixed assets in three isolated scopes — team, team+role, and project — each across three layers: atomic facts (L1), scene profiles (L2), and personas (L3). Inspect, delete, and assemble role bindings from here.",
			loading: "Loading memory…",
			error: "Could not load memory.",
			scopeTeam: "Team",
			scopeTeamRole: "Team + role",
			scopeProject: "Project",
			layerL1: "Atomic facts (L1)",
			layerL2: "Scenes (L2)",
			layerL3: "Personas (L3)",
			emptyLayer: "No memories here yet.",
			statusTitle: "Pipeline status",
			statusL0: "Original turns",
			statusL1: "Atomic facts",
			statusL2: "Scenes",
			statusL3: "Personas",
			statusLastExtracted: "Last extraction",
			statusNever: "never",
			view: "View",
			viewTitle: "Memory detail",
			close: "Close",
			delete: "Delete",
			deleteTitle: "Delete this memory?",
			deleteDescription: "This memory is removed and any role binding that referenced it is cleared.",
			deleteConfirm: "Delete",
			deleting: "Deleting…",
			bindTitle: "Role assembly",
			bindHint: "Bind the active memories to a role so its sessions pull them in.",
			bindRoleLabel: "Role id",
			bindRolePlaceholder: "e.g. architect",
			loadBindings: "Load",
			bind: "Bind",
			unbind: "Unbind",
			boundAssets: "Bound assets",
			noBindings: "No assets bound to this role.",
			configTitle: "Configuration",
			configEnabled: "Enabled",
			configRefinementPlan: "Extraction plan",
			configCompression: "Compression route",
			configCompressionFollow: "Follow current route",
			configCompressionPlan: "Pinned plan",
			configCompressionPlanId: "Compression plan id",
			configInjectionLimit: "Injection limit",
			configCompressionLine: "Compression line",
			configRetainLine: "Retention line",
			percent: "%"
		};
		/** Simplified Chinese copy. */
		const zh = {
			nav: "记忆",
			sectionIntro: "记忆把固定资产放在三个正交作用域——团队、团队+角色、项目——每个作用域下分三层：原子事实（L1）、场景（L2）、画像（L3）。在这里查看、删除，并为角色装配记忆。",
			loading: "正在加载记忆…",
			error: "无法加载记忆。",
			scopeTeam: "团队",
			scopeTeamRole: "团队+角色",
			scopeProject: "项目",
			layerL1: "原子事实（L1）",
			layerL2: "场景（L2）",
			layerL3: "画像（L3）",
			emptyLayer: "这里还没有记忆。",
			statusTitle: "提炼状态",
			statusL0: "原文轮次",
			statusL1: "原子事实",
			statusL2: "场景",
			statusL3: "画像",
			statusLastExtracted: "最近提炼",
			statusNever: "从未",
			view: "查看",
			viewTitle: "记忆详情",
			close: "关闭",
			delete: "删除",
			deleteTitle: "删除这条记忆？",
			deleteDescription: "该记忆将被删除，引用它的角色绑定也会一并清除。",
			deleteConfirm: "删除",
			deleting: "正在删除…",
			bindTitle: "角色装配",
			bindHint: "把当前记忆绑定到某个角色，让该角色的会话拉取它们。",
			bindRoleLabel: "角色 id",
			bindRolePlaceholder: "例如 architect",
			loadBindings: "加载",
			bind: "绑定",
			unbind: "解绑",
			boundAssets: "已绑定资产",
			noBindings: "该角色还没有绑定任何资产。",
			configTitle: "配置",
			configEnabled: "启用",
			configRefinementPlan: "提炼模型方案",
			configCompression: "压缩模型路由",
			configCompressionFollow: "跟随当前路由",
			configCompressionPlan: "指定方案",
			configCompressionPlanId: "压缩方案 id",
			configInjectionLimit: "统一注入上限",
			configCompressionLine: "原文压缩线",
			configRetainLine: "原文保留线",
			percent: "%"
		};
		//#endregion
		//#region lib/types/ui/index.js
		/**
		* Memory surface plugin, browser half — the "记忆" settings section over the
		* `/memory` wire channel.
		*
		* The section lists the three scope tabs (team / team+role / project), each
		* showing the three memory layers (L1 / L2 / L3), and drives view-detail,
		* delete (with confirmation), role↔asset binding (装配规则), the pipeline
		* status summary, and the live memory configuration.
		*
		* The section's apply is called from the package's single browser client entry
		* so the whole surface ships in one client bundle; the `settings.memory` locale
		* namespace keeps the copy apart from the model-plan section's.
		*
		* @module dsh-harness-memory-bundle/ui
		*/
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* Mount the memory settings section.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const { rpc } = ctx.get("connection");
			const section = new MemorySectionController(createMemoryWire(rpc));
			ctx.effect(() => ctx.locale.register("settings.memory", {
				zh,
				en
			}), "ui-memory: settings section dictionary");
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
			}, "ui-memory: section refresh");
			const sectionInjected = () => ({
				hooks: { memorySection: section.store },
				load: () => section.load(),
				setActive: (scope) => section.setActive(scope),
				viewAsset: (ref) => section.viewAsset(ref),
				closeDetail: () => {
					section.closeDetail();
				},
				confirmDelete: (ref) => {
					section.confirmDelete(ref);
				},
				remove: () => section.remove(),
				setBindRoleId: (roleId) => {
					section.setBindRoleId(roleId);
				},
				loadRoleBindings: (roleId) => section.loadRoleBindings(roleId),
				bindAsset: (ref) => section.bindAsset(ref),
				unbindAsset: (ref) => section.unbindAsset(ref)
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "memory",
				order: 24,
				label: () => ctx.locale.bind("settings.memory")("nav"),
				locale: "settings.memory",
				inject: sectionInjected
			}, MemorySection));
		}
		//#endregion
		exports.MemorySectionController = MemorySectionController;
		exports.SCOPE_TABS = SCOPE_TABS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map