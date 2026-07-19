# AnnotaMD 开发验证规则

## 分层验证

不要为每个小改动运行全量测试或打包。根据改动范围选择最小验证集：

- 块菜单、文字类型转换、高亮块：`npm run verify:menu`
- 表格选择、行列操作、表格工具栏：`npm run verify:table`
- 批注、高亮定位、评论栏：`npm run verify:comments`
- 跨模块小版本功能：`npm run verify:feature`
- 不确定影响范围时：`npm run verify:quick`

`verify:quick` 是菜单、表格、批注三个核心包的快速冒烟检查；`verify:feature` 在此基础上增加桌面端类型检查。

## 界面验证

- 纯样式或交互改动除了对应脚本，还要在 Electron 开发版中验证实际界面。
- 默认使用 `/Users/xielintao/Documents/work/project/智擎平台/DSL生成优化/项目开发/design.md` 检查真实长文档。
- 涉及特定边界时可以创建最小 QA Markdown，但验证后要重新打开上述真实文档。
- 不要把“单元测试通过”描述成“界面已经修复”；必须说明实际运行界面的验证结果。

## 全量验证与打包

- 只有准备提交重要版本或发布 Release 时，才运行全量测试、完整构建和打包。
- 用户未要求时不要打包。
- 新增功能若不属于现有 menu、table、comments 包，应添加最小回归测试并登记到 `scripts/verifyAnnotaMD.mjs`，供后续复用。
- **不得把其他分支、其他 worktree 或未合入提交中的验证结果当作当前项目结果。** 汇报“已修复/已优化”前，必须确认改动存在于当前工作树和当前分支；发布前还必须确认改动已进入发布提交与实际构建产物。
- 发布前执行分支一致性检查：记录当前分支与 `HEAD`，核对目标修复提交是 `HEAD` 的祖先，检查 `git status`，并从最终产物做一次真实界面冒烟验证。只在实验分支生效但未合入发布分支的功能，必须明确标注“未合入”，不能描述为已完成。

## 版本号与 Release 发布

用户说“发布”“提交远程并发布新版本”等明确发布指令时，直接按本节执行，不再让用户选择 patch 或 minor。版本号遵循 SemVer，并以远程最高稳定 tag 为基准：

- **Patch：`X.Y.(Z+1)`**。仅包含向后兼容的问题修复、兼容性修正、性能修正或现有交互的纠偏，没有新增用户可调用的能力。例如从 `2.3.0` 只修复 Mermaid 解析、源码模式宽度或控件显隐，应发布 `2.3.1`。
- **Minor：`X.(Y+1).0`**。新增向后兼容的用户能力、菜单操作、编辑能力、设置项或支持的新格式。只要发布范围含一项此类功能，即使同时包含修复，也使用 minor。例如 `2.3.0` 后新增“复制文件名/完整路径”，应发布 `2.4.0`。
- **Major：`(X+1).0.0`**。存在不向后兼容的数据格式、配置、命令、插件/API 或迁移要求。只有相关破坏性变更已经被用户明确授权时才直接发布 major；否则发布前先确认。
- 多类改动混合时采用其中最高级别；提交数量和改动行数不影响版本级别。除非用户明确要求 beta/rc，否则发布稳定版本，不添加预发布后缀。
- 不复用、不删除、不移动已经推送到远程的 tag。远程 tag 后若只遇到临时 CI 故障，可重跑流水线；若必须修改代码，则修复后发布下一个 patch。
- 已推送 tag 后若确认只需修正 workflow/runner，且应用源码、依赖、版本和产物内容均不变，可从 `main` 执行 `gh workflow run release.yml --ref main -f release_tag=vX.Y.Z` 重建同一 tag；该入口必须 checkout 原 tag。若需要修改 tag 内任何应用或构建源码，仍必须发布下一个 patch。

### 标准发布流程

1. **确认发布基线与范围**
   - 确认仓库路径、当前分支、`HEAD` 和 `git status --short`；保留并排除所有与本次发布无关的用户改动和未跟踪文件。
   - 执行 `git fetch origin main --tags`，以远程最高稳定 tag 确定当前版本，并确认发布分支是 `main`、本地基线没有落后于 `origin/main`。
   - 查看从上一 tag 到待发布 `HEAD` 的实际用户可见改动，按上述规则确定唯一的新版本号，并在进度消息中简述判定依据。

