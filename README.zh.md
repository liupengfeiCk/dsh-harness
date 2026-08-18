# `dsh-harness-subagent-bundle`

[English](README.md) | 中文

以可安装 profile 组合包形式交付的 Harness 自有子代理能力：[`cordis.patch.yml`](cordis.patch.yml) 禁用 `dsh-base` 自带的官方 in-process 子代理行，并挂载 Harness 替换 provider、用户自定义子代理注册表及设置页行。用 `dsh plugin --profile <name> add dsh-harness-subagent-bundle` 装进 profile；移除后恢复官方行。该包是纯 patch 列表载体，没有运行时 API；profile 组合器通过 manifest（元数据清单）的 `dsh.bundle.patch` 字段解析 patch，绝不通过代码。

patch 按 id 禁用 5 个官方行——`subagent`（`ctx.subagents` 能力缝）、`subagent-spawn-in-process`、`subagent-fork-in-process`、`tool-subagent`、`tool-subagent-fork`——并插入 Harness 替换行。由于 patch 无法改写行的 `name`（Loader 会跳过 patch 中 name 与目标不匹配的行），且 Loader 拒绝重复 id，替换行使用不同的 id（`subagent-harness`、`subagent-spawn-harness`、`subagent-fork-harness`），同时绑定相同的 `ctx.subagents` 服务与相同的 `spawn`/`fork` providerName 契约，因此 preset 层的委派工具保持不变、继续工作。

plane 拆分遵循 `dsh-web-app`：subagent 注册表及其 backend 保留在 host plane。Harness 委派工具以独立工具名挂载在 host plane（`tool-delegate` → `delegate`、`tool-delegate-fork` → `delegate_fork`，均来自 `dsh-harness-subagent-bundle/in-process/tool`），与出厂 preset 从 `@deepseek-ai/dsh-tool-subagent` 挂载的官方 `subagent` 工具共存——不触碰任何 preset 文件。

本组合包挂载用户自定义 subagent 注册表（`subagent-presets` → `dsh-harness-subagent-bundle/preset`）与 General 设置页行（`ui-subagent-preset` → `dsh-harness-subagent-bundle`）。这些行依赖 web 层（注册表的浏览器 Remote 端点需要 `dsh-client-connection`/`dsh-host-apiproxy`，UI 行需要客户端设置面），因此本组合包面向 web profile。


## 安装 / 卸载

**安装**（官方流程）：`dsh plugin --profile <name> add dsh-harness-subagent-bundle`——pnpm 自动从 registry 解析本包及其全部插件依赖；profile 组合器在下一次启动时装载补丁层（实例正在运行则重启一次）。无需手改任何文件。

**卸载**（运行实例零停机）：

1. 先热摘行——把以下内容追加进 profile 用户层补丁（`<profile>/cordis.patch.yml`）并存盘；运行中的服务约 1 秒内重组装（bundle 层在用户层之下，覆盖生效）：

```yaml
- id: subagent-harness
  disabled: true
- id: subagent-spawn-harness
  disabled: true
- id: subagent-fork-harness
  disabled: true
- id: subagent-presets
  disabled: true
- id: tool-delegate
  disabled: true
- id: tool-delegate-fork
  disabled: true
- id: ui-subagent-preset
  disabled: true
- id: subagent
  disabled: false
- id: subagent-spawn-in-process
  disabled: false
- id: subagent-fork-in-process
  disabled: false
```

2. 再清文件层：`dsh plugin --profile <name> remove dsh-harness-subagent-bundle`——下一次启动官方行完全恢复。切勿先卸包再摘行：对已卸插件的悬空引用会让启动直接失败。

**不卸载只开关**：保持包装着，只翻行——上面这份禁用清单即 OFF；从用户层删掉它即 ON。两个方向都是热生效。

## Team（编制表）

**Team** 是用户提前建好的角色编制表：一组角色各绑定一个子代理（一个用户自定义子代理 id），并携带自己的提示词。子代理管能力边界（硬约束，来自子代理的插件树），提示词管行为方式（软约束，角色的独立提示词作为 persona 注入）。Team 存储在独立双根下，完全与 agent-preset roster 和 subagent roster 分开：`config/teams/`（system 只读）+ `$DSH_HOME/.dsh/teams`（user 可写）。

