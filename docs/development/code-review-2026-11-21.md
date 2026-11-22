# AnnotaMD 代码评审报告

> 状态：已整改，最终验证见 [逐项复核记录](code-review-2026-11-21-resolution.md)。下文保留原评审基线与历史证据。
> 形成日期：2026-11-21
> 适用基线：`main` @ `74db7b5`，AnnotaMD 2.20.0，Electron 43.1.1
> 审阅范围：`packages/desktop`（约 9.2 万行）、`packages/muya`（约 10.5 万行）
> 审阅方式：只读源码审计 + 实跑 `vue-tsc`、`tsc`、`eslint`、`vitest`

## 1. 结论

当前分支存在 **2 个会让 CI/构建真实失败** 的问题，以及 **2 个需要安全决策** 的设计问题。
其中 muya 的编译错误会让 `muya-build` 流水线在下次改动 `packages/muya/src/**` 时直接变红；
桌面端的 `typecheck` 门禁已因测试目录接入方式而长期失效（508 个错误），
意味着该门禁实际已无法保护 `src/` 的质量。

按严重度分级如下：

| 级别 | 数量 | 摘要 |
| --- | ---: | --- |
| P0 | 3 | muya 编译错误、桌面 typecheck 失效、muya lint 失效 |
| P1 | 3 | `webSecurity: false`、IPC 无来源与路径校验、安装脚本改写 lockfile |
| P2 | 1 | `CLAUDE.md` 四处与实现漂移 |
| P3 | 5 | 超大文件、依赖策略、未提交规范、注释遗留、调试日志 |

`src/` 目录本身的 TypeScript 类型检查是干净的（见 3.2），问题集中在门禁配置与构建链路。

## 2. 审阅方法与环境说明

已实际执行并记录结果：

| 命令 | 结果 |
| --- | --- |
| `vue-tsc --noEmit -p tsconfig.annotamd.json` | **通过**，exit 0 |
| `vue-tsc --noEmit -p tsconfig.json` | **失败**，508 个错误，全部位于 `test/**` |
| `tsc --noEmit`（packages/muya，即 `lint:types`） | **失败**，含生产代码硬错误 |
| `eslint src test`（packages/muya） | **失败**，9935 problems（9877 errors，78/509 文件） |

未能执行的部分，不影响本报告的 P0 结论，但**不作为测试质量结论**：

- `vitest`（desktop 与 muya 套件）无法启动，报
  `ERR_DLOPEN_FAILED`：`@rollup/rollup-darwin-arm64` 原生二进制
  code signature Team ID 不匹配。这是本机 `node_modules` 安装产物问题，非仓库缺陷。
- 根 `node_modules` 仅有 15 个条目、`@eslint/js` 未落盘，导致根 `pnpm lint` 直接崩溃。
  该包是 `eslint@9.39.4` 的传递依赖（见 `node_modules/eslint/package.json`
  的 `dependencies`），干净安装下可用，故**不计入仓库缺陷**。

结论：单元测试与 e2e 的实际覆盖与稳定性，需在一次干净 `pnpm install` 后重新评估。

## 3. P0：会让 CI 或构建真实失败

### 3.1 muya 生产代码存在硬编译错误

`packages/muya/src/ui/paragraphFrontButton/index.ts:615` 引用了作用域内不存在的
`container`：

```ts
// 第 615 行
getBoundingClientRect: () => container.getBoundingClientRect(),
```

`tsc` 报 `TS2304: Cannot find name 'container'`。同文件第 365 行是正确写法，
其前置条件是在方法内先做了解构：

```ts
const { _container: container } = this;
```

第 615 行所在的方法缺少这层解构，属于复制粘贴时的遗漏。

影响链：

1. `packages/muya/package.json` 的 `build` 脚本是 `tsc && vite build`，`tsc` 不通过则构建中止；
2. `.github/workflows/muya-build.yml` 在 `packages/muya/src/**` 变更时触发；
3. 因此下一次触碰 muya 源码的 PR 必然构建失败。

修复：在第 615 行所在方法内补充 `const { _container: container } = this`，或改用
`this._container.getBoundingClientRect()`。

### 3.2 桌面端 typecheck 门禁失效（508 个错误）

`.github/workflows/lint.yml` 的 `Run TypeScript typecheck` 步骤执行 `pnpm typecheck`，
即 `packages/desktop/package.json` 的 `vue-tsc --noEmit -p tsconfig.json`，实测 508 个错误。

根因由三部分叠加，且仓库内已有正确配置：

