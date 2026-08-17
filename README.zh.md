# `dsh-harness-agent-preset-editing-bundle`

[English](README.md) | 中文

以可安装 profile 组合包形式交付的 Harness 自有主预设可视化编辑能力：[`cordis.patch.yml`](cordis.patch.yml) 禁用 `dsh-web-app` 自带的官方 `ui-agent-preset` 设置行，并挂载增强表面——官方主预设表面之外，再对本地撰写的 preset 的可编辑字段提供结构化编辑器——连同专用的 `/agent-preset-edit` 编辑 wire 通道。用 `dsh plugin --profile <name> add dsh-harness-agent-preset-editing-bundle` 装进 profile；移除后恢复官方行。该包是纯 patch 列表载体，没有运行时 API；profile 组合器通过 manifest（元数据清单）的 `dsh.bundle.patch` 字段解析 patch，绝不通过代码。

patch 按 id 禁用 1 个官方行——`ui-agent-preset`（General 设置里的主预设行）——并插入 2 个行。由于 patch 无法改写行的 `name`（Loader 会跳过 patch 中 name 与目标不匹配的行），且 Loader 拒绝重复 id，替换行使用不同的 id（`ui-agent-preset-editing`、`agent-preset-edit`），同时绑定相同的设置位。被禁用的官方行让官方包保持安装，并让后续 profile 层可以自由重新启用它。

plane 拆分遵循 `dsh-web-app`：编辑 wire（`agent-preset-edit` → `dsh-harness-agent-preset-editing-bundle/edit/wire`）是 HOST 行，紧挨 `agentPresets` 服务（由 `dsh-web-app` 挂载）并通过服务的公共接口读取它，保持独立以便官方服务包零侵入；增强表面（`ui-agent-preset-editing` → `dsh-harness-agent-preset-editing-bundle`）是浏览器设置行，通过 wire 通道通信。这两个行都依赖 web 层（wire 的 RPC 通道需要 `dsh-client-connection`，UI 行需要客户端设置面），因此本组合包面向 web profile。


## 安装 / 卸载

**安装**（官方流程）：`dsh plugin --profile <name> add dsh-harness-agent-preset-editing-bundle`——pnpm 自动从 registry 解析本包及其全部插件依赖；profile 组合器在下一次启动时装载补丁层（实例正在运行则重启一次）。无需手改任何文件。

**卸载**（运行实例零停机）：

1. 先热摘行——把以下内容追加进 profile 用户层补丁（`<profile>/cordis.patch.yml`）并存盘；运行中的服务约 1 秒内重组装（bundle 层在用户层之下，覆盖生效）：

```yaml
- id: ui-agent-preset-editing
  disabled: true
- id: agent-preset-edit
  disabled: true
- id: ui-agent-preset
  disabled: false
```

2. 再清文件层：`dsh plugin --profile <name> remove dsh-harness-agent-preset-editing-bundle`——下一次启动官方行完全恢复。切勿先卸包再摘行：对已卸插件的悬空引用会让启动直接失败。

**不卸载只开关**：保持包装着，只翻行——上面这份禁用清单即 OFF；从用户层删掉它即 ON。两个方向都是热生效。

## 模型体验

通过插入的行间接产生影响：增强设置行与编辑 wire 各司其职、自行负责面向模型的行为，编辑后 preset 所挂载的插件对任何变更的模型面向影响负责。

#### KV Cache 影响

无直接影响；每条插入行的影响由其所属的包负责。

## 已知限制与暂缓事项

- **依赖 web 层**：本组合包挂载的设置行与 wire 行需要 `dsh-client-connection` 及客户端设置面，因此面向 web profile；装进 headless 或自定义 profile 时会因缺少 web 行而 fail-loud。
- **替换行 id 不同**：Loader 拒绝重复 id，且 patch 无法改写 `name`，因此替换行使用 `ui-agent-preset-editing`/`agent-preset-edit` 而非官方 id。后续针对官方 `ui-agent-preset` id 的 patch 层配置的是被禁用的官方行，而非增强替换行。
- **解析已经官方链路验证**：本地 registry 彩排（pack → 发布 → `dsh plugin add`）中全部传递依赖自动解析、插入行全部 enabled，因为以 profile 为锚的名称解析先查 profile 自己的 `node_modules`。仅当解析锚点机制变动时才需要重新关注。
