window.__ModuleLoader__.load({
	id: "dsh-harness-agent-preset-editing-bundle",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region lib/types/ui/locales.js
		/** Locale bundles for the agent-preset settings row, hero chip, header label, and management section. */
		/** English copy. */
		const en = {
			title: "Agent preset",
			description: "Applies to sessions you start from now on. Running sessions keep the preset they began with.",
			loading: "Loading presets…",
			error: "Could not load agent presets.",
			userTrust: "Custom",
			seatHint: "Agent preset for the session you are about to start",
			headerHint: "The agent preset this session runs, fixed when it started",
			nav: "Agent presets",
			sectionIntro: "A preset is the plugin composition one session's agent runs — its tools, prompt, and capabilities. Duplicate an existing one and make it yours, or let the agent draft one for you in Creator mode.",
			builtIn: "Built-in",
			setDefault: "Set as default",
			view: "View",
			presetStandardName: "Standard mode",
			presetStandardDescription: "Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.",
			presetCodeName: "Code mode",
			presetCodeDescription: "All Standard mode capabilities, with tools exposed through the Code Mode SDK so the model can combine multi-step operations in one TypeScript program.",
			presetMinimalName: "Minimal mode",
			presetMinimalDescription: "Two-tool coding agent with persistent bash and str_replace_editor.",
			presetCordisName: "Creator mode",
			presetCordisDescription: "Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.",
			duplicate: "Duplicate",
			duplicateUnavailable: "This deployment has no writable preset directory",
			delete: "Delete",
			presetId: "Identifier",
			presetIdPlaceholder: "my-agent",
			displayName: "Name",
			displayNamePlaceholder: "Shown in the picker; defaults to the identifier",
			inUse: "In use",
			builtInGroup: "Built-in",
			customGroup: "Custom",
			noDescription: "No description.",
			brokenBadge: "Failed to load",
			brokenNoCopy: "A preset that failed to load cannot be duplicated",
			copyOf: "Copied from",
			composition: "Composition (agent.cordis.yml)",
			cancel: "Cancel",
			close: "Close",
			retry: "Retry",
			copyTitle: "Duplicate preset",
			copyIntro: "The whole preset is copied on this machine. The identifier becomes its directory name and cannot be changed later; everything else is edited in the preset's own files.",
			create: "Create",
			creating: "Creating…",
			creatorDraft: "Draft a custom preset with Creator mode",
			openLocation: "Open folder",
			showLocation: "Show location",
			revealedPathLabel: "Preset files:",
			idRequired: "Give the preset an identifier.",
			idInvalid: "Use lowercase letters, digits, and hyphens, starting with a letter or digit.",
			idTaken: "A preset with this identifier already exists.",
			deleteTitle: "Delete this preset?",
			deleteDescription: "The preset directory is deleted. Sessions already running on it keep working; new sessions cannot select it.",
			deleteConfirm: "Delete",
			deleting: "Deleting…",
			edit: "Edit",
			editTitle: "Edit preset",
			editIntro: "Changes apply to sessions started from now on; a session already running keeps the composition it began with.",
			save: "Save",
			saving: "Saving…",
			personaText: "Agent persona",
			personaTextPlaceholder: "The system prompt this agent starts with",
			"delegation.provider": "Delegation provider",
			"delegation.providerPlaceholder": "spawn, fork, codex, …",
			"delegation.toolName": "Delegation tool name",
			"delegation.toolNamePlaceholder": "The tool name the model calls",
			"delegation.backgroundMode": "Background mode",
			"delegation.backgroundModePlaceholder": "one-shot or continuable",
			"delegation.enableRunInBackground": "Enable run in background",
			"delegation.enableRunInBackgroundPlaceholder": "true or false",
			"delegation.maxDepth": "Max depth",
			"delegation.maxDepthPlaceholder": "A number, or provider-managed",
			"delegation.enabled": "Enabled",
			delegationTitle: "Delegation",
			"delegation.noBackgroundSupport": "This carrier does not support background runs",
			toolsTitle: "Tools",
			toolExprDisabled: "Disabled by a deployment condition; not toggleable here",
			toolInstalled: "Installed",
			toolUninstalled: "Not installed",
			descriptionLabel: "Description",
			descriptionPlaceholder: "One sentence on what this preset is for",
			delegationInvalid: "A delegation field has a value this key does not accept."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "Agent 预设",
			description: "对此后新建的会话生效。运行中的会话保持它开始时的预设。",
			loading: "正在加载预设…",
			error: "无法加载 Agent 预设。",
			userTrust: "自定义",
			seatHint: "即将开始的这个会话所用的 Agent 预设",
			headerHint: "本会话运行的 Agent 预设，开始时即固定",
			nav: "Agent 预设",
			sectionIntro: "预设即一个会话的 Agent 所运行的插件组装 —— 它的工具、提示词与能力。复制一份既有预设改成自己的，或用「创造模式」让 Agent 帮你创建。",
			builtIn: "内置",
			setDefault: "设为默认",
			view: "查看",
			presetStandardName: "标准模式",
			presetStandardDescription: "功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。",
			presetCodeName: "PTC 模式",
			presetCodeDescription: "具备标准模式的全部能力，并通过 Code Mode SDK 呈现工具，让模型用一个 TypeScript 程序组合多步操作。",
			presetMinimalName: "极简模式",
			presetMinimalDescription: "仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。",
			presetCordisName: "创造模式",
			presetCordisDescription: "用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。",
			duplicate: "复制",
			duplicateUnavailable: "此部署未配置可写的预设目录",
			delete: "删除",
			presetId: "标识符",
			presetIdPlaceholder: "my-agent",
			displayName: "名称",
			displayNamePlaceholder: "选择器中显示的名字，缺省用标识符",
			inUse: "当前使用",
			builtInGroup: "内置",
			customGroup: "自定义",
			noDescription: "暂无描述。",
			brokenBadge: "加载失败",
			brokenNoCopy: "预设加载失败，不能复制",
			copyOf: "复制自",
			composition: "组装（agent.cordis.yml）",
			cancel: "取消",
			close: "关闭",
			retry: "重试",
			copyTitle: "复制预设",
			copyIntro: "整个预设会在本机复制一份。标识符将成为目录名，事后无法更改；其余内容之后直接在预设自己的文件里编辑。",
			create: "创建",
			creating: "正在创建…",
			creatorDraft: "用「创造模式」创作自定义预设",
			openLocation: "打开目录",
			showLocation: "查看路径",
			revealedPathLabel: "预设文件：",
			idRequired: "请填写标识符。",
			idInvalid: "只能使用小写字母、数字与连字符，且以字母或数字开头。",
			idTaken: "该标识符已被占用。",
			deleteTitle: "删除该预设？",
			deleteDescription: "预设目录将被删除。已在其上运行的会话不受影响；新会话将无法再选择它。",
			deleteConfirm: "删除",
			deleting: "正在删除…",
			edit: "编辑",
			editTitle: "编辑预设",
			editIntro: "改动对此后新建的会话生效；运行中的会话保持它开始时的组装。",
			save: "保存",
			saving: "正在保存…",
			personaText: "Agent 人设",
			personaTextPlaceholder: "此 Agent 起始的系统提示词",
			"delegation.provider": "委派后端",
			"delegation.providerPlaceholder": "spawn、fork、codex 等",
			"delegation.toolName": "委派工具名",
			"delegation.toolNamePlaceholder": "模型调用的工具名",
			"delegation.backgroundMode": "后台模式",
			"delegation.backgroundModePlaceholder": "one-shot 或 continuable",
			"delegation.enableRunInBackground": "允许后台运行",
			"delegation.enableRunInBackgroundPlaceholder": "true 或 false",
			"delegation.maxDepth": "最大深度",
			"delegation.maxDepthPlaceholder": "数字或 provider-managed",
			"delegation.enabled": "已启用",
			delegationTitle: "委派方式",
			"delegation.noBackgroundSupport": "该载体不支持后台运行",
			toolsTitle: "工具",
			toolExprDisabled: "由部署条件决定禁用，此处不可切换",
			toolInstalled: "已安装",
			toolUninstalled: "未安装",
			descriptionLabel: "描述",
			descriptionPlaceholder: "一句话说明该预设的用途",
			delegationInvalid: "某个委派字段的值不被该键接受。"
		};
		const BUILT_IN_PRESET_KEYS = {
			standard: {
				name: "presetStandardName",
				description: "presetStandardDescription"
			},
			code: {
				name: "presetCodeName",
				description: "presetCodeDescription"
			},
			minimal: {
				name: "presetMinimalName",
				description: "presetMinimalDescription"
			},
			cordis: {
				name: "presetCordisName",
				description: "presetCordisDescription"
			}
		};
		/**
		* Resolve preset display copy without making user-authored metadata translatable.
		* @param preset - roster row whose copy is being rendered.
		* @param t - active Web locale lookup.
		* @returns localized copy for a known shipped preset, otherwise file metadata.
		*/
		function presetDisplayText(preset, t) {
			const keys = preset.trust === "system" ? BUILT_IN_PRESET_KEYS[preset.id] : void 0;
			if (keys !== void 0) return {
				name: t(keys.name),
				description: t(keys.description)
			};
			return {
				name: preset.name ?? preset.id,
				...preset.description === void 0 ? {} : { description: preset.description }
			};
		}
		//#endregion
		//#region \0dsh-css:bundle/agent-preset-editing/src/ui/AgentPresetLabel.module.css.mjs
		const css$3 = "._3yH_hG_label{background:var(--dsw-alias-fill-tsp-secondary);max-width:180px;height:22px;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;border-radius:6px;align-items:center;gap:4px;padding:0 2px 0 0;font-size:12px;line-height:22px;display:inline-flex;overflow:hidden}._3yH_hG_icon{opacity:.7;flex:none}";
		const tagId$3 = "dsh-harness-agent-preset-editing-bundle/AgentPresetLabel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-agent-preset-editing-bundle";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var AgentPresetLabel_module_css_default = {
			"label": "_3yH_hG_label",
			"icon": "_3yH_hG_icon"
		};
		//#endregion
		//#region lib/types/ui/AgentPresetLabel.js
		/**
		* The session header's agent-preset label.
		*
		* Read-only by construction: a session's composition is fixed once its
		* conversation starts, and a header is only worth reading after that. Offering
		* a control here would promise a switch the host refuses; naming what the
		* session runs is the honest affordance, and the choice itself lives on the
		* new-session screen ({@link AgentPresetSeat}).
		*/
		/**
		* Render this session's agent-preset name beside its title.
		* @param props - composed slot props.
		* @returns the label, or null when the session records no preset.
		*/
		function AgentPresetLabel({ sessionId, useSessions, useAgentPresets, load, t }) {
			const preset = useSessions((state) => state.byId[sessionId]?.agentPreset);
			const options = useAgentPresets((state) => state.options);
			(0, react.useEffect)(() => {
				if (preset !== void 0) load();
			}, [preset, load]);
			if (preset === void 0) return null;
			const option = options.find((entry) => entry.id === preset);
			const text = option === void 0 ? void 0 : presetDisplayText(option, t);
			return (0, react_jsx_runtime.jsxs)("span", {
				className: AgentPresetLabel_module_css_default.label,
				title: text?.description ?? t("headerHint"),
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutline16, {
					size: 14,
					className: AgentPresetLabel_module_css_default.icon
				}), text?.name ?? preset]
			});
		}
		//#endregion
		//#region lib/types/ui/PresetMenu.js
		/**
		* The preset picker both surfaces render: a menu of presets over a button
		* naming the current one.
		*
		* The settings row and the composer seat differ in where they sit, what they
		* call the current value, and when they refuse a pick — not in how the picker
		* itself behaves. Trust is the one thing the list always says: a locally
		* authored preset is exactly as privileged as the plugins it names, so the
		* label marks it rather than presenting every preset as shipped and vetted.
		*/
		/**
		* Render the preset picker.
		* @param props - the calling surface's copy, styling, and handlers.
		* @returns the menu and its trigger.
		*/
		function PresetMenu({ options, selectedId, label, t, buttonClassName, chevronClassName, disabled, open, onOpenChange, onSelect }) {
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				onClose: () => {
					onOpenChange(false);
				},
				items: options.map((option) => {
					const name = presetDisplayText(option, t).name;
					return {
						id: option.id,
						label: option.trust === "user" ? `${name} · ${t("userTrust")}` : name
					};
				}),
				selectedId,
				onSelect: (id) => {
					onOpenChange(false);
					onSelect(id);
				},
				align: "end",
				portal: true,
				anchor: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: buttonClassName,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					disabled,
					onClick: () => {
						onOpenChange(!open);
					},
					children: [label, (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: chevronClassName })]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:bundle/agent-preset-editing/src/ui/AgentPresetRow.module.css.mjs
		const css$2 = ".uLsHXq_row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.uLsHXq_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.uLsHXq_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.uLsHXq_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.uLsHXq_selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.uLsHXq_selector:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.uLsHXq_selector:disabled{cursor:default}.uLsHXq_chevron{flex:none}";
		const tagId$2 = "dsh-harness-agent-preset-editing-bundle/AgentPresetRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-agent-preset-editing-bundle";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var AgentPresetRow_module_css_default = {
			"desc": "uLsHXq_desc",
			"rowText": "uLsHXq_rowText",
			"row": "uLsHXq_row",
			"selector": "uLsHXq_selector",
			"title": "uLsHXq_title",
			"chevron": "uLsHXq_chevron"
		};
		//#endregion
		//#region lib/types/ui/AgentPresetRow.js
		/**
		* Agent-preset preference row: the preset new sessions are composed from.
		* A running session keeps the composition it began with, so this row never
		* disturbs work in progress.
		*/
		/**
		* Render the new-session agent-preset selector.
		* @param props - composed slot props.
		* @returns the row, or null when the deployment composes no presets.
		*/
		function AgentPresetRow({ load, select, useAgentPreset, t }) {
			const state = useAgentPreset((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				if (state.writable && state.status !== "unavailable") return;
				setOpen(false);
			}, [state.status, state.writable]);
			if (state.status === "unavailable") return null;
			const busy = state.status === "loading" || state.status === "saving";
			const chosen = state.options.find((option) => option.id === state.currentValue);
			const chosenText = chosen === void 0 ? void 0 : presetDisplayText(chosen, t);
			const label = state.currentValue === "" ? t("loading") : chosenText?.name ?? state.currentValue;
			const description = state.error ?? t("description");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentPresetRow_module_css_default.row,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: AgentPresetRow_module_css_default.rowText,
					children: [(0, react_jsx_runtime.jsx)("div", {
						className: AgentPresetRow_module_css_default.title,
						children: t("title")
					}), (0, react_jsx_runtime.jsx)("div", {
						className: AgentPresetRow_module_css_default.desc,
						role: state.error === null ? void 0 : "alert",
						children: description
					})]
				}), (0, react_jsx_runtime.jsx)(PresetMenu, {
					options: state.options,
					selectedId: state.currentValue,
					label,
					t,
					buttonClassName: AgentPresetRow_module_css_default.selector,
					chevronClassName: AgentPresetRow_module_css_default.chevron,
					disabled: busy || !state.writable || state.options.length === 0,
					open,
					onOpenChange: setOpen,
					onSelect: (id) => {
						select(id);
					}
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:bundle/agent-preset-editing/src/ui/AgentPresetSeat.module.css.mjs
		const css$1 = ".PM2Urq_seat{max-width:min(100%,240px);min-height:28px;color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;cursor:pointer;background:0 0;border:none;border-radius:16px;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex;overflow:hidden}.PM2Urq_seat:not(:disabled):hover,.PM2Urq_seat[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.PM2Urq_seat:disabled{cursor:default;color:var(--dsw-alias-label-quaternary)}.PM2Urq_seatIcon{color:var(--dsw-alias-label-primary);flex:none}.PM2Urq_introIcon{animation:.15s cubic-bezier(.16,1,.3,1) both PM2Urq_seat-icon-in}@keyframes PM2Urq_seat-icon-in{0%{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}.PM2Urq_introText{white-space:pre;display:inline-block}.PM2Urq_introChar{white-space:pre;opacity:0;animation:.4s ease-out forwards PM2Urq_seat-char-in;display:inline-block}@keyframes PM2Urq_seat-char-in{0%{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.PM2Urq_introIcon,.PM2Urq_introChar{opacity:1;animation:none}}.PM2Urq_chevron{color:var(--dsw-alias-label-caption);flex:none}.PM2Urq_item{flex-direction:column;gap:2px;max-width:280px;display:flex}.PM2Urq_itemName{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.PM2Urq_itemDesc{color:var(--dsw-alias-label-caption);white-space:normal;font-size:12px;line-height:16px}";
		const tagId$1 = "dsh-harness-agent-preset-editing-bundle/AgentPresetSeat.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-agent-preset-editing-bundle";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var AgentPresetSeat_module_css_default = {
			"chevron": "PM2Urq_chevron",
			"seatIcon": "PM2Urq_seatIcon",
			"introChar": "PM2Urq_introChar",
			"itemDesc": "PM2Urq_itemDesc",
			"introText": "PM2Urq_introText",
			"itemName": "PM2Urq_itemName",
			"introIcon": "PM2Urq_introIcon",
			"seat-icon-in": "PM2Urq_seat-icon-in",
			"seat": "PM2Urq_seat",
			"item": "PM2Urq_item",
			"seat-char-in": "PM2Urq_seat-char-in"
		};
		//#endregion
		//#region lib/types/ui/AgentPresetSeat.js
		/**
		* The agent-preset chip on the new-session screen, beside the workspace
		* picker.
		*
		* It lives here rather than in the composer because the choice is only
		* available before a conversation starts: once a turn has run, the session's
		* history was produced under that preset's tools and the host refuses to swap
		* them. A control that spends most of its life disabled belongs on the screen
		* where it still works.
		*
		* The menu opens on the staged choice, which starts as the deployment default.
		* Picking stages; the choice reaches a session when one becomes current.
		*/
		const INTRO_TEXT_DELAY_MS = 150;
		const INTRO_CHAR_STAGGER_MS = 40;
		const INTRO_TEXT_REVEAL_MS = 200;
		const INTRO_CHAR_FADE_MS = 400;
		/**
		* Per-character start offset for the introduce reveal.
		* @param count - character count of the shown preset name.
		* @returns milliseconds between successive character starts.
		*/
		function introStaggerMs(count) {
			if (count <= 1) return 0;
			return Math.min(INTRO_CHAR_STAGGER_MS, INTRO_TEXT_REVEAL_MS / (count - 1));
		}
		/**
		* Render the new-session agent-preset chip.
		* @param props - composed slot props.
		* @returns the chip, or null when the deployment composes no presets.
		*/
		function AgentPresetSeat({ load, select, introduced, useAgentPresetSeat, t }) {
			const state = useAgentPresetSeat((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const chosen = state.options.find((option) => option.id === state.current);
			const label = (chosen === void 0 ? void 0 : presetDisplayText(chosen, t))?.name ?? state.current;
			const ready = state.options.length > 0 && state.current !== "";
			const [introducing, setIntroducing] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!state.introduce || !ready) return;
				const characters = Array.from(label);
				if (characters.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
					introduced();
					return;
				}
				setIntroducing(true);
				const done = window.setTimeout(() => {
					setIntroducing(false);
					introduced();
				}, INTRO_TEXT_DELAY_MS + (characters.length - 1) * introStaggerMs(characters.length) + INTRO_CHAR_FADE_MS);
				return () => {
					window.clearTimeout(done);
				};
			}, [
				state.introduce,
				ready,
				label,
				introduced
			]);
			if (!ready) return null;
			const characters = Array.from(label);
			const stagger = introStaggerMs(characters.length);
			const shownLabel = introducing ? (0, react_jsx_runtime.jsx)("span", {
				className: AgentPresetSeat_module_css_default.introText,
				children: characters.map((character, index) => (0, react_jsx_runtime.jsx)("span", {
					className: AgentPresetSeat_module_css_default.introChar,
					style: { animationDelay: `${INTRO_TEXT_DELAY_MS + index * stagger}ms` },
					children: character
				}, index))
			}) : label;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				onClose: () => {
					setOpen(false);
				},
				items: state.options.map((option) => {
					const text = presetDisplayText(option, t);
					return {
						id: option.id,
						label: (0, react_jsx_runtime.jsxs)("span", {
							className: AgentPresetSeat_module_css_default.item,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: AgentPresetSeat_module_css_default.itemName,
								children: text.name
							}), (0, react_jsx_runtime.jsx)("span", {
								className: AgentPresetSeat_module_css_default.itemDesc,
								children: text.description ?? t("noDescription")
							})]
						})
					};
				}),
				selectedId: state.current,
				onSelect: (id) => {
					setOpen(false);
					select(id);
				},
				align: "start",
				portal: true,
				anchor: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: AgentPresetSeat_module_css_default.seat,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					title: state.error ?? t("seatHint"),
					disabled: state.busy,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutline16, { className: introducing ? `${AgentPresetSeat_module_css_default.seatIcon} ${AgentPresetSeat_module_css_default.introIcon}` : AgentPresetSeat_module_css_default.seatIcon }),
						shownLabel,
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: AgentPresetSeat_module_css_default.chevron })
					]
				})
			});
		}
		//#endregion
		//#region lib/types/ui/settings-store.js
		/**
		* Agent-preset default-settings controller.
		*
		* Options and the current default both come from one `agentPreset.list` call:
		* the roster already reports which id a session with no explicit choice gets,
		* so the row needs no schema introspection. Writes target the settings
		* namespace's `default` field, which is what the host resolves at creation.
		*/
		/** The agent-preset settings namespace on the host wire. */
		const AGENT_PRESET_SETTINGS_NS = "agent-presets";
		/**
		* Human text for a rejected wire call. A transport failure rejects with an
		* Error; a host or a runtime can reject with anything, and the surface still
		* has to say something.
		* @param error - the rejection value.
		* @returns the message to show.
		*/
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* Persist one preset as the default for sessions created later.
		*
		* The default is a settings field rather than a preset property, so both the
		* General row and the management section write it here — one home for which
		* namespace and field the host resolves at session creation.
		* @param api - the settings wire face.
		* @param id - the preset to make default.
		* @returns the failure message, or undefined once the write landed.
		*/
		async function writeDefaultPreset(api, id) {
			let response;
			try {
				response = await api.settings.update({
					ns: AGENT_PRESET_SETTINGS_NS,
					patch: { default: id }
				});
			} catch (error) {
				return messageOf(error);
			}
			return response.result.ok ? void 0 : response.result.error.message;
		}
		/**
		* Read the roster, folding both refusal shapes into one message.
		*
		* The wire refuses in two ways — the transport rejects, or it answers an
		* `ok: false` envelope — and every surface treats them identically. Folding
		* them here keeps each store's `load` about what it does with a roster rather
		* than about how the call can fail.
		* @param api - the agent-preset wire face.
		* @returns the roster, or the message to show in its place.
		*/
		async function readRoster(api) {
			try {
				const response = await api.agentPresets.list({});
				return response.result.ok ? {
					ok: true,
					value: response.result.value
				} : {
					ok: false,
					error: response.result.error.message
				};
			} catch (error) {
				return {
					ok: false,
					error: messageOf(error)
				};
			}
		}
		/**
		* The opening move every roster-backed surface makes: refuse a read that is
		* already in flight, mark the store loading, then read.
		*
		* A surface that gets `undefined` returns without touching its snapshot
		* further — either another read owns it, or this one already wrote the
		* failure. What differs between surfaces starts after this.
		* @param api - the agent-preset wire face.
		* @param store - the surface's own snapshot store.
		* @returns the roster, or undefined when the caller should return.
		*/
		async function beginRosterRead(api, store) {
			const before = store.getSnapshot();
			if (before.status === "loading") return void 0;
			store.set({
				...before,
				status: "loading",
				error: null
			});
			const roster = await readRoster(api);
			if (roster.ok) return roster.value;
			store.set({
				...store.getSnapshot(),
				status: "error",
				error: roster.error
			});
		}
		/**
		* The roster entries as the pickers render them: healthy presets only.
		*
		* The chip and the row exist to choose the NEXT session's composition, and a
		* broken preset cannot compose one — offering it would defer the discovery
		* of that fact to a failed session start. The management section renders the
		* full roster (broken rows included) from its own store instead.
		*
		* The chip, the row, and the management section all show the same facts, and
		* `exactOptionalPropertyTypes` makes "absent" and "present as undefined"
		* different shapes — so the spread dance belongs in one place rather than
		* once per store.
		* @param presets - the roster the host answered with.
		* @returns one option per selectable preset, in roster order.
		*/
		function presetOptions(presets) {
			return presets.filter((preset) => preset.broken === void 0).map((preset) => ({
				id: preset.id,
				trust: preset.trust,
				...preset.name === void 0 ? {} : { name: preset.name },
				...preset.description === void 0 ? {} : { description: preset.description }
			}));
		}
		const INITIAL$2 = {
			status: "idle",
			error: null,
			writable: true,
			currentValue: "",
			options: []
		};
		/** Reads the roster and persists the chosen default. */
		var AgentPresetSettingsController = class {
			api;
			/** Row snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL$2);
			constructor(api) {
				this.api = api;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			/**
			* Load the roster. An empty roster means the deployment composes no
			* presets, which is a valid deployment rather than a failure — the row
			* reports `unavailable` and renders nothing.
			* @returns once the snapshot reflects the host.
			*/
			async load() {
				const roster = await beginRosterRead(this.api, this.store);
				if (roster === void 0) return;
				const { presets } = roster;
				const [first] = presets;
				if (first === void 0) {
					this.set({
						status: "unavailable",
						options: [],
						currentValue: ""
					});
					return;
				}
				try {
					const described = await this.api.settings.describe({});
					this.set({
						status: "ready",
						error: null,
						writable: described.result.ok && described.result.value.writable,
						options: presetOptions(presets),
						currentValue: presets.find((preset) => preset.isDefault)?.id ?? first.id
					});
				} catch (error) {
					this.set({
						status: "error",
						error: messageOf(error)
					});
				}
			}
			/**
			* Persist one preset as the default for sessions created later. Running
			* sessions keep the composition they were created with, so this never
			* disturbs work in progress.
			* @param id - the preset to make default.
			* @returns once the write settled and the roster was re-read.
			*/
			async select(id) {
				const before = this.store.getSnapshot();
				if (before.status === "saving" || id === before.currentValue) return;
				this.set({
					status: "saving",
					error: null,
					currentValue: id
				});
				const failure = await writeDefaultPreset(this.api, id);
				if (failure !== void 0) {
					this.set({
						status: "ready",
						currentValue: before.currentValue,
						error: failure
					});
					return;
				}
				await this.load();
			}
		};
		//#endregion
		//#region lib/types/ui/section-store.js
		/**
		* Agent-preset management controller: the roster as a list, a copy dialog as
		* the only way a preset is created, and a structured editor over a locally
		* authored preset's editable fields.
		*
		* The browser edits no composition text. A new preset is a host-side copy of
		* an existing one (`{ from, id, name? }` is all that crosses the wire), and a
		* locally authored preset's fields are rewritten through a structured form
		* whose read/write ride the dedicated `/agent-preset-edit` wire channel — not
		* the shared `/api` agentPreset domain, which carries only roster reading,
		* copying, opening, and deleting. Everything after creation happens in the
		* preset's own files — which is why the page's other job is getting the user
		* TO those files: open the directory where the host has a desktop, show its
		* path where it does not.
		*
		* The host stays the single fact source. Every mutation writes through the
		* wire and the page re-reads the roster afterwards, because a copy or edit
		* changes more than the row it targeted.
		*/
		/** Ids a preset directory may be named, mirroring the host's own rule. */
		const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;
		const INITIAL$1 = {
			status: "idle",
			error: null,
			authorable: false,
			hasDocument: false,
			rows: [],
			copy: null,
			view: null,
			edit: null,
			pendingDelete: null,
			deleting: false,
			revealedPaths: {}
		};
		/**
		* Why this copy cannot be submitted yet, as a locale key, or undefined when
		* it can. Client-side only: the host re-checks the id and its answer is what
		* the dialog reports on failure.
		* @param draft - the open copy dialog.
		* @param rows - the roster, for the collision check.
		* @returns the blocking reason's locale key, or undefined when submittable.
		*/
		function draftBlocker(draft, rows) {
			if (draft.id === "") return "idRequired";
			if (!PRESET_ID.test(draft.id)) return "idInvalid";
			if (rows.some((row) => row.id === draft.id)) return "idTaken";
		}
		/**
		* Map one wire delegation instance to its staged draft.
		* @param instance - the delegation instance the host returned.
		* @returns the draft a form edits.
		*/
		function delegationToDraft(instance) {
			return {
				id: instance.id,
				enabled: instance.disabled !== true,
				...instance.provider === void 0 ? {} : { provider: instance.provider },
				...instance.backgroundMode === void 0 ? {} : { backgroundMode: instance.backgroundMode },
				backgroundModeLocked: instance.backgroundModeLocked ?? false,
				...instance.enableRunInBackground === void 0 ? {} : { enableRunInBackground: instance.enableRunInBackground },
				...instance.maxDepth === void 0 ? {} : { maxDepth: String(instance.maxDepth) },
				...instance.toolName === void 0 ? {} : { toolName: instance.toolName },
				touched: /* @__PURE__ */ new Set()
			};
		}
		/**
		* Map one wire tool row to its staged draft.
		* @param row - the tool row the host returned.
		* @returns the draft a form toggles.
		*/
		function toolToDraft(row) {
			return {
				id: row.id,
				name: row.name,
				enabled: row.disabled !== true,
				toggleable: row.disabled !== "expr",
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
		/** Reads the roster and drives the copy dialog, viewer, and location reveals. */
		var AgentPresetSectionController = class {
			api;
			editWire;
			rosterChanged;
			/** Page snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL$1);
			constructor(api, editWire, rosterChanged = () => {}) {
				this.api = api;
				this.editWire = editWire;
				this.rosterChanged = rosterChanged;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			patchCopy(patch) {
				const { copy } = this.store.getSnapshot();
				if (copy === null) return;
				this.set({ copy: {
					...copy,
					...patch
				} });
			}
			/**
			* Load the roster. An empty roster means the deployment composes no
			* presets, which is a valid deployment rather than a failure — the section
			* reports `unavailable` and renders nothing.
			* @returns once the snapshot reflects the host.
			*/
			async load() {
				const roster = await beginRosterRead(this.api, this.store);
				if (roster === void 0) return;
				const { presets, authorable, hasDocument } = roster;
				if (presets.length === 0) {
					this.set({
						status: "unavailable",
						rows: [],
						authorable,
						hasDocument,
						copy: null,
						view: null,
						edit: null
					});
					return;
				}
				const revealed = this.store.getSnapshot().revealedPaths;
				const kept = Object.fromEntries(Object.entries(revealed).filter(([id]) => presets.some((preset) => preset.id === id)));
				this.set({
					status: "ready",
					error: null,
					authorable,
					hasDocument,
					rows: presets.map((preset) => ({ ...preset })),
					revealedPaths: kept
				});
			}
			/**
			* Open one shipped preset's composition in the read-only viewer.
			* @param id - the preset to view.
			* @returns once the composition loaded or the failure is on the page.
			*/
			async view(id) {
				this.set({ error: null });
				try {
					const response = await this.api.agentPresets.read({ agentPreset: id });
					if (!response.result.ok) {
						this.set({ error: response.result.error.message });
						return;
					}
					const { name, content } = response.result.value;
					this.set({ view: {
						id,
						title: name ?? id,
						content
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/** Close the read-only viewer. */
			closeView() {
				this.set({ view: null });
			}
			patchEdit(patch) {
				const { edit } = this.store.getSnapshot();
				if (edit === null) return;
				this.set({ edit: {
					...edit,
					...patch
				} });
			}
			/**
			* Open the editable-fields editor over one locally authored preset, seeding
			* it from the wire's structured read. A preset with no persona row simply
			* has that group absent; the delegation and tool inventories are arrays
			* (possibly empty).
			* @param id - the preset to edit.
			* @returns once the fields loaded or the failure is on the dialog.
			*/
			async beginEdit(id) {
				const row = this.store.getSnapshot().rows.find((candidate) => candidate.id === id);
				this.set({
					error: null,
					edit: null
				});
				try {
					const response = await this.editWire.readEditable({ agentPreset: id });
					if (!response.ok) {
						this.set({ error: response.error.message });
						return;
					}
					const value = response.value;
					this.set({ edit: {
						id,
						title: row?.name ?? id,
						...value.persona === void 0 ? {} : { persona: value.persona.text },
						delegation: value.delegation.map(delegationToDraft),
						tools: value.tools.map(toolToDraft),
						catalog: value.catalog.map(catalogToDraft),
						installTools: /* @__PURE__ */ new Set(),
						removeTools: /* @__PURE__ */ new Set(),
						...value.name === void 0 ? {} : { name: value.name },
						...value.description === void 0 ? {} : { description: value.description },
						saving: false,
						error: null
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/** Close the editor, discarding whatever was typed. */
			cancelEdit() {
				this.set({ edit: null });
			}
			/**
			* Stage one editor field. The scope is either a top-level field (`persona`,
			* `name`, `description`), a delegation instance (`delegation:<id>`, where
			* the field is one of the delegation keys), or a tool row (`tool:<id>`,
			* where the field is `enabled`).
			* @param scope - the group the field belongs to.
			* @param field - the field name within that group.
			* @param value - the staged value (a string for text, a boolean for toggles).
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
				if (scope === "name") {
					this.patchEdit({
						name: String(value),
						error: null
					});
					return;
				}
				if (scope === "description") {
					this.patchEdit({
						description: String(value),
						error: null
					});
					return;
				}
				if (scope.startsWith("delegation:")) {
					const id = scope.slice(11);
					this.patchEdit({
						delegation: edit.delegation.map((instance) => instance.id === id ? {
							...instance,
							[field]: value,
							touched: new Set(instance.touched).add(field)
						} : instance),
						error: null
					});
					return;
				}
				if (scope.startsWith("tool:")) {
					const id = scope.slice(5);
					this.patchEdit({
						tools: edit.tools.map((tool) => tool.id === id ? {
							...tool,
							enabled: value === true
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
			/**
			* Whether the open editor can be saved. A delegation instance whose
			* backgroundMode is not one of the accepted literals is invalid (the form
			* only offers literals, so this guards stale or malformed drafts). An
			* unknown provider is NOT blocked: the host answers conservatively for it
			* (only `enableRunInBackground`, which needs no enum), so refusing the save
			* would leave the other blocks — persona, tools, metadata — stuck with no
			* feedback. The provider itself is read-only identity and is never sent.
			* @param edit - the open editor.
			* @returns the blocking locale key, or undefined when saveable.
			*/
			editBlocker(edit) {
				const modes = /* @__PURE__ */ new Set(["one-shot", "continuable"]);
				for (const instance of edit.delegation) if (instance.backgroundMode !== void 0 && !modes.has(instance.backgroundMode)) return "delegationInvalid";
			}
			/**
			* Save the editor's staged fields, then re-read the roster.
			* @returns once the save settled and the page reflects it.
			*/
			async confirmEdit() {
				const { edit } = this.store.getSnapshot();
				if (edit === null || edit.saving) return;
				if (this.editBlocker(edit) !== void 0) return;
				this.patchEdit({
					saving: true,
					error: null
				});
				try {
					const delegationEntries = edit.delegation.map((instance) => {
						const edits = {};
						if (instance.touched.has("backgroundMode") && instance.backgroundMode !== void 0) edits.backgroundMode = instance.backgroundMode;
						if (instance.touched.has("enableRunInBackground") && instance.enableRunInBackground !== void 0) edits.enableRunInBackground = instance.enableRunInBackground;
						if (instance.touched.has("maxDepth") && instance.maxDepth !== void 0) edits.maxDepth = instance.maxDepth === "provider-managed" ? "provider-managed" : Number.isFinite(Number(instance.maxDepth)) ? Number(instance.maxDepth) : instance.maxDepth;
						return [instance.id, edits];
					}).filter(([, edits]) => Object.keys(edits).length > 0);
					const toolEntries = edit.tools.filter((tool) => tool.toggleable).map((tool) => [tool.id, { disabled: !tool.enabled }]);
					const installTools = [...edit.installTools].filter((name) => !edit.catalog.some((entry) => entry.name === name && entry.installed));
					const removeRowIds = [...edit.removeTools].map((name) => edit.tools.find((tool) => tool.name === name)?.id).filter((id) => id !== void 0);
					const response = await this.editWire.update({
						agentPreset: edit.id,
						...edit.persona === void 0 ? {} : { persona: { text: edit.persona } },
						...delegationEntries.length === 0 ? {} : { delegation: Object.fromEntries(delegationEntries) },
						...toolEntries.length === 0 ? {} : { tools: Object.fromEntries(toolEntries) },
						...installTools.length === 0 ? {} : { installTools },
						...removeRowIds.length === 0 ? {} : { removeTools: removeRowIds },
						...edit.name === void 0 && edit.description === void 0 ? {} : { metadata: {
							...edit.name === void 0 ? {} : { name: edit.name },
							...edit.description === void 0 ? {} : { description: edit.description }
						} }
					});
					if (!response.ok) {
						this.patchEdit({
							saving: false,
							error: response.error.message
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
			/**
			* Open the copy dialog over one preset.
			* @param from - the preset the copy will start from.
			*/
			beginCopy(from) {
				const row = this.store.getSnapshot().rows.find((candidate) => candidate.id === from);
				this.set({
					error: null,
					copy: {
						from,
						fromTitle: row?.name ?? from,
						id: "",
						name: "",
						saving: false,
						error: null
					}
				});
			}
			/** Close the copy dialog, discarding whatever was typed. */
			cancelCopy() {
				this.set({ copy: null });
			}
			/**
			* Name the preset the copy creates.
			* @param id - the id typed into the dialog.
			*/
			setCopyId(id) {
				this.patchCopy({
					id,
					error: null
				});
			}
			/**
			* Name the copy's display name.
			* @param name - the display name typed into the dialog.
			*/
			setCopyName(name) {
				this.patchCopy({
					name,
					error: null
				});
			}
			/**
			* Submit the copy, re-read the roster, then take the user to the new
			* preset's files — the directory opens where the host has a desktop, and
			* its path appears on the new row where it does not.
			* @returns once the copy settled and the page reflects it.
			*/
			async confirmCopy() {
				const draft = this.store.getSnapshot().copy;
				if (draft === null || draft.saving) return;
				if (draftBlocker(draft, this.store.getSnapshot().rows) !== void 0) return;
				this.patchCopy({
					saving: true,
					error: null
				});
				try {
					const name = draft.name.trim();
					const response = await this.api.agentPresets.copy({
						from: draft.from,
						agentPreset: draft.id,
						...name === "" ? {} : { name }
					});
					if (!response.result.ok) {
						this.patchCopy({
							saving: false,
							error: response.result.error.message
						});
						return;
					}
					this.set({ copy: null });
					await this.load();
					this.rosterChanged();
					await this.openLocation(draft.id);
				} catch (error) {
					this.patchCopy({
						saving: false,
						error: messageOf(error)
					});
				}
			}
			/**
			* Open one preset's directory on the host desktop, or reveal its path on
			* the row where the deployment has no opener to hand it to.
			* @param id - the preset whose files the user wants.
			* @returns once the host answered and the page reflects it.
			*/
			async openLocation(id) {
				try {
					const response = await this.api.agentPresets.openDocument({ agentPreset: id });
					if (!response.result.ok) {
						this.set({ error: response.result.error.message });
						return;
					}
					if (response.result.value.opened) return;
					const { path } = response.result.value;
					this.set({ revealedPaths: {
						...this.store.getSnapshot().revealedPaths,
						[id]: path
					} });
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/**
			* Ask for confirmation before deleting one preset.
			* @param id - the preset to delete, or null to dismiss the confirmation.
			*/
			confirmDelete(id) {
				if (this.store.getSnapshot().deleting) return;
				this.set({ pendingDelete: id });
			}
			/**
			* Delete the preset awaiting confirmation, then re-read the roster.
			*
			* A session already composed from it keeps running: its composition was
			* mounted at creation and nothing re-reads the file.
			* @returns once the delete settled and the page reflects it.
			*/
			async remove() {
				const { pendingDelete, deleting } = this.store.getSnapshot();
				if (pendingDelete === null || deleting) return;
				this.set({
					deleting: true,
					error: null
				});
				try {
					const response = await this.api.agentPresets.remove({ agentPreset: pendingDelete });
					if (!response.result.ok) {
						this.set({
							deleting: false,
							pendingDelete: null,
							error: response.result.error.message
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
			/**
			* Make one preset the default for sessions created later. Running sessions
			* keep the composition they began with, so this never disturbs work.
			* @param id - the preset to make default.
			* @returns once the write settled and the roster was re-read.
			*/
			async makeDefault(id) {
				const failure = await writeDefaultPreset(this.api, id);
				if (failure !== void 0) {
					this.set({ error: failure });
					return;
				}
				await this.load();
			}
		};
		//#endregion
		//#region \0dsh-css:bundle/agent-preset-editing/src/ui/AgentPresetSection.module.css.mjs
		const css = ".ob2WKq_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.ob2WKq_title{margin:0;font-size:18px;font-weight:600}.ob2WKq_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}.ob2WKq_group{flex-direction:column;gap:10px;display:flex}.ob2WKq_group+.ob2WKq_group{margin-top:20px}.ob2WKq_groupHead{letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;font-weight:600}.ob2WKq_cards{grid-template-columns:repeat(auto-fill,minmax(268px,1fr));grid-auto-rows:1fr;gap:12px;margin:0;padding:0;list-style:none;display:grid}.ob2WKq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;transition:border-color .16s,background .16s;display:flex}.ob2WKq_card:hover:not(.ob2WKq_cardActive){border-color:var(--dsw-alias-label-dimmed)}.ob2WKq_cardActive{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-primary)}.ob2WKq_cardBroken,.ob2WKq_cardBroken:hover{border-color:var(--dsw-alias-state-error-primary)}.ob2WKq_brokenBadge{white-space:nowrap;background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-layer-3);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.ob2WKq_cardBrokenReason{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;font-size:12px;line-height:1.5}.ob2WKq_cardMain{appearance:none;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px 12px 0 0;flex-direction:column;flex:1;gap:8px;padding:14px 16px 12px;display:flex}.ob2WKq_cardMain:disabled{cursor:default}.ob2WKq_cardMain:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.ob2WKq_cardHead{align-items:center;gap:8px;display:flex}.ob2WKq_cardName{font-size:15px;font-weight:600;line-height:1.4}.ob2WKq_badge,.ob2WKq_inUse{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.ob2WKq_badge{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}.ob2WKq_inUse{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);margin-left:auto}.ob2WKq_cardDesc{color:var(--dsw-alias-label-secondary);-webkit-line-clamp:4;overflow-wrap:anywhere;-webkit-box-orient:vertical;min-height:42px;font-size:13px;line-height:1.55;display:-webkit-box;overflow:hidden}.ob2WKq_cardId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-dimmed);margin-top:auto;font-size:11px}.ob2WKq_cardFoot{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;gap:2px;padding:6px 10px;display:flex}.ob2WKq_iconButton{appearance:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;align-items:center;padding:6px;display:inline-flex;position:relative}.ob2WKq_iconButton:disabled{opacity:.4;cursor:default}.ob2WKq_iconButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.ob2WKq_iconButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}.ob2WKq_iconButton:after{content:attr(data-tip);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);white-space:nowrap;opacity:0;pointer-events:none;border-radius:6px;padding:3px 8px;font-size:11px;line-height:17px;transition:opacity .12s;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translate(-50%)}.ob2WKq_iconButton:hover:after,.ob2WKq_iconButton:focus-visible:after{opacity:1}.ob2WKq_iconDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}.ob2WKq_revealedPath{color:var(--dsw-alias-label-tertiary);align-items:baseline;gap:6px;margin:0;padding:6px 16px 10px;font-size:11px;display:flex}.ob2WKq_revealedPath code{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-secondary);user-select:all;overflow-wrap:anywhere}.ob2WKq_revealedPathLabel{white-space:nowrap}.ob2WKq_secondaryButton{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:7px;padding:5px 8px;font-size:12.5px}.ob2WKq_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}.ob2WKq_secondaryButton:disabled{opacity:.5;cursor:default}.ob2WKq_field{flex-direction:column;gap:6px;display:flex}.ob2WKq_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}.ob2WKq_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 12px;font-size:13px}.ob2WKq_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.ob2WKq_input::placeholder{color:var(--dsw-alias-label-dimmed)}.ob2WKq_dialog{width:min(560px,100%)}.ob2WKq_dialogScroll{max-height:min(80vh,640px);overflow:auto}.ob2WKq_dialogFields{flex-direction:column;gap:12px;display:flex}.ob2WKq_viewerCode{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);max-height:min(52vh,480px);color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);white-space:pre;tab-size:2;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:10px;margin:0;padding:12px;font-size:12.5px;line-height:1.5;overflow:auto}.ob2WKq_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px}.ob2WKq_deleteDialog{width:min(480px,100%)}.ob2WKq_deleteConfirm:not(:disabled){border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}.ob2WKq_deleteConfirm:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.ob2WKq_creatorButton{box-sizing:border-box;border:1px dashed var(--dsw-alias-border-l3);height:44px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:12px;justify-content:center;align-self:stretch;align-items:center;gap:6px;font-size:14px;line-height:22px;display:flex}.ob2WKq_creatorButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ob2WKq_creatorButton:disabled{opacity:.4;cursor:default}.ob2WKq_textarea{resize:vertical;min-height:96px;line-height:1.55}.ob2WKq_selectTrigger{cursor:pointer;text-align:left;font:inherit;justify-content:space-between;align-items:center;font-size:13px;display:flex}.ob2WKq_selectTrigger:disabled{opacity:.55;cursor:default}.ob2WKq_selectChevron{flex:none}.ob2WKq_toggle{appearance:none;background:var(--dsw-alias-border-l2);cursor:pointer;border-radius:999px;flex:none;width:34px;height:20px;transition:background .16s;position:relative}.ob2WKq_toggle:checked{background:var(--dsw-alias-brand-primary)}.ob2WKq_toggle:after{content:\"\";background:var(--dsw-alias-bg-layer-3);border-radius:999px;width:16px;height:16px;transition:transform .16s;position:absolute;top:2px;left:2px}.ob2WKq_toggle:checked:after{transform:translate(14px)}.ob2WKq_toggle:disabled{opacity:.55;cursor:default}.ob2WKq_toggleField{flex-direction:row;justify-content:space-between;align-items:center;gap:12px}.ob2WKq_delegationRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;gap:10px;padding:12px;display:flex}.ob2WKq_delegationHead{align-items:baseline;gap:8px;display:flex}.ob2WKq_delegationId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:600}.ob2WKq_delegationProvider{color:var(--dsw-alias-label-tertiary);font-size:11.5px}.ob2WKq_editorBlock{flex-direction:column;gap:10px;display:flex}.ob2WKq_blockTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;font-weight:600}.ob2WKq_toolRow{flex-direction:row;align-items:center;gap:10px}.ob2WKq_toolId{font-family:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;font-size:12.5px}.ob2WKq_toolState{color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-left:auto;font-size:11px}.ob2WKq_toolExpr{color:var(--dsw-alias-state-warning-primary);white-space:nowrap;font-size:11px}.ob2WKq_toolInfo{flex:none;position:relative}.ob2WKq_toolInfoSummary{border:1px solid var(--dsw-alias-border-l2);width:18px;height:18px;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:999px;justify-content:center;align-items:center;font-size:11px;line-height:1;list-style:none;display:flex}.ob2WKq_toolInfoSummary::-webkit-details-marker{display:none}.ob2WKq_toolInfoBody{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:260px;box-shadow:var(--dsw-alias-shadow-pop);z-index:10;border-radius:10px;padding:10px 12px;position:absolute;bottom:calc(100% + 6px);right:0}.ob2WKq_toolDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}.ob2WKq_toolInfoSpacer{flex:none;width:18px}";
		const tagId = "dsh-harness-agent-preset-editing-bundle/AgentPresetSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-agent-preset-editing-bundle";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var AgentPresetSection_module_css_default = {
			"delegationProvider": "ob2WKq_delegationProvider",
			"toolInfoSummary": "ob2WKq_toolInfoSummary",
			"toolState": "ob2WKq_toolState",
			"cardHead": "ob2WKq_cardHead",
			"cardFoot": "ob2WKq_cardFoot",
			"toolInfoBody": "ob2WKq_toolInfoBody",
			"revealedPath": "ob2WKq_revealedPath",
			"fieldLabel": "ob2WKq_fieldLabel",
			"deleteConfirm": "ob2WKq_deleteConfirm",
			"brokenBadge": "ob2WKq_brokenBadge",
			"creatorButton": "ob2WKq_creatorButton",
			"selectTrigger": "ob2WKq_selectTrigger",
			"toolRow": "ob2WKq_toolRow",
			"cardId": "ob2WKq_cardId",
			"group": "ob2WKq_group",
			"field": "ob2WKq_field",
			"cardMain": "ob2WKq_cardMain",
			"error": "ob2WKq_error",
			"textarea": "ob2WKq_textarea",
			"editorBlock": "ob2WKq_editorBlock",
			"cardName": "ob2WKq_cardName",
			"selectChevron": "ob2WKq_selectChevron",
			"inUse": "ob2WKq_inUse",
			"cardDesc": "ob2WKq_cardDesc",
			"toolExpr": "ob2WKq_toolExpr",
			"viewerCode": "ob2WKq_viewerCode",
			"section": "ob2WKq_section",
			"toolInfo": "ob2WKq_toolInfo",
			"toolInfoSpacer": "ob2WKq_toolInfoSpacer",
			"groupHead": "ob2WKq_groupHead",
			"revealedPathLabel": "ob2WKq_revealedPathLabel",
			"dialogScroll": "ob2WKq_dialogScroll",
			"cardActive": "ob2WKq_cardActive",
			"delegationHead": "ob2WKq_delegationHead",
			"blockTitle": "ob2WKq_blockTitle",
			"toolId": "ob2WKq_toolId",
			"toggle": "ob2WKq_toggle",
			"secondaryButton": "ob2WKq_secondaryButton",
			"intro": "ob2WKq_intro",
			"toolDesc": "ob2WKq_toolDesc",
			"title": "ob2WKq_title",
			"card": "ob2WKq_card",
			"cards": "ob2WKq_cards",
			"cardBroken": "ob2WKq_cardBroken",
			"cardBrokenReason": "ob2WKq_cardBrokenReason",
			"badge": "ob2WKq_badge",
			"dialog": "ob2WKq_dialog",
			"delegationRow": "ob2WKq_delegationRow",
			"iconDanger": "ob2WKq_iconDanger",
			"iconButton": "ob2WKq_iconButton",
			"dialogFields": "ob2WKq_dialogFields",
			"deleteDialog": "ob2WKq_deleteDialog",
			"toggleField": "ob2WKq_toggleField",
			"delegationId": "ob2WKq_delegationId",
			"input": "ob2WKq_input"
		};
		//#endregion
		//#region lib/types/ui/AgentPresetSection.js
		/**
		* Agent-presets settings section: the roster as cards, a copy dialog as the
		* only way a preset is created, a structured editor over a locally authored
		* preset's editable fields, and a read-only viewer over the shipped
		* compositions.
		*
		* The browser edits no composition text — a shipped preset opens read-only to
		* be READ (it is the known-good composition a copy starts from), and a custom
		* preset is edited in its own files through the structured form, which is what
		* the edit action opens. Deleting a preset leaves running sessions alone: a
		* composition is mounted once at session creation and nothing re-reads the
		* file.
		*/
		function CopyDialog({ state, t, actions }) {
			const draft = state.copy;
			const blocker = draft === null ? void 0 : draftBlocker(draft, state.rows);
			const message = draft === null ? null : draft.error ?? (blocker === void 0 ? null : t(blocker));
			const source = draft === null ? void 0 : state.rows.find((row) => row.id === draft.from);
			const sourceTitle = source === void 0 ? draft?.fromTitle : presetDisplayText(source, t).name;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: draft !== null,
				onClose: () => {
					actions.cancelCopy();
				},
				title: draft === null ? t("copyTitle") : `${t("copyTitle")} · ${t("copyOf")} ${sourceTitle}`,
				closeLabel: t("close"),
				description: t("copyIntro"),
				className: AgentPresetSection_module_css_default.dialog,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: draft?.saving === true,
					onClick: () => {
						actions.cancelCopy();
					},
					children: t("cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: draft === null || draft.saving || blocker !== void 0,
					onClick: () => {
						actions.confirmCopy();
					},
					children: draft?.saving === true ? t("creating") : t("create")
				})] }),
				children: draft === null ? null : (0, react_jsx_runtime.jsxs)("div", {
					className: AgentPresetSection_module_css_default.dialogFields,
					children: [
						(0, react_jsx_runtime.jsxs)("label", {
							className: AgentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: AgentPresetSection_module_css_default.fieldLabel,
								children: t("presetId")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: AgentPresetSection_module_css_default.input,
								value: draft.id,
								autoFocus: true,
								spellCheck: false,
								placeholder: t("presetIdPlaceholder"),
								onChange: (event) => {
									actions.setCopyId(event.target.value);
								}
							})]
						}),
						(0, react_jsx_runtime.jsxs)("label", {
							className: AgentPresetSection_module_css_default.field,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: AgentPresetSection_module_css_default.fieldLabel,
								children: t("displayName")
							}), (0, react_jsx_runtime.jsx)("input", {
								className: AgentPresetSection_module_css_default.input,
								value: draft.name,
								spellCheck: false,
								placeholder: t("displayNamePlaceholder"),
								onChange: (event) => {
									actions.setCopyName(event.target.value);
								}
							})]
						}),
						message === null ? null : (0, react_jsx_runtime.jsx)("p", {
							className: AgentPresetSection_module_css_default.error,
							role: "alert",
							children: message
						})
					]
				})
			});
		}
		/** The background modes a delegation instance may use. */
		const BACKGROUND_MODES = ["one-shot", "continuable"];
		/** The max-depth choices: explicit non-negative integers plus a provider-managed
		*  sentinel. Code and Claude carriers default to `provider-managed`; integer caps
		*  require the provider's `depthLimit` capability, so most users leave this
		*  alone. Keep `provider-managed` last so the menu shows numeric options first. */
		const MAX_DEPTH_CHOICES = [
			"0",
			"1",
			"2",
			"3",
			"5",
			"10",
			"provider-managed"
		];
		/** Render one free-text editor field row (single-line or textarea). */
		function TextEditField({ label, value, placeholder, onEdit, textarea = false }) {
			const className = textarea ? `${AgentPresetSection_module_css_default.input} ${AgentPresetSection_module_css_default.textarea}` : AgentPresetSection_module_css_default.input;
			return (0, react_jsx_runtime.jsxs)("label", {
				className: AgentPresetSection_module_css_default.field,
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: AgentPresetSection_module_css_default.fieldLabel,
					children: label
				}), textarea ? (0, react_jsx_runtime.jsx)("textarea", {
					className,
					value,
					spellCheck: false,
					placeholder,
					onChange: (event) => {
						onEdit(event.target.value);
					}
				}) : (0, react_jsx_runtime.jsx)("input", {
					className,
					value,
					spellCheck: false,
					placeholder,
					onChange: (event) => {
						onEdit(event.target.value);
					}
				})]
			});
		}
		/**
		* Render an enum dropdown field, using the primitives Menu as the selector.
		*
		* The field label and the menu trigger are deliberately NOT one `<label>`
		* wrapper: a label containing a button associates the whole label's text with
		* that button (so the trigger's accessible name becomes the label, not its own
		* value) and forwards a click on the label text to the button — which would
		* open the dropdown from "blank" text, not the explicit trigger. Keeping the
		* label a plain sibling span means only the button itself opens the menu.
		*/
		function SelectField({ label, value, choices, onSelect, disabled = false }) {
			const [open, setOpen] = (0, react.useState)(false);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentPresetSection_module_css_default.field,
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: AgentPresetSection_module_css_default.fieldLabel,
					children: label
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open: disabled ? false : open,
					onClose: () => {
						setOpen(false);
					},
					selectedId: value,
					items: choices.map((choice) => ({
						id: choice,
						label: choice
					})),
					onSelect: (choice) => {
						onSelect(choice);
						setOpen(false);
					},
					anchor: (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: `${AgentPresetSection_module_css_default.input} ${AgentPresetSection_module_css_default.selectTrigger}`,
						"aria-haspopup": "menu",
						"aria-expanded": disabled ? false : open,
						disabled,
						onClick: () => {
							setOpen(!open);
						},
						children: [(0, react_jsx_runtime.jsx)("span", { children: value }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: AgentPresetSection_module_css_default.selectChevron })]
					})
				})]
			});
		}
		/** Render an on/off toggle field (a switch-styled checkbox). */
		function ToggleField({ label, checked, onToggle, disabled = false }) {
			return (0, react_jsx_runtime.jsxs)("label", {
				className: `${AgentPresetSection_module_css_default.field} ${AgentPresetSection_module_css_default.toggleField}`,
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: AgentPresetSection_module_css_default.fieldLabel,
					children: label
				}), (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					role: "switch",
					className: AgentPresetSection_module_css_default.toggle,
					checked,
					disabled,
					onChange: (event) => {
						onToggle(event.target.checked);
					}
				})]
			});
		}
		/** Render one delegation instance's editable controls. */
		function DelegationRow({ instance, t, actions }) {
			const scope = `delegation:${instance.id}`;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentPresetSection_module_css_default.delegationRow,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentPresetSection_module_css_default.delegationHead,
						children: [(0, react_jsx_runtime.jsx)("span", {
							className: AgentPresetSection_module_css_default.delegationId,
							children: instance.id
						}), instance.provider === void 0 ? null : (0, react_jsx_runtime.jsxs)("span", {
							className: AgentPresetSection_module_css_default.delegationProvider,
							children: [
								t("delegation.provider"),
								": ",
								instance.provider
							]
						})]
					}),
					instance.backgroundMode === void 0 ? null : (0, react_jsx_runtime.jsx)(SelectField, {
						label: t("delegation.backgroundMode"),
						value: instance.backgroundMode,
						choices: BACKGROUND_MODES,
						disabled: instance.backgroundModeLocked,
						onSelect: (value) => {
							actions.setEditField(scope, "backgroundMode", value);
						}
					}),
					instance.enableRunInBackground === void 0 ? null : (0, react_jsx_runtime.jsx)(ToggleField, {
						label: t("delegation.enableRunInBackground"),
						checked: instance.enableRunInBackground,
						onToggle: (checked) => {
							actions.setEditField(scope, "enableRunInBackground", checked);
						}
					}),
					instance.maxDepth === void 0 ? null : (0, react_jsx_runtime.jsx)(SelectField, {
						label: t("delegation.maxDepth"),
						value: instance.maxDepth,
						choices: MAX_DEPTH_CHOICES,
						onSelect: (value) => {
							actions.setEditField(scope, "maxDepth", value);
						}
					}),
					(0, react_jsx_runtime.jsx)(ToggleField, {
						label: t("delegation.enabled"),
						checked: instance.enabled,
						onToggle: (checked) => {
							actions.setEditField(scope, "enabled", checked);
						}
					})
				]
			});
		}
		/** A collapsible detail disclosure rendered as an info marker after a row. */
		function ToolInfo({ title, children }) {
			return (0, react_jsx_runtime.jsxs)("details", {
				className: AgentPresetSection_module_css_default.toolInfo,
				children: [(0, react_jsx_runtime.jsx)("summary", {
					className: AgentPresetSection_module_css_default.toolInfoSummary,
					"aria-label": `${title}: 详情`,
					title,
					children: "!"
				}), (0, react_jsx_runtime.jsx)("div", {
					className: AgentPresetSection_module_css_default.toolInfoBody,
					children
				})]
			});
		}
		/** Render one available-tool catalog entry: add if absent, remove if present. */
		function CatalogRowView({ entry, edit, t, actions }) {
			const scope = `catalog:${entry.name}`;
			if (entry.installed) {
				const removable = edit.tools.find((candidate) => candidate.name === entry.name)?.toggleable ?? true;
				return (0, react_jsx_runtime.jsxs)("div", {
					className: `${AgentPresetSection_module_css_default.field} ${AgentPresetSection_module_css_default.toolRow}`,
					children: [
						(0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							role: "switch",
							"aria-label": entry.name,
							className: AgentPresetSection_module_css_default.toggle,
							checked: edit.removeTools.has(entry.name) === false,
							disabled: !removable,
							onChange: (event) => {
								actions.setEditField(scope, "remove", !event.target.checked);
							}
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: AgentPresetSection_module_css_default.toolId,
							children: entry.name
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: AgentPresetSection_module_css_default.toolState,
							children: t("toolInstalled")
						}),
						!removable ? (0, react_jsx_runtime.jsx)("span", {
							className: AgentPresetSection_module_css_default.toolExpr,
							children: t("toolExprDisabled")
						}) : null,
						entry.description === void 0 ? (0, react_jsx_runtime.jsx)("span", { className: AgentPresetSection_module_css_default.toolInfoSpacer }) : (0, react_jsx_runtime.jsx)(ToolInfo, {
							title: entry.name,
							children: (0, react_jsx_runtime.jsx)("span", {
								className: AgentPresetSection_module_css_default.toolDesc,
								children: entry.description
							})
						})
					]
				});
			}
			return (0, react_jsx_runtime.jsxs)("div", {
				className: `${AgentPresetSection_module_css_default.field} ${AgentPresetSection_module_css_default.toolRow}`,
				children: [
					(0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						role: "switch",
						"aria-label": entry.name,
						className: AgentPresetSection_module_css_default.toggle,
						checked: edit.installTools.has(entry.name),
						onChange: (event) => {
							actions.setEditField(scope, "install", event.target.checked);
						}
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: AgentPresetSection_module_css_default.toolId,
						children: entry.name
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: AgentPresetSection_module_css_default.toolState,
						children: t("toolUninstalled")
					}),
					entry.description === void 0 ? (0, react_jsx_runtime.jsx)("span", { className: AgentPresetSection_module_css_default.toolInfoSpacer }) : (0, react_jsx_runtime.jsx)(ToolInfo, {
						title: entry.name,
						children: (0, react_jsx_runtime.jsx)("span", {
							className: AgentPresetSection_module_css_default.toolDesc,
							children: entry.description
						})
					})
				]
			});
		}
		/**
		* Render the editable-fields editor over one locally authored preset. The form
		* has four blocks: display metadata (name/description), the persona prompt,
		* every delegation instance (one row each, with enum dropdowns and toggles),
		* and the tool inventory (one row each, with a toggle).
		* @param props - editor props.
		* @returns the editor modal, or null when none is open.
		*/
		function EditDialog({ state, t, actions }) {
			const draft = state.edit ?? null;
			const message = draft?.error ?? null;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: draft !== null,
				onClose: () => {
					actions.cancelEdit();
				},
				title: draft === null ? t("editTitle") : `${t("editTitle")} · ${draft.title}`,
				closeLabel: t("close"),
				description: t("editIntro"),
				className: AgentPresetSection_module_css_default.dialog,
				contentClassName: AgentPresetSection_module_css_default.dialogScroll,
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: draft?.saving === true,
					onClick: () => {
						actions.cancelEdit();
					},
					children: t("cancel")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					disabled: draft === null || draft.saving,
					onClick: () => {
						actions.confirmEdit();
					},
					children: draft?.saving === true ? t("saving") : t("save")
				})] }),
				children: draft === null ? null : (0, react_jsx_runtime.jsxs)("div", {
					className: AgentPresetSection_module_css_default.dialogFields,
					children: [
						draft.name === void 0 ? null : (0, react_jsx_runtime.jsx)(TextEditField, {
							label: t("displayName"),
							value: draft.name,
							placeholder: t("displayNamePlaceholder"),
							onEdit: (text) => {
								actions.setEditField("name", "value", text);
							}
						}),
						draft.description === void 0 ? null : (0, react_jsx_runtime.jsx)(TextEditField, {
							label: t("descriptionLabel"),
							value: draft.description,
							placeholder: t("descriptionPlaceholder"),
							textarea: true,
							onEdit: (text) => {
								actions.setEditField("description", "value", text);
							}
						}),
						draft.persona === void 0 ? null : (0, react_jsx_runtime.jsx)(TextEditField, {
							label: t("personaText"),
							value: draft.persona,
							placeholder: t("personaTextPlaceholder"),
							textarea: true,
							onEdit: (text) => {
								actions.setEditField("persona", "value", text);
							}
						}),
						draft.delegation.length === 0 ? null : (0, react_jsx_runtime.jsxs)("section", {
							className: AgentPresetSection_module_css_default.editorBlock,
							children: [(0, react_jsx_runtime.jsx)("h4", {
								className: AgentPresetSection_module_css_default.blockTitle,
								children: t("delegationTitle")
							}), draft.delegation.map((instance) => (0, react_jsx_runtime.jsx)(DelegationRow, {
								instance,
								t,
								actions
							}, instance.id))]
						}),
						draft.catalog.length === 0 ? null : (0, react_jsx_runtime.jsxs)("section", {
							className: AgentPresetSection_module_css_default.editorBlock,
							children: [(0, react_jsx_runtime.jsx)("h4", {
								className: AgentPresetSection_module_css_default.blockTitle,
								children: t("toolsTitle")
							}), draft.catalog.map((entry) => (0, react_jsx_runtime.jsx)(CatalogRowView, {
								entry,
								edit: draft,
								t,
								actions
							}, entry.name))]
						}),
						message === null ? null : (0, react_jsx_runtime.jsx)("p", {
							className: AgentPresetSection_module_css_default.error,
							role: "alert",
							children: message
						})
					]
				})
			});
		}
		/**
		* Render one card's description, clamped by CSS and offered in full on hover.
		* The tooltip is attached only while the text is actually cut off, so a short
		* description does not answer a hover with a bubble repeating the card.
		* @param props.text - the description as rendered, already localized.
		* @returns the description element, tooltip-anchored while it overflows.
		*/
		function CardDescription({ text }) {
			const ref = (0, react.useRef)(null);
			const [truncated, setTruncated] = (0, react.useState)(false);
			(0, react.useLayoutEffect)(() => {
				const el = ref.current;
				/* v8 ignore next -- the ref is attached before layout effects run. */
				if (el === null) return;
				const measure = () => {
					setTruncated(el.scrollHeight > el.clientHeight);
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(el);
				return () => {
					observer.disconnect();
				};
			}, [text]);
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: text,
				side: "bottom",
				delayMs: 400,
				disabled: !truncated,
				maxWidth: 360,
				children: (0, react_jsx_runtime.jsx)("span", {
					ref,
					className: AgentPresetSection_module_css_default.cardDesc,
					title: "",
					children: text
				})
			});
		}
		/**
		* Render the Agent presets section content column.
		* @param props - composed slot props.
		* @returns the section, or null when the deployment composes no presets.
		*/
		function AgentPresetSection(props) {
			const { useAgentPresetSection, t, load } = props;
			const state = useAgentPresetSection((snapshot) => snapshot);
			const viewedId = state.view?.id;
			const viewedRow = viewedId === void 0 ? void 0 : state.rows.find((row) => row.id === viewedId);
			const viewedTitle = state.view === null ? "" : viewedRow === void 0 ? state.view.title : presetDisplayText(viewedRow, t).name;
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			if (state.status === "unavailable") return null;
			if (state.status === "error") {
				/* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
				const detail = state.error ?? "";
				return (0, react_jsx_runtime.jsxs)("div", {
					className: AgentPresetSection_module_css_default.section,
					children: [(0, react_jsx_runtime.jsx)("p", {
						className: AgentPresetSection_module_css_default.error,
						role: "alert",
						children: `${t("error")} ${detail}`
					}), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: AgentPresetSection_module_css_default.secondaryButton,
						onClick: () => {
							load();
						},
						children: t("retry")
					})]
				});
			}
			const creatorButton = props.startCreatorDraft !== void 0 && state.rows.some((row) => row.id === "cordis") ? (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: AgentPresetSection_module_css_default.creatorButton,
				disabled: !state.authorable,
				title: state.authorable ? void 0 : t("duplicateUnavailable"),
				onClick: () => {
					props.startCreatorDraft?.();
					props.close();
				},
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }), t("creatorDraft")]
			}) : null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentPresetSection_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: AgentPresetSection_module_css_default.title,
						children: t("nav")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: AgentPresetSection_module_css_default.intro,
						children: t("sectionIntro")
					}),
					state.error === null ? null : (0, react_jsx_runtime.jsx)("p", {
						className: AgentPresetSection_module_css_default.error,
						role: "alert",
						children: state.error
					}),
					[["system", t("builtInGroup")], ["user", t("customGroup")]].map(([trust, heading]) => {
						const group = state.rows.filter((row) => row.trust === trust).map((row) => ({
							row,
							text: presetDisplayText(row, t)
						}));
						const tail = trust === "user" ? creatorButton : null;
						if (group.length === 0 && tail === null) return null;
						return (0, react_jsx_runtime.jsxs)("section", {
							className: AgentPresetSection_module_css_default.group,
							children: [
								(0, react_jsx_runtime.jsx)("h3", {
									className: AgentPresetSection_module_css_default.groupHead,
									children: heading
								}),
								group.length === 0 ? null : (0, react_jsx_runtime.jsx)("ul", {
									className: AgentPresetSection_module_css_default.cards,
									children: group.map(({ row, text }) => (0, react_jsx_runtime.jsxs)("li", {
										className: row.broken !== void 0 ? `${AgentPresetSection_module_css_default.card} ${AgentPresetSection_module_css_default.cardBroken}` : row.isDefault ? `${AgentPresetSection_module_css_default.card} ${AgentPresetSection_module_css_default.cardActive}` : AgentPresetSection_module_css_default.card,
										children: [
											(0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: AgentPresetSection_module_css_default.cardMain,
												"aria-pressed": row.isDefault,
												disabled: row.isDefault || row.broken !== void 0,
												"aria-label": `${row.broken !== void 0 ? t("brokenBadge") : row.isDefault ? t("inUse") : t("setDefault")}: ${text.name}`,
												title: row.broken ?? (row.isDefault ? t("inUse") : t("setDefault")),
												onClick: () => {
													props.makeDefault(row.id);
												},
												children: [
													(0, react_jsx_runtime.jsxs)("span", {
														className: AgentPresetSection_module_css_default.cardHead,
														children: [
															(0, react_jsx_runtime.jsx)("span", {
																className: AgentPresetSection_module_css_default.cardName,
																children: text.name
															}),
															row.broken !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
																className: AgentPresetSection_module_css_default.brokenBadge,
																children: t("brokenBadge")
															}) : null,
															(0, react_jsx_runtime.jsx)("span", {
																className: AgentPresetSection_module_css_default.badge,
																children: row.trust === "user" ? t("userTrust") : t("builtIn")
															}),
															row.isDefault ? (0, react_jsx_runtime.jsx)("span", {
																className: AgentPresetSection_module_css_default.inUse,
																children: t("inUse")
															}) : null
														]
													}),
													(0, react_jsx_runtime.jsx)(CardDescription, { text: text.description ?? t("noDescription") }),
													row.broken === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
														className: AgentPresetSection_module_css_default.cardBrokenReason,
														role: "alert",
														children: row.broken
													}),
													(0, react_jsx_runtime.jsx)("code", {
														className: AgentPresetSection_module_css_default.cardId,
														children: row.id
													})
												]
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: AgentPresetSection_module_css_default.cardFoot,
												children: [
													row.broken === void 0 ? (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: AgentPresetSection_module_css_default.iconButton,
														"data-tip": t("view"),
														"aria-label": `${t("view")}: ${text.name}`,
														onClick: () => {
															props.view(row.id);
														},
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, {})
													}) : null,
													row.trust !== "system" ? (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: AgentPresetSection_module_css_default.iconButton,
														"data-tip": state.hasDocument ? t("openLocation") : t("showLocation"),
														"aria-label": `${state.hasDocument ? t("openLocation") : t("showLocation")}: ${text.name}`,
														onClick: () => {
															props.openLocation(row.id);
														},
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutline16, {})
													}) : null,
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: AgentPresetSection_module_css_default.iconButton,
														disabled: !state.authorable || row.broken !== void 0,
														"data-tip": row.broken !== void 0 ? t("brokenNoCopy") : state.authorable ? t("duplicate") : t("duplicateUnavailable"),
														"aria-label": `${t("duplicate")}: ${text.name}`,
														onClick: () => {
															props.beginCopy(row.id);
														},
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {})
													}),
													row.trust === "user" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: AgentPresetSection_module_css_default.iconButton,
														"data-tip": t("edit"),
														"aria-label": `${t("edit")}: ${text.name}`,
														onClick: () => {
															props.beginEdit(row.id);
														},
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
													}), (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${AgentPresetSection_module_css_default.iconButton} ${AgentPresetSection_module_css_default.iconDanger}`,
														"data-tip": t("delete"),
														"aria-label": `${t("delete")}: ${text.name}`,
														onClick: () => {
															props.confirmDelete(row.id);
														},
														children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
													})] }) : null
												]
											}),
											state.revealedPaths[row.id] === void 0 ? null : (0, react_jsx_runtime.jsxs)("p", {
												className: AgentPresetSection_module_css_default.revealedPath,
												children: [(0, react_jsx_runtime.jsx)("span", {
													className: AgentPresetSection_module_css_default.revealedPathLabel,
													children: t("revealedPathLabel")
												}), (0, react_jsx_runtime.jsx)("code", { children: state.revealedPaths[row.id] })]
											})
										]
									}, row.id))
								}),
								tail
							]
						}, trust);
					}),
					(0, react_jsx_runtime.jsx)(CopyDialog, {
						state,
						t,
						actions: {
							cancelCopy: props.cancelCopy,
							confirmCopy: props.confirmCopy,
							setCopyId: props.setCopyId,
							setCopyName: props.setCopyName
						}
					}),
					(0, react_jsx_runtime.jsx)(EditDialog, {
						state,
						t,
						actions: {
							cancelEdit: props.cancelEdit,
							confirmEdit: props.confirmEdit,
							setEditField: props.setEditField
						}
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.view !== null,
						onClose: () => {
							props.closeView();
						},
						title: state.view === null ? "" : `${t("view")} · ${viewedTitle}`,
						closeLabel: t("close"),
						description: t("composition"),
						className: AgentPresetSection_module_css_default.dialog,
						contentClassName: AgentPresetSection_module_css_default.dialogScroll,
						footer: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							autoFocus: true,
							onClick: () => {
								props.closeView();
							},
							children: t("close")
						}),
						children: state.view === null ? null : (0, react_jsx_runtime.jsx)("pre", {
							className: AgentPresetSection_module_css_default.viewerCode,
							children: state.view.content
						})
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: state.pendingDelete !== null,
						onClose: () => {
							props.confirmDelete(null);
						},
						title: t("deleteTitle"),
						closeLabel: t("close"),
						description: t("deleteDescription"),
						className: AgentPresetSection_module_css_default.deleteDialog,
						footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							autoFocus: true,
							disabled: state.deleting,
							onClick: () => {
								props.confirmDelete(null);
							},
							children: t("cancel")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							className: AgentPresetSection_module_css_default.deleteConfirm,
							disabled: state.deleting,
							onClick: () => {
								props.remove();
							},
							children: state.deleting ? t("deleting") : t("deleteConfirm")
						})] })
					})
				]
			});
		}
		//#endregion
		//#region lib/types/ui/seat-store.js
		/**
		* Hero-chip controller: which preset the NEXT session gets.
		*
		* The new-session screen has no session, so a pick is staged rather than
		* applied. It reaches a session when one becomes current and is still blank —
		* whether the workspace connect created it or reused an existing blank one,
		* which is why staging cannot simply ride along on `sessions.create`.
		*
		* The stage is forgotten once applied: the next new session starts from the
		* deployment default again, matching the workspace picker beside it.
		*/
		const INITIAL = {
			options: [],
			current: "",
			error: null,
			busy: false,
			introduce: false
		};
		/** Stages the next session's preset and applies it when one appears. */
		var AgentPresetSeatController = class {
			api;
			currentSession;
			onApplied;
			/** Chip snapshot the renderer subscribes to. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			/**
			* The deployment default, so a consumed stage can fall back to it without
			* re-reading the roster.
			*/
			fallback = "";
			/** Set while a pick is waiting for a session; cleared once applied. */
			staged;
			constructor(api, currentSession, onApplied) {
				this.api = api;
				this.currentSession = currentSession;
				this.onApplied = onApplied;
			}
			set(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
			/**
			* Read the roster and open the chip on the deployment default.
			* @returns once the snapshot reflects the host.
			*/
			async load() {
				try {
					const response = await this.api.agentPresets.list({});
					if (!response.result.ok) {
						this.set({ error: response.result.error.message });
						return;
					}
					const { presets } = response.result.value;
					this.fallback = presets.find((preset) => preset.isDefault)?.id ?? presets[0]?.id ?? "";
					this.set({
						options: presetOptions(presets),
						current: this.staged ?? this.currentSession()?.agentPreset ?? this.fallback,
						error: null
					});
				} catch (error) {
					this.set({ error: messageOf(error) });
				}
			}
			/**
			* Stage one preset for the next session, applying it immediately when a
			* blank session is already current.
			* @param id - the preset to stage.
			* @returns once the stage settled, and the apply too when one happened.
			*/
			async select(id) {
				if (this.store.getSnapshot().busy) return;
				this.stage(id);
				await this.apply();
			}
			/**
			* Stage a pick WITHOUT the immediate apply, for a flow that starts the
			* receiving session after the pick (the settings section's creator entry).
			* `select()`'s immediate apply would meet the still-current running session
			* and drop the stage as unservable; staging alone leaves it for the
			* list-change applier, which fires when the started session becomes
			* current.
			* @param id - the preset to stage.
			* @param introduce - true when the stage came from another screen and the
			* chip should announce itself on the session it lands on.
			*/
			stage(id, introduce = false) {
				this.staged = id;
				this.set({
					current: id,
					error: null,
					introduce
				});
			}
			/** Acknowledge the introduction cue once the chip has played it. */
			introduced() {
				if (!this.store.getSnapshot().introduce) return;
				this.set({ introduce: false });
			}
			/**
			* Hand the staged choice to the current session, if there is one to take it.
			*
			* Called both by `select()` and by whoever observes the current session
			* changing, because the session may appear either before or after the pick.
			* @returns once the switch settled, or immediately when there is nothing to do.
			*/
			async apply() {
				const staged = this.staged;
				const session = this.currentSession();
				if (staged === void 0 || session === void 0) return;
				if (!session.blank || session.agentPreset === staged) {
					this.staged = void 0;
					return;
				}
				this.set({
					busy: true,
					error: null
				});
				try {
					const response = await this.api.agentPresets.select({
						sessionId: session.id,
						agentPreset: staged
					});
					this.staged = void 0;
					if (!response.result.ok) {
						this.set({
							busy: false,
							error: response.result.error.message,
							current: this.fallback
						});
						return;
					}
					this.set({
						busy: false,
						current: response.result.value.agentPreset
					});
					this.onApplied?.(session.id, response.result.value.agentPreset);
				} catch (error) {
					this.staged = void 0;
					this.set({
						busy: false,
						error: messageOf(error),
						current: this.fallback
					});
				}
			}
		};
		//#endregion
		//#region lib/types/ui/wire-client.js
		/**
		* Browser transport for the agent-preset editing wire channel.
		*
		* The withdrawn apiproxy `agentPreset.readEditable` / `agentPreset.update`
		* methods reached the browser as methods on the shared `IApiClient`; that
		* editing surface now lives on the connection's dedicated
		* `/agent-preset-edit` channel, so this module adapts
		* {@link ClientConnectionRpc.call} into the editing face the section
		* controller consumes. Each method mints the payload the Host handler
		* validates against its zod schema and returns the Host's `RpcResult` — the
		* same success/failure shape the withdrawn `IApiClient` methods returned.
		* @module dsh-harness-agent-preset-editing-bundle/ui/wire-client
		*/
		/** Absolute logical channel the Host serves agent-preset editing on. */
		const AGENT_PRESET_EDIT_CHANNEL = "/agent-preset-edit";
		/** Build the editing wire face over one connection RPC caller. */
		function createAgentPresetEditWire(rpc) {
			return {
				readEditable: (payload, signal) => call("readEditable", payload, signal),
				update: (payload, signal) => call("update", payload, signal)
			};
			/** Call one endpoint, returning the caller's declared result type. */
			function call(endpoint, payload, signal) {
				return rpc.call(AGENT_PRESET_EDIT_CHANNEL, endpoint, payload, signal);
			}
		}
		//#endregion
		//#region lib/types/ui/index.js
		/**
		* Agent-preset surface plugin, browser half — four surfaces over one roster:
		* a General-settings row for the default preset, a chip on the new-session
		* screen for the session about to start, a read-only label in the session
		* header, and a settings section that manages the roster (copy, delete,
		* default, structured edit of a locally authored preset's editable fields,
		* and the way into a preset's own files).
		*
		* A running session keeps the composition it began with (the host refuses to
		* adopt an existing session under a different preset). That is what splits
		* the choice from the display: the General row and the hero chip are both
		* before-the-fact, while the header only reports what a session already runs.
		*
		* This package is the enhanced replacement for the official
		* `@deepseek-ai/dsh-client-ui-agent-preset` settings section: it carries the
		* structured editing surface whose read/write ride the dedicated
		* `/agent-preset-edit` wire channel, keeping the official package (and the
		* shared `/api` agentPreset domain) zero-invasive.
		*/
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* Mount the General-settings row.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const { api, rpc } = ctx.get("connection");
			const controller = new AgentPresetSettingsController(api);
			const rosterReaders = /* @__PURE__ */ new Set();
			const section = new AgentPresetSectionController(api, createAgentPresetEditWire(rpc), () => {
				controller.load();
				for (const read of rosterReaders) read();
			});
			ctx.effect(() => ctx.locale.register("settings.agentPreset", {
				zh,
				en
			}), "ui-agent-preset-editing: settings row dictionaries");
			const injected = () => ({
				hooks: { agentPreset: controller.store },
				load: () => controller.load(),
				select: (id) => controller.select(id)
			});
			ctx.effect(() => {
				const refresh = () => {
					controller.load();
					if (section.store.getSnapshot().status !== "idle") section.load();
				};
				const disposers = [ctx.remote.$on("settings/document-updated", (ns) => {
					if (ns !== "agent-presets") return;
					refresh();
				}), ctx.on("connection/reset", () => {
					refresh();
				})];
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, "ui-agent-preset-editing: settings refresh");
			let creatorDraft;
			ctx.inject([
				"slots",
				"conversation",
				"sessions",
				"workspaces"
			], (scope) => {
				const api = scope.get("connection").api;
				const seat = new AgentPresetSeatController(api, () => {
					const state = scope.sessions.list.getSnapshot();
					const summary = state.current === void 0 ? void 0 : state.byId[state.current];
					return summary === void 0 ? void 0 : {
						id: summary.id,
						blank: summary.blank,
						...summary.agentPreset === void 0 ? {} : { agentPreset: summary.agentPreset }
					};
				}, (sessionId, agentPreset) => {
					scope.sessions.noteAgentPreset(sessionId, agentPreset);
				});
				const seatInjected = () => ({
					hooks: { agentPresetSeat: seat.store },
					load: () => seat.load(),
					select: (id) => seat.select(id),
					introduced: () => {
						seat.introduced();
					}
				});
				const labelInjected = () => ({
					hooks: { agentPresets: controller.store },
					load: () => controller.load()
				});
				scope.effect(() => {
					const stop = scope.sessions.list.subscribe(() => {
						seat.apply();
					});
					const settingsMoved = scope.remote.$on("settings/document-updated", (ns) => {
						if (ns !== "agent-presets") return;
						seat.load();
					});
					const presetSelected = scope.remote.$on("agent-preset/selected", (sessionId, agentPreset) => {
						scope.sessions.noteAgentPreset(sessionId, agentPreset);
					});
					const readRoster = () => {
						seat.load();
					};
					rosterReaders.add(readRoster);
					creatorDraft = () => {
						seat.stage("cordis", true);
						scope.workspaces.startSession();
					};
					const chip = scope.slots.register({
						name: "conversation.hero.agentPreset",
						locale: "settings.agentPreset",
						inject: seatInjected
					}, AgentPresetSeat);
					const label = scope.slots.register({
						name: "conversation.session.header.actions",
						id: "agent-preset",
						order: -10,
						locale: "settings.agentPreset",
						inject: labelInjected
					}, AgentPresetLabel);
					return () => {
						stop();
						settingsMoved();
						presetSelected();
						rosterReaders.delete(readRoster);
						creatorDraft = void 0;
						chip();
						label();
					};
				}, "ui-agent-preset-editing: new-session chip and header label");
			});
			const sectionInjected = () => ({
				hooks: { agentPresetSection: section.store },
				load: () => section.load(),
				view: (id) => section.view(id),
				closeView: () => {
					section.closeView();
				},
				beginCopy: (from) => {
					section.beginCopy(from);
				},
				cancelCopy: () => {
					section.cancelCopy();
				},
				setCopyId: (id) => {
					section.setCopyId(id);
				},
				setCopyName: (name) => {
					section.setCopyName(name);
				},
				confirmCopy: () => section.confirmCopy(),
				beginEdit: (id) => section.beginEdit(id),
				cancelEdit: () => {
					section.cancelEdit();
				},
				setEditField: (scope, field, value) => {
					section.setEditField(scope, field, value);
				},
				confirmEdit: () => section.confirmEdit(),
				openLocation: (id) => section.openLocation(id),
				...creatorDraft === void 0 ? {} : { startCreatorDraft: creatorDraft },
				confirmDelete: (id) => {
					section.confirmDelete(id);
				},
				remove: () => section.remove(),
				makeDefault: (id) => section.makeDefault(id)
			});
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "agent-preset",
				order: -25,
				locale: "settings.agentPreset",
				inject: injected
			}, AgentPresetRow));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "agent-presets",
				order: 20,
				label: () => ctx.locale.bind("settings.agentPreset")("nav"),
				locale: "settings.agentPreset",
				inject: sectionInjected
			}, AgentPresetSection));
		}
		//#endregion
		exports.AGENT_PRESET_EDIT_CHANNEL = AGENT_PRESET_EDIT_CHANNEL;
		exports.AGENT_PRESET_SETTINGS_NS = AGENT_PRESET_SETTINGS_NS;
		exports.apply = apply;
		exports.createAgentPresetEditWire = createAgentPresetEditWire;
		exports.draftBlocker = draftBlocker;
		exports.inject = inject;
		exports.writeDefaultPreset = writeDefaultPreset;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map