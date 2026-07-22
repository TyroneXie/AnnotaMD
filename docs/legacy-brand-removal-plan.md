# AnnotaMD 旧品牌彻底清理计划

> 状态：Mac 第二轮严格复查完成
> 建立日期：2026-07-22
> 清理基线：`v2.13.0` / `337704c`
> 适用范围：当前工作树、源码、测试、文档、依赖、安装包和运行时产物

## 1. 目标

AnnotaMD 已经形成独立产品能力，后续不再把自己视为 MarkText 的品牌延伸。本计划用于清除仓库和最终产物中的 MarkText 产品身份、旧实现命名、无用依赖、兼容代码和资源残留。

本项目当前没有需要兼容的老用户，因此：

- 不保留 `marktext`、`marktext-dev` 用户目录迁移逻辑。
- 不保留旧 MarkText MCP bridge 配置探测。
- 不保留旧可执行文件名、App ID、包名、运行时全局对象、环境变量或 IPC 命名。
- 不保留已经没有调用方的旧 Muya JS 引擎。
- 不为历史安装路径或配置提供兼容分支。

完成后的产品验收标准不是简单换掉界面文字，而是：

1. 安装包、应用界面、系统注册信息、进程信息、崩溃信息和外部链接只识别为 AnnotaMD。
2. 当前源码不再以 MarkText 命名自有模块、变量、事件、包或测试设施。
3. 旧品牌仅允许存在于必须保留的许可证和集中化的第三方来源说明中。
4. Git 历史默认不重写；历史对象不是当前产品残留的验收范围。

本文自身是清理期间的临时审计例外。全部任务完成后，应删除本文，或将最终记录移到仓库外归档，避免它成为新的残留来源。

## 2. 法律与来源边界

彻底去品牌不等于删除上游版权。

必须保留：

- `THIRD-PARTY-NOTICES.txt` 中原作者和 MarkText Contributors 的版权声明。
- 仍随产品分发的第三方包所要求的许可证文本。
- 对仍保留的上游代码有法律必要性的版权头或 NOTICE。

可以清理或集中化：

- 用户界面、README 主体、帮助入口中的产品宣传和跳转链接。
- 普通源码注释中的旧项目名、旧 issue 链接和无必要的实现溯源。
- 测试名称、fixture 名、内部目录名和旧 changelog 中不承担许可证义务的品牌描述。
- 已移除依赖对应的第三方许可证条目。

如需做到除集中化第三方 NOTICE 外完全没有 MarkText 字符串，应先替换 `@marktext/file-icons`，再移除相关依赖许可条目。

## 3. 盘点基线

以下数据采集于本文创建前，已排除 `.git`、`node_modules`、`dist`、`out`、`release`、`coverage` 和 source map：

| 范围 | 文件数 | 直接命中数 |
| --- | ---: | ---: |
| Git 已跟踪文件 | 259 | 811 |
| 本地忽略文件 | 2 | 15 |
| 合计 | 262 | 826 |

直接命中规则覆盖 `MarkText`、`marktext`、带空格/连字符/下划线的变体、`github.com/marktext` 和 `@marktext`。

除直接命中外，还有以下间接命名：

| 命名 | 命中数 | 主要用途 |
| --- | ---: | --- |
| `mt::` | 801 | Electron IPC、renderer 事件和测试 |
| `MARKTEXT_*` | 50 | 构建常量、环境变量、运行时全局状态 |
| `MT_*` | 4 | 菜单命令常量 |
| `mt.*` | 12 | 快捷键和命令 ID |
| `mt-*` | 23 | 通知组件 CSS 类和测试值 |

直接命中文件分布：

| 分类 | 文件数 | 命中数 |
| --- | ---: | ---: |
| Desktop 运行时代码 | 57 | 161 |
| Desktop 主题注释 | 32 | 32 |
| Desktop 测试和 fixture | 19 | 48 |
| Desktop locale 内部键 | 10 | 10 |
| Desktop 打包资源 | 4 | 27 |
| Desktop package/config | 2 | 7 |
| Muya 测试和 fixture | 53 | 161 |
| Muya 运行时代码 | 25 | 38 |
| Muya 文档、配置和示例 | 7 | 191 |
| 旧 `packages/muyajs` | 16 | 46 |
| Release notes | 19 | 20 |
| 根目录和其他文件 | 11 | 67 |
| MCP 兼容代码 | 3 | 7 |
| 仓库脚本 | 3 | 5 |
| 其他文档 | 1 | 6 |

