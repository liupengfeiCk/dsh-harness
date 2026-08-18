# dsh-harness-hot-bundle

Harness 自有的热**挂载 / 卸载 / 升级**能力，作为一个自包含的 profile bundle 交付给运行中的 DSH 宿主。

`dsh plugin add/remove` 是纯文件操作——活进程只对 `cordis.patch.yml` 的变动做事务重组装。本包给运行中的宿主提供一种「无需重启」就把已安装插件的 loader 行拉进当前组合的方式，以及本包存在的核心理由：**对同名同路径插件做热升级**（先驱逐 Node 模块缓存再重新挂载）。

- **纯 host 包。** 没有浏览器 client 面。包的实质是 `cordis.patch.yml`（由 `dsh.bundle.patch` 声明）加上 host 侧的 `harnessHot` 服务与 loopback 固定的 `/harness-hot` RPC 通道。
- **`ctx.harnessHot`** —— 一个 `Service` 子类，暴露 `mount`、`unmount`、`upgrade`、`list`。
- **`/harness-hot`** —— loopback 固定（`authority: 'loopback'`）的连接 RPC 通道，承载同样的四个 endpoint。只有本机调用方可达，因为挂载/升级插件会改写运行中组合的内容。

## 安装

像任何 profile bundle 一样安装（git 协议，因为本包在自己的 git 仓库里随附 `lib` 产物）：

```
dsh plugin --profile <名> add "git+file:///…/harness/bundle/hot"
```

它的 `cordis.patch.yml` 插入一个 host 行（`harness-hot`），挂载 `harnessHot` 服务并注册 `/harness-hot` 通道。

## 端点

四个端点都走 `/harness-hot`，`authority: 'loopback'`，每个请求/响应都通过 `src/wire/schema.ts` 的 zod 校验。

### `mount { package, profileDir? }`

读取 `<profileDir>/node_modules/<package>/cordis.patch.yml`，用 include 插件自己的 `entryListSchema` 解析（因此接受的方言与启动加载完全一致），把可热挂的行写进 `<profileDir>/.harness-hot/hot-<n>.yml`，并挂载一个激活这些行的 `Include` 子树。

- `insert` 行（`id`/`name`/`config`）的 `id` 统一加 `harness-` 前缀，避免与 bundle 层的 id 撞车（重复 id 是硬启动失败）。
- `disabled` 覆盖行（`id` + 布尔 `disabled`）**不加**前缀——它覆盖的是已存在的行。
- `insert` 行的 `config` 必须是静态键值对象。任何位置的 `!!js` 表达式（`config` 或 `disabled` 中）、嵌套 group、或任何结构性键（`inject`/`isolate`/`intercept`）都无法在热挂时重新求值——挂载会拒绝并提示 **「重启后生效」**。
- 激活与 10 秒上限赛跑（`DSH_HARNESS_HOT_MOUNT_TIMEOUT_MS`）。卡死的子树会被尽力 dispose，错误照常抛出。

### `unmount { package }`

dispose 已挂载的子树，立即把该包的行从运行中组合移除。

### `upgrade { package, profileDir? }`

本包存在的核心端点。它：

1. dispose 该包当前的热挂 fiber（若有）；
2. 驱逐所有 URL 位于该包自身 `<profileDir>/node_modules/<package>/` 目录下的 Node `loadCache` 记录——**只清该包自己的模块，绝不动它的依赖**（pnpm 的 symlink 布局先 realpath 再匹配；Node v24 的 typed `loadCache` 用 `Map.prototype.delete` 确保 key 被彻底移除）；
3. 重新走 `mount` 流程。

这正是官方 HMR（`vendor/hmr/src/index.ts`）所用的「dispose → 清缓存 → 重新 import」手法，官方把它局限在 user code 且 web profile 只挂 watch-only。本包把它作为一等端点暴露出来。

未暴露模块加载器内部（无 `--expose-internals`，`ctx.loader.internal` 为 undefined）的部署会拒绝升级并提示 **「重启生效」**。

### `list`

返回当前热挂清单（包名、行 id、挂载时间）。

## fiber 逃逸引用边界（务必阅读）

`upgrade` 的 dispose 只回收**注册结构**——loader 条目、它的 fiber、以及被 dispose 子树注册的服务。它无法回收会话已经持有的服务对象引用：如果某个会话持有旧模块实例上的 `ctx.someService` 引用，该引用会一直指向旧代码，直到会话丢弃它。

这与官方 HMR 携带的风险完全一致，本包如实写明而非假装解决。对本包负责的热升级路径而言，实际契约是：

- **新请求**访问已挂载包的表面时，走的是重新 import 的新模块。
- 长会话中**已持有的服务引用**可能观察到过期行为，直到该会话重建。

如果需要保证每个活引用都被重建，请重启宿主。

## 已知限制：失败的 ESM `exports` 子路径解析被进程级缓存

`upgrade` 的缓存驱逐能触达 loader 的 `loadCache` 和 CJS 的
`_pathCache`/`require.cache`，但**触达不到** Node 进程级的 ESM 包解析缓存。

Node 把包的 `package.json` 解析结果（包括 `exports` 映射）缓存在一个 C++
binding 层（`modulesBinding.readPackageJSON`），以 package.json 的**路径**为键。
该缓存不校验文件 mtime，也没有任何 JS 侧句柄或公开 API（已在 Node v24.10.0
上实证）：

- 某个子路径一旦 `exports` 解析失败
  （`ERR_PACKAGE_PATH_NOT_EXPORTED`，例如在 `exports` 尚未加入 `"./team"`
  时执行 `import './team'`），在进程存续期内会一直失败，即使之后：
  - 磁盘上的 `exports` 已修好；
  - 该包的 `loadCache` 记录已驱逐；
  - `Module._pathCache` 与 `require.cache` 已全部清空；
  - 再次 import 同一个 bare-specifier 子路径。
- 缓存值与 package.json 的**路径**绑定：换一个新路径的包立即解析成功，而
  同一路径无论文件怎么改都一直返回旧的（过期的）结果。

对热升级的影响：如果热升级后的包开始依赖一个本进程之前解析失败的、新暴露的
子路径，活进程无法加载到它——**唯一恢复方式是重启宿主**。这与上面的
fiber 逃逸边界不同：那个是会话持有的服务引用问题；这个是 Node 自身的解析
缓存，`upgrade` 的任何一步都驱逐不掉。

## 启动清理

`harnessHot` 服务启动时会清空 `<profileDir>/.harness-hot/` 下的 `hot-*.yml`。热挂输入纯属进程生命周期之物——持久激活仍由 `dsh.profile.bundles` 负责（CLI 安装时协调），因此下次启动会走正常 bundle 层加载插件。崩溃永远不会留下会与 bundle 层在下一次启动时冲突的热文件。

## 开发

- 测试：在 `harness/` 下执行 `npx vitest run bundle/hot/tests`。
- 类型检查：在 `harness/` 下执行 `pnpm run typecheck`。
- 构建：在 `harness/` 下执行 `pnpm run build`。

测试覆盖：patch 解析（纯 insert、静态 config、disabled 覆盖、`!!js` 拒绝）、启动清理、以及 `loadCache` 驱逐逻辑（针对 mock 的 loadCache，含 pnpm symlink 与 Node v24 typed 形态）。