- `packages/desktop/tsconfig.json` 的 `include` 含 `test/**/*.ts`，该目录下有 213 个 spec；
- 这些 spec 使用 vitest 的 `globals: true` 写法，`describe`/`it`/`expect` 不显式导入，
  但该 tsconfig 的 `types` 只有 `["node", "vite/client"]`，
  于是产生 252 个 `TS7006`、103 个 `TS7031`、10 个 `TS2593`；
- 74 个 `TS2307` 源于模块引用不统一：90 个文件写 `from '@playwright/test'`，
  74 个文件写 `from 'playwright'`，而 `devDependencies` 中只有 `@playwright/test`。

关键证据：仓库已有 `packages/desktop/package.json` 的 `typecheck:annotamd`
指向 `tsconfig.annotamd.json`（其 `exclude` 含 `test`）。实测该配置 **exit 0 通过**。

因此 `src/` 本身是干净的，失效的是「把测试目录纳入 CI 类型检查、却没有配置测试框架类型」
这条链，而不是源码质量。

修复建议二选一：

1. CI 改跑 `typecheck:annotamd`，为 `test/` 单独建一份带 `vitest/globals` 的 tsconfig 与独立 job；
2. 给 `tsconfig.json` 补 `"types": [..., "vitest/globals"]`，并统一 Playwright 的 import 路径。

### 3.3 muya lint 门禁失效（9877 errors）

`.github/workflows/muya-lint.yml` 执行 `pnpm -C packages/muya lint`，
即 `eslint src test`，实测 9935 problems（9877 errors / 58 warnings），涉及 78 个文件。

规则分布：

| 规则 | 数量 |
| --- | ---: |
| `style/quotes` | 4138 |
| `style/indent` | 3083 |
| `style/quote-props` | 1814 |
| `style/comma-dangle` | 601 |
| `antfu/consistent-list-newline` | 83 |
| `regexp/no-useless-flag` | 40 |
| `format/prettier` | 39 |
| `perfectionist/sort-imports` | 20 |

其中 9844 项可由 `--fix` 自动修复。

需要单独指出的是规范分叉：`packages/muya/eslint.config.mjs` 采用 **4 空格 + 分号**
的 antfu 风格，而根 `CLAUDE.md` 的 Code Style 写的是 **2 空格 + 无分号**。
两套规范同时存在于同一仓库，这是一个需要收敛的决策点，而非单纯的「忘记跑 lint」。

## 4. P1：安全设计需要决策

### 4.1 两个窗口均关闭同源策略

`packages/desktop/src/main/config.ts` 的第 19 行与第 42 行：

```ts
contextIsolation: true,
sandbox: true,
nodeIntegration: false,
webSecurity: false,   // 关闭同源策略与混合内容拦截
```

其余三项均符合 Electron 安全基线，仅 `webSecurity` 反向设置。这是一个处理不可信
Markdown/HTML 的编辑器，该配置会禁用同源检查与混合内容加载限制。

全仓库检索 `webSecurity`，除构建产物 `packages/desktop/out/main/index.js` 外，
**没有任何注释或文档解释该豁免的必要性**。

处置建议：

- 若确需读取本地 `file://` 资源，应在 `config.ts` 就地写明理由并收窄适用范围；
- 若非必要，应删除并改用 `protocol.registerFileProtocol` 等自定义协议承载本地资源。

### 4.2 IPC 通道缺少来源校验与路径边界

`packages/desktop/src/main/ipc/fs.ts` 第 44–63 行暴露了无路径约束的文件操作：

```ts
ipcMain.handle('annotamd::fs::read-file',  (_e, p) => fs.readFile(p))
ipcMain.handle('annotamd::fs::write-file', (_e, p, data) => fs.writeFile(p, data))
ipcMain.handle('annotamd::fs::unlink',     (_e, p) => fs.unlink(p))
ipcMain.handle('annotamd::fs::move',       (_e, src, dest) => fs.move(src, dest))
```

两个叠加因素：

1. 无路径白名单或工作区边界断言；
2. 全部 158 个 `ipcMain.handle` 均未校验来源，全仓库检索不到
   `senderFrame`、`validateSender` 等来源校验。

与 4.1 叠加后风险被放大：跨源读取能力可升级为任意文件系统读写与删除。

需要说明的是，纵深防御的其余环节是健全的，不构成「裸奔」：

- HTML 净化链路存在：`packages/desktop/src/renderer/src/util/dompurify`，
  以及 `packages/muya/src/utils/paste.ts` 第 77 行的 `sanitize` 调用；
- `packages/desktop/src/main/ipc/shell.ts` 第 120 行的 `setWindowOpenHandler`
  默认返回 `deny`，并注册了 `will-navigate` 拦截。

建议为 IPC 层补两件事：`assertTrustedSender(event)` 来源断言，以及路径落在
「已打开文档目录或用户数据目录」内的边界断言。

