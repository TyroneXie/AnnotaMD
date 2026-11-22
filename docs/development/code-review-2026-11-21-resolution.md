# 2026-11-21 代码评审整改与复核

复核日期：2026-11-22。对象为当前 `main` 工作树，基于 `70fe08d`；不引用其他分支的结果。
原评审见 [代码评审报告](code-review-2026-11-21.md)。原报告保留历史基线与错误数量，本文件记录后续整改。

## 逐项结果

| 原评审事项 | 处置结果 |
| --- | --- |
| Muya `container` 未定义 | 在 render 内取得真实容器；键盘测试实际调用虚拟锚点的 `getBoundingClientRect()`，Electron 也用 Enter 打开块菜单。其余 Muya 类型错误同步修复，生产构建恢复。 |
| Desktop 类型门禁失败 | 生产和测试分别使用 `tsconfig.json`、`tsconfig.tests.json`；`typecheck` 连续检查两者，feature 门禁也检查两者。统一声明的 Playwright 入口，修复 mock、请求和锚点夹具，未以排除测试代替修复。 |
| Muya lint 门禁失败 | 按 Muya 自有规范修复源码、测试和样式；两份确定性 SVG 生成数据由类型与图标测试检查。根 lint 显式声明其使用的 @eslint/js、globals，排除生成 bundle、暂存 runtime 和测试输出；没有用禁用源码检查来规避错误。 |
| Muya lint 失败 | 修正手写代码的格式、类型导入与实际规则问题。两份确定性生成的 SVG 数据不参与风格重排，继续接受 TypeScript 和图标测试。Desktop、Muya 的不同风格按 package 分别约束并写入文档。 |
| 两个窗口 `webSecurity: false` | 编辑和设置窗口均开启同源保护。本地相对图片路径已有正常加载能力，无需额外引入协议层。 |
| IPC 来源与文件路径无边界 | main 在注册处理器之前统一检查窗口、主 frame 和入口 URL；preload 检查运行时通道白名单并隐藏原始事件。通用文件 API 校验窗口授权路径，覆盖真实路径、父目录、符号链接、新目标、读写权限。打开、保存、拖入、图片目录选择保留明确的主进程授权入口；外部图片仅授予单文件只读访问。详见 [安全边界](security-boundaries.md)。 |
| postinstall 嵌套安装 | 移除 `pnpm add` 等依赖变更行为；缺 native-keymap 源码时立即明确失败，已存在则只修补和按 Electron ABI 重建。阻止其先运行 Node ABI 安装脚本。新增执行级回归检查命令与文件写入边界。 |
| CLAUDE.md 漂移 | 同步 Electron 43、context isolation、sandbox、webSecurity、`config.ts`、静态站点路径和分包代码风格；删除过时的网站命令与链接。 |
| 大文件维护成本 | 按职责拆出 `CommentPane.css`、`editor.css`、`editorStateHelpers.ts`、`ai/attachments.ts`，保留现有入口与导出。CommentPane 从 2290 行降至约 1477 行，editor store 从 2177 行降至约 1862 行。编辑器脚本和运行编排仍由原模块负责，不为达到任意行数继续拆分运行状态。 |
| 关键依赖版本 | 将 electron-updater、keytar、native-keymap 固定为当前锁定的精确版本，更新并验证锁文件。sharp 并非 desktop 的直接生产依赖，没有为了符合报告示例新增依赖；其余依赖仍由提交的锁文件和 frozen install 固定。 |
| 团队规范仅本地存在 | 保留已有实时文档与最小打包规则，将其与新增 IPC、类型、安装规则纳入当前整改文件范围；与本轮整改一并提交。 |
| 旧 TODO/HACK | watcher 与窗口路由的旧 issue 注释改为仍然有效的职责说明；其余明确指向未来优化或尚未实现能力的 TODO 保留，不将删除注释当作实现功能。 |
| 调试日志 | watcher 与键盘布局调试使用 electron-log.debug，保留调试开关；删除重复键盘错误输出。renderer 的开发诊断改为 debug，去掉语言加载噪声。终止进程时的错误提示和生成资源自身的诊断不作为无条件调试输出删除。 |

## 验证记录

- Desktop 完整单测：128 个文件、1187 项通过。
- Muya 完整单测：253 个文件、1877 项通过。
- Desktop 生产与测试类型检查、Muya 类型检查均通过。
- 根 lint：0 errors；Muya lint：0 errors。分别保留现有的 386 项提示和 18 项复杂度提示，不代表已消除所有维护建议。
- Desktop 与 Muya production build 通过；MCP 构建通过。
- `npm run verify:feature` 通过，包含新增安全、安装和 IPC 生成物回归。
- `pnpm@10.33.4 install --frozen-lockfile --ignore-scripts --lockfile-only` 通过；未重装或清理本机用户数据。
- Electron 36 项回归通过：模型管理、语言图标、评论生命周期与排序、权限拒绝、相对图片、另存为、表格图片粘贴、折叠时的表头、真实长文档（保持原文不变）。
- 最终补查 renderer 伪造“已打开文件”消息不能扩大路径授权，设置路径字段也必须经过授权检查；重建后追加 12 项 Electron 定向回归，全部通过。
- 两处旧评论 E2E 已修正：人工设置 DOM Range 后同步 Muya 选区；部分编辑保留评论，完整替换才移除。未通过修改产品行为迎合过时断言。

## 对原评审定级和建议的校正

编译和门禁失败属于真实阻塞，但不是已发生数据损坏或全面服务中断；原文将三个门禁问题一律定为 P0 偏重。此次仍完整修复，没有因定级调整而放弃处理。

`webSecurity: false` 与缺少来源检查是必须修复的防御缺口；原报告未提供从不可信 Markdown 实际进入特权 IPC 的完整攻击链，因此“已经可以任意读写”的说法不能作为已验证结论。整改补齐边界，并实跑拒绝用例。

两套 package 风格没有必要强行统一；生成数据也不应与手写代码一样反复重排。保持分包门禁、生成器一致性与完整类型检查，解决的是检查不可用的问题。

本次没有远程推送或发布。未跟踪的 `packages/vscode-extension/` 及其原有锁文件条目保留，未修改扩展源码。跨平台原生重建与安装包验收仍应在正式发布的五平台预检执行，本机验证不替代该步骤。
