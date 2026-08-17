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

## 模型体验

通过插入的行间接产生影响：Harness 服务、spawn/fork provider、注册表与设置行各司其职、自行负责面向模型的行为，委派工具来自 preset 层。

#### KV Cache 影响

无直接影响；每条插入行的影响由其所属的包负责。

## 已知限制与暂缓事项

- **依赖 web 层**：本组合包挂载的注册表与设置行需要 `dsh-client-connection`/`dsh-host-apiproxy` 及客户端设置面，因此面向 web profile；装进 headless 或自定义 profile 时会因缺少 web 行而 fail-loud。
- **替换行 id 不同**：Loader 拒绝重复 id，且 patch 无法改写 `name`，因此替换行使用 `subagent-harness`/`subagent-spawn-harness`/`subagent-fork-harness` 而非官方 id。后续针对官方 `subagent` id 的 patch 层配置的是被禁用的官方行，而非 Harness 替换行。