一个 team 是 `<root>/<teamId>/team.yml`，格式如下：

```yaml
metadata:
  name: 编辑团队
  description: 处理文案的团队
  enabled: true
roles:
  - id: copywriter
    description: 负责文案写作
    prompt: 你是一名资深文案，注重说服力与清晰。
    subagent: writer      # 子代理 id（能力边界）
    memory: persistent    # persistent | one-shot
  - id: factchecker
    description: 负责事实核查
    prompt: 你是一名严谨的事实核查员。
    subagent: reviewer
    memory: one-shot
```

**两种记忆模式**：
- `one-shot`（一次性）：每次调用都起一个全新子代理，干完即散。
- `persistent`（长期）：该角色持续存在，走 `startContinuable` 保持可续对话的 durable 子代理；descriptor 持久化 `{ team, role }`，冷恢复时**重新解析 team 最新定义**（引用语义——team 文件改过就用新版）重挂子代理树与提示词 persona。

**组合约定**：team 形态下主代理只看到该队的角色目录（`team_delegate` 工具的 `role` 参数），**不直接感知裸子代理名单**。这是由会话**模式**（见下）保证的——`team` 会话的 scope 会限制 `delegate`/`delegate_fork` 工具、只呈现该队角色目录；`standard` 会话则隐藏 `team_delegate`。`team-delegate` 工具行在 `cordis.patch.yml` 里默认 `disabled: true`，在 preset composition 里启用。

## 模式（会话模式）

**模式**是一个与会话完全正交、独立于 agent preset 的维度。会话要么跑：
- `standard`（默认）：主代理通过 `delegate`/`delegate_fork` 委派，看到裸子代理目录。
- `team`（带 `teamId`）：主代理只用 `team_delegate`，看到该队角色目录——`delegate`/`delegate_fork` 被隐藏，调用会被拒绝。

选择在**会话开跑前**可用，**开跑后锁定**（与 agent preset 的 blank-window 契约相同）。它记录为一条持久、log-only 的 `subagent-team/mode` 会话事件（绝不进入模型 transcript），通过 `/team-preset` 通道的 `modeSelect` / `modeRead` 端点选择，并向宿主插件广播 `subagent-team/mode-selected`。工具可见性由 fold 推导：`team` 会话的 scope 限制标准工具、`standard` 会话限制 `team_delegate`；同时每个委派工具执行时重新核对会话 fold 作为权威闸门。

## 模型体验

通过插入的行间接产生影响：Harness 服务、spawn/fork provider、注册表与设置行各司其职、自行负责面向模型的行为，委派工具来自 preset 层。

#### KV Cache 影响

无直接影响；每条插入行的影响由其所属的包负责。

## 已知限制与暂缓事项

- **依赖 web 层**：本组合包挂载的注册表与设置行需要 `dsh-client-connection`/`dsh-host-apiproxy` 及客户端设置面，因此面向 web profile；装进 headless 或自定义 profile 时会因缺少 web 行而 fail-loud。
- **替换行 id 不同**：Loader 拒绝重复 id，且 patch 无法改写 `name`，因此替换行使用 `subagent-harness`/`subagent-spawn-harness`/`subagent-fork-harness` 而非官方 id。后续针对官方 `subagent` id 的 patch 层配置的是被禁用的官方行，而非 Harness 替换行。
- **提示词 persona 与子代理 persona 的同 scope 冲突**：`dsh-system-prompt` 在同一 scope 内注册同名 section 会抛错（不同 scope 才 shadow）。team 工具把角色提示词注入为 `deployment:persona`（order 0），子代理的 composition 若也带 persona 段，会与角色提示词在同 child scope 冲突抛错。因此 team 的子代理应只管能力边界、不带自己的 persona；若子代理确需自带 persona，请改用独立段名（如 `team:role`，order 1）注入角色提示词（一期未内置，后续按需扩展）。
- **一期无 team UI**：team 资产是存盘固定资产（`team.yml` 手写），UI 管理界面暂缓。
