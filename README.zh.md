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

#### 结构变更预检

在 dispose 任何东西之前，`upgrade` 会把磁盘上**新的** `package.json` 与本进程已经加载的内容做对比；当本次升级会改变包的**结构**——而活进程因为 Node C++ 层 `readPackageJSON` 缓存（冻结 `exports` 映射与模块解析结果）无法从 JS 触达、从而永远无法生效——时，直接拒绝并提示 **「重启生效」**：

- **嵌套 `node_modules` 布局变化**——本进程已加载的某个模块（其 URL 位于包自身的 `node_modules/<package>/` 下）在磁盘上已不存在；
- **`exports` 映射变化**——本进程已加载的某个模块对应的相对子路径，已不再被磁盘新的 `exports` 暴露（仅精确映射；`./*` 通配因无法精确展开而保守视为覆盖一切）。

拒绝发生在**任何驱逐/重挂之前**，因此运行中的热副本与静态层保持原样。结构变更只能靠重启宿主生效。

### `list`

返回当前热挂载（包名、行 id、挂载时间）。

## 重组装防线（务必阅读）

热副本运行期间，编辑用户层 `cordis.patch.yml` 会让宿主对整个 **root-include 树做重组装**。该重组装会重新应用 patch 并重建静态层，否则热副本收敛时 disable 掉的静态行会被复活、与热副本撞车（真实事故：热副本的 disable 失去目标、静态副本复活、UI 行状态混乱）。

防线监听 loader 的 `internal/update` waterfall——最早可靠的信号，在 include 处理器真正重组装**之前**触发——对 root include 自己的 fiber 先卸载所有热副本（对称恢复其静态行），让重组装在干净的静态层上进行。

**没有公开的「重组装开始」事件**：loader 的 `'loader/config-update'` 只在重组装**之后**触发（它由 include 的 `write()` 在新树提交后发出），来不及阻止撞车。因此防线依赖 cordis 的 `internal/update` 钩子——loader 正是用它驱动 entry-group 更新的。如果未来 cordis/loader 改名或移除该钩子，防线会静默解除（它从不否决重组装）。

**操作提示：** 因为钩子变化时防线会静默解除，编辑用户层 patch 期间请把热副本视为临时的——最好先卸载它们；若怀疑热副本仍在，用 `list` 查询。

## fiber 逃逸引用边界（务必阅读）

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

### bump 版本号能绕开这个缓存吗？在 `nodeLinker: hoisted` 下不能

一个明显的绕法：升级时 bump 版本号，让 pnpm 把包装到**新的物理路径**，从而
立即解析成功（缓存以 package.json 路径为键）。已实证（Node v24.10.0、pnpm
v10.27.0）：位于新路径的包能正常 import 新暴露的子路径。

**但这只在使用默认 isolated 布局（每个版本独立目录）时成立。** 配置了
`nodeLinker: hoisted` 的 profile（本项目 web profile 即如此）会把每个
git/file 依赖平铺到 `node_modules/<name>/`——**声明版本号无论怎么变，物理路径
都相同**，且 `node_modules/.pnpm/` 下没有任何按版本划分的 store 目录。因此
bump 版本号**不会改变物理路径**，进程级 `exports` 缓存依旧命中，新加的子路径
仍然失败，直到重启宿主。

已在 harness web profile 上实证：
- 探针从 `1.0.0` bump 到 `1.1.0` 并重新 add 后，`node_modules/
  dsh-hotprobe-bundle` 仍是同一个物理目录，`.pnpm/` 下依旧只有 `lock.yaml`——
  没有生成任何按版本划分的目录。
- `upgrade` 能正确替换**既有入口**的代码（`/hotprobe/version` 由 `v4` 变 `v5`），
  因为 `clearPackageLoadCache` 会驱逐模块 `loadCache`；这**不依赖版本号**。
- 但同一路径下**新增的** `exports` 子路径（`./version`）在磁盘 `exports` 修好、
  所有 JS 侧缓存清空后，仍是 `ERR_MODULE_NOT_FOUND`——正是上面的进程级缓存。

所以版本号 bump 只在 pnpm **isolated**（默认，`nodeLinker` 未设置或为
`isolated`）布局下有效：store 目录由依赖 specifier 派生，新 commit 会落地为
新的物理路径。而在本项目的 `hoisted` profile 下，版本号不是杠杆：为热升级一个
新增了 `exports` 子路径的包，仍然需要重启宿主。

## 启动清理

`harnessHot` 服务启动时会清空 `<profileDir>/.harness-hot/` 下的 `hot-*.yml`。热挂输入纯属进程生命周期之物——持久激活仍由 `dsh.profile.bundles` 负责（CLI 安装时协调），因此下次启动会走正常 bundle 层加载插件。崩溃永远不会留下会与 bundle 层在下一次启动时冲突的热文件。

## 开发

- 测试：在 `harness/` 下执行 `npx vitest run bundle/hot/tests`。
- 类型检查：在 `harness/` 下执行 `pnpm run typecheck`。
- 构建：在 `harness/` 下执行 `pnpm run build`。

测试覆盖：patch 解析（纯 insert、静态 config、disabled 覆盖、`!!js` 拒绝）、启动清理、以及 `loadCache` 驱逐逻辑（针对 mock 的 loadCache，含 pnpm symlink 与 Node v24 typed 形态）。