2. **更新版本与日志**
   - 同步更新根目录 `package.json` 与 `packages/desktop/package.json` 的版本号。
   - 在 `CHANGELOG.md` 顶部新增 `X.Y.Z - YYYY-MM-DD`，按 `Added`、`Changed`、`Fixed` 记录本次实际变更；没有内容的分类不写。
   - 新增 `docs/releases/release-notes-vX.Y.Z.md`，使用中文说明用户可感知的新增、删除、改进和修复，以及必要的升级或安装提示。
   - `CHANGELOG.md` 与 Release 正文只写“产品改了什么、用户会获得什么”，按实际内容组织新增、删除、改进、修复，没有内容的分类不写。不得写 CI、tag、workflow、runner、编译器、打包命令、测试数量、排障过程、失败复盘或 agent 如何完成工作；这些工程经验写入 `AGENTS.md` 或开发文档。内部问题若确实影响用户，只描述最终影响和结果，例如“恢复 Linux 安装包下载”，不展开内部根因。
   - 性能数据可以保留，但必须转换成用户场景并说明测试条件，仅用于相对参考；不要暴露本机私有路径、内部验证文件名或无用户意义的实现细节。
   - “完整变更”应从上一个实际公开的 GitHub Release 比较到当前版本，不以仅存在 tag、但没有公开 Release 的失败版本作为起点。
   - 执行 `git diff --check`，并确认所有 locale JSON 可解析、版本号与发布说明一致。

3. **发布前验证**
   - 运行改动对应的回归测试、受影响 package 的全量测试以及 `npm run verify:feature`。桌面端和 Muya 分别使用 `npm --prefix packages/desktop run test:unit`、`npm --prefix packages/muya test`。
   - 执行 `npm --prefix packages/desktop run typecheck:annotamd` 和 `npm --prefix packages/desktop run build`，确认 AnnotaMD TypeScript 检查与 Electron production build 通过。
   - 界面或交互改动必须在 Electron 中打开真实文档验证，不能只凭单元测试。发布前使用 `npm --prefix packages/desktop run build:mac:arm64`（Apple Silicon）或 `build:mac:x64`（Intel）打包当前架构，并从该新产物启动一次，核对版本号和本次核心场景。
   - 任一与本次改动相关的检查失败时不得创建 tag；先修复并重新验证。既有且确认无关的失败要明确记录，不能静默忽略。

4. **提交并执行远程跨平台预检**
   - 只暂存本次发布范围，提交信息统一为 `release: prepare AnnotaMD vX.Y.Z`。
   - 先只推送 `main`，不要创建 tag；执行 `gh workflow run build.yml --ref main`，并记录本次运行 ID。
   - 等待该 `PR Build` 运行结束，确认其 `headSha` 与待发布 `HEAD` 完全一致，且 runner 标签、Node、原生编译器和打包命令与 Release workflow 对应矩阵一致；Linux、Windows x64/arm64、macOS x64/arm64 五个平台全部成功并上传产物。失败时直接在 `main` 修复并重新预检，不占用新版本号。

5. **创建并推送不可变 tag**
   - 只有第 4 步精确提交的五平台预检全部通过后，才创建 annotated tag：`git tag -a vX.Y.Z -m "AnnotaMD vX.Y.Z"`。
   - 核对 tag 指向已通过预检的提交，再单独执行 `git push origin vX.Y.Z`。不得为了维持原子推送而跳过 tag 前预检。

6. **等待并验收正式 Release**
   - 持续监控 tag 触发的 `Release AnnotaMD` GitHub Actions，直到流水线明确成功或失败；不能在排队或运行中就宣称发布完成。
   - 成功标准：GitHub Release 不是 draft/prerelease（预发布除外），macOS x64/arm64、Windows x64/arm64、Linux 产物均已上传，并存在 `SHA256SUMS.txt`。
   - 检查 Release 页面正文。若自动正文只有安装提示和比较链接，使用本次 `docs/releases/release-notes-vX.Y.Z.md` 补齐详细中文更新日志，同时保留下载校验说明和完整变更链接。
   - 最终汇报 commit、tag、Release URL、产物范围、验证结果，以及仍被保留的无关工作树文件。

## 开发经验维护

- 开发中遇到已确认、可能再次出现的坑时，主动更新本文件，不必等待用户提醒。
- 只记录已经定位根因并验证过的结论；不要记录未经验证的猜测、一次性环境故障或冗长排查过程。
- 每条经验应包含：现象或适用场景、根因、推荐做法、验证方式。内容尽量简短，并优先转化为自动化测试或验证脚本。
- 新经验若改变现有规则，直接修订原条目，避免保留互相冲突的旧说明。
- 不在本文件记录密钥、令牌、账号、私有业务数据或其他敏感信息。

## 已确认的项目经验

### 验证脚本入口