## 4. 已确认残留

### 4.1 用户可见入口和外部链接

#### 帮助菜单

`packages/desktop/src/main/menu/templates/help.ts` 仍打开：

- `marktext.me/docs/markdown-syntax`
- MarkText Releases
- `twitter.com/marktextapp`
- `github.com/sponsors/marktext`
- MarkText Discussions
- MarkText Issues
- MarkText 源码仓库
- MarkText License 页面

#### 错误报告

`packages/desktop/src/main/config.ts` 的 `GITHUB_REPO_URL` 仍指向 MarkText，并被 `src/main/utils/createGitHubIssue.ts` 使用。由此生成的错误报告会提交到错误的仓库。

#### 其他帮助入口

- `src/renderer/src/commands/index.ts`：用户指南和 Markdown 语法。
- `src/renderer/src/components/exportSettings/index.vue`：导出主题帮助。
- `src/renderer/src/prefComponents/image/components/folderSetting/index.vue`：图片设置帮助。
- `src/renderer/src/prefComponents/keybindings/index.vue`：快捷键帮助。
- `src/renderer/src/prefComponents/theme/theme.md`：预览内容仍含 `marktext.app`。

### 4.2 Windows 安装脚本

`packages/desktop/build/windows/installer.nsh` 有两处实质问题：

- Markdown 文件关联仍启动 `$INSTDIR\marktext.exe`，但当前 builder 生成 `annotamd.exe`。
- 卸载流程删除 `$APPDATA\marktext`，可能误删另一个产品的数据，同时不会处理 AnnotaMD 自身目录。

没有老用户后，不应保留对旧目录的清理；卸载器只能处理 AnnotaMD 自己创建的数据，并继续要求用户确认。

### 4.3 Linux 元数据

以下旧文件仍完整保留：

- `packages/desktop/build/linux/marktext.desktop`
- `packages/desktop/build/linux/marktext.appdata.xml`

其中包括：

- `Exec=marktext`
- `Icon=marktext`
- `StartupWMClass=marktext`
- `com.github.marktext.marktext`
- 六张 MarkText 远程截图
- MarkText 0.x 发布记录

当前 `electron-builder.yml` 已设置 AnnotaMD 的 `appId`、`productName`、`executableName` 和 desktop entry。这两个旧文件应删除，并验证 Linux 构建不会继续寻找它们。

### 4.4 旧品牌图标

`packages/desktop/build/icons` 下存在 8 个真实 MarkText 蓝色 M 图标：

- `16x16/marktext.png`
- `24x24/marktext.png`
- `32x32/marktext.png`
- `48x48/marktext.png`
- `64x64/marktext.png`
- `128x128/marktext.png`
- `256x256/marktext.png`
- `512x512/marktext.png`

当前构建已使用 `packages/desktop/static/icon.*` 的 AnnotaMD 图标。上述旧图标没有保留价值，应删除并检查引用。

### 4.5 崩溃报告和进程身份