### 4.3 安装脚本在 install 期间改写依赖清单

`scripts/postinstall.ts` 第 53 行：

```js
run('pnpm --filter annotamd add native-keymap --ignore-scripts')
```

`postinstall` 中执行 `pnpm add`，会在安装依赖时改写 `package.json` 与
`pnpm-lock.yaml`，且依赖网络。副作用包括：工作区长期存在未提交的 lockfile 变更、
`--frozen-lockfile` 与 CI 缓存场景行为不确定。

建议改为：仅做存在性检查并给出明确报错，或把 native-keymap 的准备工作移出
`postinstall` 成为独立脚本。

## 5. P2：文档与实现漂移

`CLAUDE.md` 是理解仓库的第一入口，目前有四处与实现不一致：

| 文档说法 | 实现 | 参考位置 |
| --- | --- | --- |
| `Desktop shell \| Electron 42` | 实际 `~43.1.1` | `CLAUDE.md:20` 与 `packages/desktop/package.json` |
| 编辑与偏好窗口使用 `contextIsolation: false` + `nodeIntegration: true` | 两者均为 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` | `CLAUDE.md:224-225` 与 `config.ts:12-18, 37-41` |
| 引用 `packages/desktop/src/main/config.js` | 实际文件为 `config.ts`，无同名 `.js` 源文件 | `CLAUDE.md:225` |
| 目录结构描述 `packages/website/` | 该目录不存在，实际为 `web/v2/` | `CLAUDE.md:118` |

其中 `contextIsolation` 一处的危害最大：该描述会让后续开发者误以为这两个窗口不隔离，
从而写出依赖共享全局变量的代码，或误判安全边界。建议优先修正。

## 6. P3：可维护性

1. **超大单文件**：`editor.vue` 3010 行、`CommentPane.vue` 2290 行、
   `store/editor.ts` 2177 行、`AiWorkspaceService.ts` 1507 行。
   超过 2000 行后冲突率与 review 成本显著上升，`editor.vue` 属全应用核心路径。
2. **依赖版本策略**：`packages/desktop` 的 68 个生产依赖中 67 个使用 `^` 范围。
   桌面应用对供应链敏感度高于普通 Web 项目，建议对 `electron-updater`、`keytar`、
   `sharp` 等内建/原生依赖固定精确版本。
3. **未提交的团队规范**：`AGENTS.md` 有 9 行仅本地生效的改动，新增「AnnotaMD 实时文档边界」
   与「只打包必要产物」两节。属团队约定，建议提交，否则他人与 CI 不可见。
4. **注释遗留**：`src/` 下 24 处 TODO/FIXME/HACK。其中
   `packages/desktop/src/main/app/windowManager.ts` 第 376 行的
   `// HACK: Don't use this event! Please see #1034 and #1035` 与
   `packages/desktop/src/main/filesystem/watcher.ts` 第 14 行的 `TODO(refactor)`
   指向同一批旧 issue，建议确认是否仍然有效。
5. **调试日志残留**：12 处 `console.log`，其中
   `packages/desktop/src/main/filesystem/watcher.ts` 第 343、488 行与
   `packages/desktop/src/main/keyboard/shortcutHandler.ts` 第 166 行
   在打包版会写入日志文件，建议收敛到 `electron-log` 的分级日志。

## 7. 建议的处理顺序

| 顺序 | 事项 | 成本 | 收益 |
| ---: | --- | --- | --- |
| 1 | 修 `paragraphFrontButton/index.ts:615` 的 `container` | 一行 | 恢复 muya 构建 |
| 2 | CI typecheck 改指 `tsconfig.annotamd.json`，测试单独建配置 | 小 | 门禁重新可信 |
| 3 | 对 `webSecurity: false` 做明确决策并落注释 | 小 | 关闭一个高风险豁免 |
| 4 | 为 `fs`/`shell` IPC 补来源校验与路径边界 | 中 | 纵深防御性价比最高 |
| 5 | 执行 `pnpm -C packages/muya lint --fix` 并统一空格/分号规范 | 小 | 消除规范分叉 |
| 6 | 修正 `CLAUDE.md` 四处漂移 | 极小 | 避免误导后续开发 |

## 8. 附：本次评审的边界

- 已按用户要求跳过 `packages/vscode-extension`。
- 工作区存在未提交改动：`AGENTS.md`（9 行）与 `pnpm-lock.yaml`。
  经核对，lockfile 变更仅由 `packages/vscode-extension` 这一新 workspace 成员引入。
- 未做运行时压测、未跑 e2e（原因见第 2 节），因此本报告不含性能与端到端稳定性结论；
  相关结论以 `docs/performance-optimization-plan-electron-43.md` 为准。