- 在当前 Codex 环境中直接执行 `pnpm verify:*` 可能先触发依赖状态检查，并因 Git 子依赖策略而中止；这不代表测试失败。
- 统一使用 `npm run verify:*` 调用仓库内已经安装的测试工具，避免验证过程中意外重新安装依赖。
- 小改动优先运行对应的定向验证包；只有跨模块改动才运行 `verify:feature`，发布前才运行全量构建和打包。

### 界面验证结论

- 单元测试和类型检查只能证明逻辑与类型约束通过，不能替代 Electron 实际界面验证。
- 涉及浮层位置、菜单显隐、滚动、表格吸顶、拖拽或长文档性能时，必须在开发版中打开真实长文档验证。
- 表格拖拽条在宽度不同的行列间切换时，不能只等 ResizeObserver 下一帧同步浮层尺寸；Floating UI 首次定位前应先同步当前拖拽条宽高，否则会按上一行列的尺寸短暂居中错位。验证时记录逐帧浮层坐标，并确认所有插入态坐标都落在真实表格边界上。
- 列表圆点、序号和待办复选框位于 `li` 内容盒外；调整段落前置菜单时必须为列表项保留标记槽，并用 `paragraphFrontButton/__tests__/positioning.spec.ts` 覆盖有序、无序和待办三类列表。
- 长代码块首次在屏幕外布局时，Range API 可能返回跳出代码块的异常行坐标，导致代码块行号覆盖后续正文；行号定位必须同时拒绝向上倒退和超出代码元素高度的坐标，并用长代码块首次加载场景验证所有行号都位于所属代码块内。
- 共享 SVG 图标放入局部裁剪容器时，容器尺寸必须与 SVG 实际尺寸一致；仅修改外层 action icon 的百分比宽高不能覆盖 SVG 的固定尺寸。验证时比较 SVG 与裁剪容器的实际边界，不能只确认图标元素存在。
- `CodeBlockContent` 同时承载代码块、数学块、HTML、图表和 front matter；为代码块增加富文本能力时必须按真实 `code-block` 容器隔离，不能让其他容器出现格式工具栏。代码块内单块选区可以复用 `Format`，但跨块格式化仍应跳过代码块，避免拖选正文时改写中间代码。验证需覆盖普通 Prism 高亮、代码块内格式/评论、跨块跳过代码以及源码模式往返。

### Electron IPC 数据边界

- 现象：渲染端状态更新成功，但调用 IPC 持久化时报 `An object could not be cloned`，随后重新加载导致界面数据消失。
- 根因：Vue/Pinia 的响应式 Proxy 不能由 Electron 的结构化克隆算法直接传给主进程。
- 推荐做法：在 IPC 边界显式复制为普通对象，并递归复制数组、锚点等嵌套响应式值；不要直接传 store 中的对象。
- 验证方式：单元测试在 IPC mock 中对请求执行 `structuredClone`，并补充 Electron 端到端写入测试。

### 设置页外部客户端检测

- 现象：设置页依赖 CLI 探测外部 Agent 时，客户端行延迟出现或控件长时间停留在检测态。
- 根因：每次进入页面都重新启动 CLI 查询，并在异步结果返回前用空数组渲染列表。
- 推荐做法：固定渲染支持的客户端行；主进程启动时异步预热并缓存探测结果，页面读取缓存，只有用户主动刷新时强制重查。
- 验证方式：回归测试覆盖异步探测完成前的固定行与缓存路径，并在 Electron 冷启动后连续打开设置页确认列表无跳动。

### 表格密集长文档首次打开

- 现象：普通文档启动基准正常，但打开包含大量表格单元格的真实长文档需要数秒。
- 根因：新标签同时触发 `file-changed` 和 `file-loaded` 导致全文渲染两次；InlineRenderer 又在创建每个内容叶子时深拷贝并遍历完整 state 收集引用定义，形成近似 O(n²) 工作。
- 推荐做法：新文件只走一次 `file-loaded`，已有标签切换走 `file-changed`；引用定义按 JSON state revision 缓存，`setContent` 或 OT dispatch 后失效，同一 revision 不重复扫描。
- 验证方式：用 CPU profile 确认不再出现 `TableCellContent → _collectReferenceDefinitions → getState → deepClone` 热点；用 `referenceDefinitionCache.spec.ts` 覆盖缓存与失效，并在 Electron 中核对真实文档的表格/单元格数量和 Markdown 往返内容。

### 分支、提交与发布产物一致性