以下两处 `crashReporter.start()` 仍把 `productName` 或 `companyName` 设置为 `marktext`：

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/exceptionHandler.ts`

应统一为 AnnotaMD，并检查生成的崩溃目录、日志内容和进程元数据。

### 4.6 Desktop workspace 包名和构建脚本

`packages/desktop/package.json` 的包名仍是 `marktext`。

这导致：

- 根 `package.json` 有 19 条 `pnpm --filter marktext ...`。
- `scripts/postinstall.ts` 继续使用 `--filter marktext`。
- 部分生成的第三方许可证把 workspace 本身识别为 `marktext`。

应将 workspace 包名改为 `annotamd` 或 `@annotamd/desktop`，并同步所有脚本、lockfile 和文档。

### 4.7 运行时全局对象

渲染器仍通过 `window.marktext` 暴露：

- `env`
- `paths`
- `initialState`
- 窗口 ID
- ripgrep 路径

主要调用点分布在：

- `src/renderer/src/bootstrap.ts`
- `src/renderer/src/main.ts`
- `src/renderer/src/store/editor.ts`
- `src/renderer/src/store/layout.ts`
- `src/renderer/src/store/preferences.ts`
- `src/renderer/src/pages/app.vue`
- `src/renderer/src/pages/preference.vue`
- PDF、搜索、快捷打开、导出等工具
- 类型声明和对应测试

应迁移为 `window.annotamd`。这是一组跨 preload、renderer、类型和测试的原子改造，不能只替换部分调用点。

### 4.8 环境变量和全局常量

已确认的旧前缀包括：

- `MARKTEXT_VERSION`
- `MARKTEXT_VERSION_STRING`
- `MARKTEXT_DEBUG`
- `MARKTEXT_DEBUG_VERBOSE`
- `MARKTEXT_SAFE_MODE`
- `MARKTEXT_RIPGREP_PATH`
- `MARKTEXT_PANDOC`
- `MARKTEXT_EXIT_ON_ERROR`
- `MARKTEXT_ERROR_INTERACTION`
- `MARKTEXT_DEBUG_KEYBOARD`
- `MARKTEXT_IS_STABLE`

应统一为 `ANNOTAMD_*`，同步修改：

- `electron.vite.config.ts` 构建注入
- main 进程启动逻辑
- preload 暴露白名单
- renderer 读取逻辑
- TypeScript 全局声明
- E2E 启动环境

由于没有兼容要求，不需要同时读取两个前缀。

### 4.9 IPC、事件、命令和 CSS 命名

#### `mt::`

共 801 处，覆盖：

- `src/shared/types/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/*`
- `src/main/app/*`
- 菜单 actions
- renderer stores、commands 和组件
- 单元测试与 E2E

应统一为 `annotamd::`。共享 IPC 类型表、发送端、接收端和测试必须在同一批次迁移。

#### 其他缩写

- `MT_*` 命令常量改为 `ANNOTAMD_*` 或按行为命名。
- `mt.*` 快捷键 ID 改为 `annotamd.*`，或去除产品前缀。
- `mt-*` 通知 CSS 类改为 `annotamd-*`，或使用组件语义名称。

### 4.10 菜单模块和 locale 键

仍存在：

- `src/main/menu/templates/marktext.ts`
- `src/main/menu/actions/marktext.ts`
- `loadMarktextCommands`
- 10 个 locale 中的 `menu.marktext.*`

当前翻译显示值已经是 AnnotaMD，但内部键和文件名应同步改为 `annotamd` 或更具体的 `application`。

### 4.11 `@marktext/muyajs` 和旧 `packages/muyajs`

旧 JS 编辑器包仍存在：

- workspace 包名为 `@marktext/muyajs`
- desktop package 和 lockfile 仍声明依赖
- 包元数据指向 MarkText 仓库
- 包内存在 `contentState/marktext.js`、`marktext/spellchecker.js`
- 解析异常仍提示用户到 MarkText Issues 报告

当前 desktop renderer 已使用 `@muyajs/core`，没有找到对 `@marktext/muyajs` 的实际源码 import。应先验证没有动态引用，再删除 desktop 依赖、整个 `packages/muyajs` 和 lockfile 条目。

### 4.12 `@marktext/file-icons`

该包仍被真实使用：

- Desktop 侧栏图标
- Muya 文件图标工具
- desktop、muya、muyajs package metadata
- lockfile 和第三方许可证

如果目标是当前源码除法律文件外不出现 MarkText，必须替换此依赖。可选方向是使用项目自有 SVG 图标映射，或选择不带旧品牌 scope 的维护中图标库。替换时必须核对现有文件类型覆盖率和主题颜色。

### 4.13 无需保留的兼容逻辑

#### 用户目录迁移

`packages/desktop/src/main/app/userDataBranding.ts` 仍包含：

- `marktext-dev` → `annotamd-dev` 重命名
- 旧图片目录迁移
- 旧截图目录迁移

应删除旧目录探测和迁移分支，只保留 AnnotaMD 当前路径计算。

#### MCP bridge 探测

`tools/annotamd-mcp/src/bridgeDiscovery.ts` 及 bundle 仍探测：

- `marktext/agent-bridge.json`
- `marktext-dev/agent-bridge.json`

应从源码、测试和生成 bundle 中删除这些候选路径，只保留 AnnotaMD 正式和开发目录。

### 4.14 文档、注释、测试和 fixture

#### 明显过时

- 根 `CLAUDE.md` 仍把项目主体描述为 MarkText，并包含旧仓库、旧网站、旧包名和旧命令。
- `.vscode/settings.json` 拼写词典含旧品牌。
- `scripts/generateThirdPartyLicense.ts` 的说明仍写产品随 MarkText 分发。
- `packages/desktop/build/THIRD-PARTY-LICENSES.txt` 延续旧产品说明。
- 32 个主题文件包含 `/*marktext*/` 或旧主题来源注释。
- 多个测试名、测试说明和 fixture 路径仍使用旧品牌。

#### Muya 上游记录

`packages/muya` 中有 85 个直接命中文件，主要来自：

- 上游 CHANGELOG 的 GitHub organization URL
- 上游 issue/PR/commit 链接
- “derived from MarkText”说明
- 回归测试的旧 issue 编号
- 示例内容和远程图片
- `marktext-round-trip` fixture 目录

处理策略：

1. 先保留 `LICENSE` 或 NOTICE 所需内容。
2. 删除对运行逻辑没有帮助的旧品牌注释和链接。
3. 将 fixture 和测试改为行为命名，例如 `legacy-round-trip` 或更具体的格式名称。
4. 将示例图片和文本替换为 AnnotaMD 自有资源。
5. 评估是否需要保留 Muya 原始 changelog；若无发布或许可用途，则移出当前产品仓库。

#### Release notes 和 README

19 份历史 Release notes 及 README 含上游致谢。这些不是运行时残留，但会影响字符串清零。

目标方案：

- 根 `LICENSE` 使用 AnnotaMD 自身许可证；必须保留的上游版权迁移到集中式第三方 NOTICE。
- README 不再把 AnnotaMD 定位成 MarkText 的延续，可改为独立产品介绍，并在简洁的“开源许可”段指向 LICENSE。
- 历史 release notes 可保留真实历史；如果目标是当前仓库字符串严格清零，则将旧 release notes 移到外部归档。

### 4.15 本地忽略文件和 Git 历史

本地忽略文件：

- `.local-research/wysiwyg-markdown-research.md`
- `docs/v2-marktext-migration-plan.md`

旧迁移计划已经与当前方向相反，应删除本地副本，并从 `.gitignore` 移除对应专用规则。

Git 历史中有 30 个提交的 diff 涉及旧品牌，历史对象还包含旧图标、Linux 文件、菜单文件和旧 Muya 路径。默认不重写 Git 历史；若未来因公司合规或代码转让明确要求历史中也不存在旧品牌，必须单独制定仓库迁移方案，而不是在普通清理提交中执行。

## 5. 集中改造清单

本轮按用户决定集中完成 B01～B09，再统一执行回归、构建、扫描和界面验收，避免每个小改动都重复跑一轮测试。

### B01：修复用户可见链接与错误报告

- [x] 将帮助菜单的源码、问题、讨论、发布和文档链接切到 AnnotaMD。
- [x] 删除无对应 AnnotaMD 服务的 Twitter、赞助和旧文档入口。
- [x] 将 `GITHUB_REPO_URL` 改为 AnnotaMD。
- [x] 替换设置页、命令面板和主题示例中的旧链接。
- [x] 增加链接目标回归测试。

验证：`npm run verify:menu`，并在 Electron 中逐个点击帮助和设置入口。

### B02：清理安装包和品牌资源

- [x] Windows 文件关联改为 `annotamd.exe`。
- [x] 删除对 `$APPDATA\marktext` 的卸载逻辑。
- [x] 删除两个旧 Linux metadata 文件。
- [x] 删除 8 个旧 MarkText PNG。
- [x] 崩溃报告产品名改为 AnnotaMD。
- [x] 补充打包配置静态测试。

验证：`npm run verify:feature`；对应平台构建时检查实际可执行文件、文件关联、图标、App ID 和崩溃目录。

### B03：删除旧用户和 MCP 兼容层

- [x] 简化 `userDataBranding.ts`，移除旧目录迁移。
- [x] 删除旧目录测试用例。
- [x] 从 MCP bridge candidates 删除两个旧路径。
- [x] 更新 MCP 测试并重新生成 bundle。

验证：`npm run verify:comments`，并检查 bundle 中不再含旧路径。

### B04：移除旧 `@marktext/muyajs`

- [x] 证明源码和构建没有静态或动态调用。
- [x] 从 desktop package 删除 workspace 依赖。
- [x] 删除 `packages/muyajs`。
- [x] 更新 workspace、lockfile、类型声明和脚本。
- [x] 删除只为旧引擎存在的测试或改写为 `@muyajs/core` 回归。

验证：`npm --prefix packages/muya test`、`npm --prefix packages/desktop run test:unit`、`npm run verify:feature` 和 desktop typecheck。

### B05：替换 `@marktext/file-icons`

- [x] 确认不再保留旧扩展名颜色映射，统一使用现有通用文档图标。
- [x] 选择项目已有的 Element Plus `Document` 图标，不引入新依赖。
- [x] 替换 Desktop 与 Muya 调用。
- [x] 删除三个 package 中的旧依赖和 lockfile 条目。
- [x] 重新生成第三方许可证。

验证：侧栏文件树、搜索结果和相关 Muya UI 的单测及 Electron 界面检查。

### B06：重命名 Desktop workspace

- [x] 将 package name 改为 `annotamd` 或 `@annotamd/desktop`。
- [x] 更新根目录 19 条 filter 脚本。
- [x] 更新 postinstall。
- [x] 更新 lockfile importer 和开发文档。

验证：根目录 `start`、定向测试、typecheck 和 build 命令能正确找到 desktop package。

### B07：迁移运行时全局对象与环境变量

- [x] `window.marktext` → `window.annotamd`。
- [x] `MARKTEXT_*` → `ANNOTAMD_*`。
- [x] 同步构建注入、main、preload、renderer、类型和测试。
- [x] 删除所有双读兼容逻辑。

验证：`npm run verify:feature`，Electron 中检查启动、设置、搜索、导出、PDF 和窗口状态。

### B08：迁移 IPC、事件、命令和 CSS

- [x] `mt::` → `annotamd::`。
- [x] `MT_*` 改为 AnnotaMD 或行为命名。
- [x] `mt.*` 快捷键 ID 改名。
- [x] `mt-*` CSS 类改名。
- [x] 同步所有测试 fixture 和 mock。

验证：先按模块运行 menu、table、comments 定向验证，再运行 `npm run verify:feature`。

### B09：清理菜单、locale、文档、测试和注释

- [x] 重命名菜单文件、函数和 `menu.marktext.*` locale key。
- [x] 重写根 `CLAUDE.md` 的旧项目描述。
- [x] 清理主题标记、旧 issue 注释和测试名称。
- [x] 重命名 `marktext-round-trip` fixture。
- [x] 替换 Muya 示例中的旧图片和文本。
- [x] 删除本地旧迁移计划和 `.gitignore` 专用规则。
- [x] 处理 README、release notes 和 Muya changelog 的归档边界。
- [x] 将根 `LICENSE` 改为 AnnotaMD 许可证，并把必需版权文本迁移到集中式第三方 NOTICE。

验证：locale JSON 全部可解析，文档链接有效，相关测试通过。

### B10：最终清零与产物验收

- [x] 对当前源码执行直接品牌扫描。
- [x] 对 `mt::`、`MARKTEXT_*`、`MT_*`、`mt.*`、`mt-*` 执行间接扫描。
- [x] 检查文件名和目录名。
- [x] 检查 lockfile、生成 bundle、第三方许可证和 source map 之外的构建输出。
- [x] 在当前 Mac 架构打包并检查应用包内容。
- [ ] 通过 CI 检查 Windows 和 Linux 产物。
- [ ] 删除本文，或移出仓库归档。

### B11：第二轮严格复查

- [x] 删除 ESLint 中已经失效的 `packages/muyajs` 路径和专用规则。
- [x] 清理第一轮机械替换遗留的占位词，并修复由此产生的无效示例 URL。
- [x] 将 E2E 注入变量的 `__mt_` 前缀迁移为 `__annotamd_`。
- [x] 让品牌防回归测试在源码中不再拼接写出旧品牌。
- [x] 重新同步依赖树，清除虚拟仓库、hoist 链接和安装元数据中的已删除包。
- [x] 重新执行源码、依赖和生产构建产物扫描。
- [x] 重新执行跨模块验证、Desktop/Muya 单测和生产构建。

### B12：许可证拆分与分发

- [x] 根 `LICENSE` 改为 AnnotaMD Contributors 的 MIT 许可证。
- [x] 新增 `THIRD-PARTY-NOTICES.txt`，完整保留上游版权与许可文本。
- [x] 修复依赖许可证生成器写出 `undefined` 的问题，缺少许可证文件时直接失败。
- [x] 将产品许可证、上游声明和依赖许可证加入 Electron `extraResources`。
- [x] 生成 arm64 unpacked 应用并逐字节核对三份法律文件。

最终允许项默认只有：

- `THIRD-PARTY-NOTICES.txt` 中有法律必要性的上游版权声明。
- 第三方 CodeMirror 在依赖和生产 bundle 中公开的 `markText()` API；这是文本标记函数名，不是产品品牌或 AnnotaMD 自有命名。
- Git 历史对象。

## 6. 扫描与验收命令

### 直接品牌扫描

```bash
rg -i -n --hidden \
  --glob '!.git/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/out/**' \
  --glob '!**/coverage/**' \
  'mark[[:space:]_-]*text|github\.com/marktext|@marktext' .