- 现象：开发过程中某个性能或功能改动在实验分支验证有效，但 `main`/Release 仍表现为旧逻辑。
- 根因：只验证了实验 worktree，没有把对应提交合入当前发布分支，或构建时使用了另一份源码/旧产物。
- 推荐做法：开始修改前确认仓库路径、分支和 `HEAD`；完成后用 `git diff`/`git log --contains <commit>` 确认代码归属；发布前确认目标提交可从发布 `HEAD` 到达，并对新生成的安装包而不是开发版或旧 DMG 进行冒烟验证。
- 验证方式：至少记录并核对 `pwd`、`git branch --show-current`、`git rev-parse HEAD`、`git merge-base --is-ancestor <目标提交> HEAD`、`git status --short`；安装产物后复测本次修复的核心场景。

### Electron 大版本与 Linux 原生模块工具链

- 现象：Electron 大版本升级后，macOS 和 Windows 能完成原生模块重建，但 Linux 在 `native-keymap` 包含 V8 头文件时出现 `V8_EXPORT`/`expected identifier` 编译错误。
- 根因：Electron 43 的 Linux V8 二进制使用 Clang 构建；仅设置 C++20 仍会让 `electron-rebuild` 默认调用 GCC。Electron 43 对应的 Chromium 150 又把预编译 Clang 包从 `.tgz` 改为 `.tar.xz`，当前 `@electron/rebuild` 4.0.4 至 4.2.0 的 `--use-electron-clang` 仍请求旧格式并返回 404；Ubuntu 22.04 的默认 Clang 14 还缺少 V8 头文件需要的 `std::source_location` 支持。
- 推荐做法：Linux Build 与 Release 统一锁定 `ubuntu-24.04`，显式安装系统 Clang，并在 job 级别把 `CC=clang`、`CXX=clang++` 写入 `$GITHUB_ENV`，确保 postinstall 和 `build:linux` 内再次执行的 electron-rebuild 都继承同一工具链；在上游支持 `.tar.xz` 前不要使用 `--use-electron-clang`。macOS、Windows 保持现有工具链。
- 验证方式：确认 Release、Build 和 E2E 三条 Linux workflow 均在所有 Node 构建步骤前导出 CC/CXX，tag 前 Build 与 Release 使用同一 Linux runner，并以两次 `native-keymap` 重建及 AppImage、deb、rpm、tar.gz、snap 全量打包通过为准。

### pnpm 冻结锁文件与配置一致性

- 现象：所有平台在构建前同时报 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`，Release 尚未进入编译阶段就失败。
- 根因：`package.json` 或 workspace 的 overrides 等依赖配置已变化，但 `pnpm-lock.yaml` 的 settings 没有同步更新；CI 使用 frozen lockfile，不会代为修复。
- 推荐做法：任何依赖声明、overrides、patchedDependencies 或 workspace 配置变更，都必须同步提交重新生成的 `pnpm-lock.yaml`；不要用关闭 frozen lockfile 掩盖不一致。
- 验证方式：发布候选提交执行 `pnpm install --frozen-lockfile --ignore-scripts` 必须通过，并由 tag 前五平台预检再次验证。

### Linux 多格式打包缓存竞争

- 现象：Linux 同时生成 AppImage 与 Snap 等格式时，在 `~/.cache/electron-builder/appimage-*` 下出现随机 `ENOENT`，而其他平台正常。
- 根因：多个 electron-builder 目标并发下载或解压同一份 AppImage 工具缓存，发生目录创建与清理竞争。
- 推荐做法：Linux 主格式与 Snap 保持为顺序执行的 electron-builder 调用，不要为了缩短时间改回并发；共享缓存的新增目标也应串行验证。
- 验证方式：tag 前 Linux 预检必须完整产出 AppImage、deb、rpm、tar.gz 和 snap，不能只以编译通过作为成功标准。

### 不可变 tag 前的跨平台门禁

- 现象：macOS 本机验证通过，但 tag 触发 Release 后才暴露 Linux 或 Windows 问题；由于远程 tag 不得移动，修复只能再发布 patch 版本。
- 根因：本机验证覆盖不了其他平台，而旧流程把五平台构建放在 tag 创建之后；原有 `build.yml` 又只由 PR 触发，直接从 `main` 发布时没有远程预检。即使增加预检，runner 或构建步骤与 Release 不一致仍会留下盲区。
- 推荐做法：`build.yml` 保留 `workflow_dispatch` 入口；发布候选提交先推送 `main`，对其精确 SHA 手动运行与 Release 同 runner、同工具链、同打包命令的五平台 Build，全部成功后再创建和推送 tag。
- 验证方式：发布记录中必须保留 tag 前 Build run ID，确认其 `headSha` 等于 tag commit，并逐项核对两个 workflow 的 matrix runner 与关键构建步骤；缺少任一证据不得创建 tag。