```

### 间接命名扫描

```bash
rg -n --hidden \
  --glob '!.git/**' \
  --glob '!**/node_modules/**' \
  'mt::|MARKTEXT_|\bMT_|mt\.[a-z0-9_.-]+|mt-[a-z0-9_-]+' .
```

### 文件名扫描

```bash
rg --files -uu \
  -g '!.git/**' \
  -g '!**/node_modules/**' \
  | rg -i 'mark[ _-]*text'
```

最终扫描应只返回明确列入允许项的法律文件；任何产品代码、测试、资源、配置、包名、链接或生成产物命中都视为未完成。

## 7. 改造记录

每完成一批，在这里记录：

| 批次 | 状态 | 提交或工作树 | 验证结果 | 剩余问题 |
| --- | --- | --- | --- | --- |
| B01 | 完成 | 当前工作树 | branding 回归通过；Electron 帮助菜单实机通过 | 设置窗口未向辅助功能接口暴露内容，未冒充目测完成 |
| B02 | 完成 | 当前工作树 | branding 静态回归、feature、build 通过 | 跨平台安装包留到发布前验证 |
| B03 | 完成 | 当前工作树 | comments、MCP 测试和 bundle 生成通过 | 无 |
| B04 | 完成 | 当前工作树 | Desktop 961 项、Muya 1784 项单测全部通过；feature/typecheck/build 通过 | 无 |
| B05 | 完成 | 当前工作树 | feature、Desktop 单测、build、Electron 主界面通过 | 无 |
| B06 | 完成 | 当前工作树 | workspace 命令、lockfile、typecheck、build 通过 | 无 |
| B07 | 完成 | 当前工作树 | feature、Desktop 单测、typecheck、build 通过 | 无 |
| B08 | 完成 | 当前工作树 | menu/table/comments/editor/MCP 回归全部通过 | 无 |
| B09 | 完成 | 当前工作树 | locale 生成与 JSON 解析、扫描、build 通过 | 法定上游版权已在 B12 集中迁移 |
| B10 | Mac 本地验收完成 | `v2.13.0` / `337704c` 工作树 | 直接、间接、文件名、lockfile、bundle、许可证和非 source map 构建输出均清零；arm64 应用已打包、安装并打开真实长文档 | 未跑 Windows/Linux CI；本文按用户要求保留 |
| B11 | 第二轮严格复查完成 | 当前工作树 | `verify:feature` 通过；Desktop 961 项、Muya 1784 项单测通过；production build 通过；源码、依赖元数据和物理文件名扫描清零 | bundle 仅命中第三方 CodeMirror `markText()` API；未重新打安装包 |
| B12 | 完成 | 当前工作树 | 品牌/许可回归 6 项通过；69 个生产依赖许可证校验通过；arm64 unpacked 应用包含并逐字节匹配三份法律文件 | 上游品牌仅保留在法定第三方 NOTICE；CodeMirror `markText()` 按用户决定保留 |
