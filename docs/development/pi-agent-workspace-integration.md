# AnnotaMD 多 CLI Agent 工作区集成方案（基于 DBX 迁移）

> 状态：当前唯一实施依据（2026-08-29）
>
> 文件名为兼容旧链接而保留；方案不是 Pi 专属。AnnotaMD 迁移 DBX 的多 CLI 产品形态，但不迁移数据库和 SQL 能力。

## 1. 产品结论

AnnotaMD 只提供 Agent 模式，不再提供 Ask、API 通用问答和模板功能。用户配置本机已经安装的 CLI Agent，并复用 CLI 自带的模型、登录、Skills、扩展、MCP、会话运行时和原生工具。

核心边界：

- CLI 负责实际的 read、write、edit、bash、网络、Skills、扩展及原生会话能力；
- AnnotaMD 负责聊天界面、当前文档/选区/批注上下文、外部文件变化同步、文档 Diff 和一键回退；
- AnnotaMD 不再向 CLI 暴露 `annotamd_edit_document` 和 `annotamd_replace_document`，避免同一文档存在两个编辑通道；
- AnnotaMD MCP 只保留 CLI 无法从磁盘获得的上下文能力，例如未保存正文、选区和批注；
- CLI 直接修改已保存 Markdown 文件，AnnotaMD 监听并载入结果；
- 默认权限模式是“请求批准”，另提供“完全访问”。权限判断由 CLI 原生运行时负责，AnnotaMD 只展示审批并转交用户决定。

## 2. 产品范围

### 2.1 迁移 DBX 的能力

- 右侧 Agent 栏；
- 新建、历史、搜索、切换、重命名、删除会话；
- 停止任务、失败状态、重新发送、放大和关闭；
- CLI 自动检测、一键生成配置、手工绝对路径和连接测试；
- Provider 图标、模型选择和由 Provider/模型动态返回的思考强度；
- 文本和图片附件；
- 流式正文、思考过程、工具事件和错误归一化。

### 2.2 不迁移的 DBX 能力

- 数据库、Schema、表、字段和连接选择；
- SQL 查询、解释、执行和数据库 MCP；
- Ask 模式和 API Provider 配置；
- 提示词模板；
- 数据库写保护和 SQL 审批。

### 2.3 AnnotaMD 新增能力

- 当前打开文档、选区和批注上下文；
- 从 CLI 写盘结果同步到 Muya；
- 每轮开始保存文档 checkpoint；
- 每轮结束聚合本轮 Markdown 修改并展示 Diff；
- 保留修改或一键回退整轮修改；
- CLI 原生审批请求卡片；
- “请求批准 / 完全访问”两种权限模式；
- CLI 新建 Markdown 后自动发现、打开并关联当前会话。

## 3. 右侧栏产品形态

Comments 和 Agent 共用同一宽度的右侧区域并互斥显示：

```text
┌────────────────────────────────────────────────────┐
│ 文档正文                                [批注][AI] │
│                                  ┌─────────────────┤
│                                  │ 会话 Header      │
│                                  │ 推荐问题         │
│                                  │ 消息 / 工具事件  │
│                                  │ 审批 / Diff 卡片 │
│                                  │ 附件 + 输入框    │
│                                  │ 权限 + Agent模型 │
└──────────────────────────────────┴─────────────────┘
```

- Comments 跟随当前文档；关闭全部文档时 Comments 一起关闭；
- Agent 跟随窗口/工作区；关闭全部文档后仍保留；
- 切换 Comments/Agent 只改变可见面板，不销毁会话或停止后台任务；
- Close 只隐藏 Agent，Stop 才终止运行；
- 当前文档、选区和附件按每轮发送，不永久混入其他会话。

批注栏的“咨询”始终使用 Agent 栏当前选中的 CLI、模型、思考强度和权限模式。

## 4. 配置模型

设置页只保存 CLI 配置：

```ts
interface AgentCliConfig {
  id: string
  name: string
  provider: CliProvider
  executablePath?: string
  environment?: Record<string, string>
  defaultModelId?: string
  isDefault: boolean
}
```

AnnotaMD 不保存 CLI 的账号 token。登录状态由 CLI 自己管理；测试按钮只执行受控的版本/认证探测。

Skills 与 MCP 区域只提供安装教程和一键复制内容，不自动扫描或修改桌面 Agent 应用。其用途是让外部 Agent 获取 AnnotaMD 的选区、未保存正文和批注，不替代 CLI 原生文件工具。

## 5. 两种权限模式

### 5.1 请求批准（默认）

CLI 保持自己的风险分类。只要 CLI 发出审批请求，AnnotaMD 在当前工具步骤下展示 Provider 原始操作类型、命令/路径/目标、风险说明，以及该 Provider 实际支持的决定。

AnnotaMD 不重新判断 Bash、网络或文件操作是否危险，也不把不同 CLI 的名称强行映射成相同含义。统一层只使用最小协议：

```ts
type AgentPermissionMode = 'request' | 'full-access'

interface AgentApprovalRequest {
  id: string
  runId: string
  provider: CliProvider
  kind: string
  title: string
  detail?: string
  command?: string
  paths?: string[]
  options: Array<'allow-once' | 'allow-session' | 'deny'>
  providerPayload: unknown
}
```

用户决定必须回到发起请求的同一个 CLI session。停止任务、删除会话、CLI 崩溃或窗口退出时，所有待审批请求自动拒绝并清理。

### 5.2 完全访问

AnnotaMD 使用 Provider 官方的免审批/完全访问模式启动 CLI。CLI 可使用其正常的文件、shell、网络、Skills、扩展和 MCP 能力。

界面必须明确提示：Diff 和一键回退只覆盖本轮识别到的 Markdown 文档修改，不能撤回 shell、网络、依赖安装、非 Markdown 文件或外部系统操作。

### 5.3 Provider 审批适配

- Codex：使用 app-server 双向 JSON-RPC，接收 command/file-change approval 并回写 decision；
- Claude Code、CodeBuddy：使用 stdio control protocol 的 `can_use_tool` 请求并回写 allow/deny；
- OpenCode、Cursor、Grok、Qoder：使用 ACP `session/request_permission` 并返回 Provider 给出的 option id；Cursor 在建会话前额外完成 ACP `authenticate`；
- Pi：上游没有内建权限弹窗，AnnotaMD 通过 Pi 官方 `tool_call` 扩展事件阻断 Bash 等工具；edit/write 在实际写入当前文档前阻断。读类工具不询问。

所有内置 CLI 都支持“请求批准”。“完全访问”使用各 Provider 官方免审批模式，并保留 CLI 自带的文件、命令、网络、Skills、扩展与 MCP 能力；AnnotaMD 不用 `dontAsk` 或工具 deny 列表伪装完全访问。

## 6. AnnotaMD MCP 边界

向 CLI 公开：

```text
annotamd_get_context
annotamd_read_document
annotamd_list_comments
annotamd_get_comment
annotamd_reply_comment
```

不向 CLI 公开：

```text
annotamd_edit_document
annotamd_replace_document
```

`get_context` 返回活动文档 handle、路径、revision、dirty、选区摘要；`read_document` 用于读取 Muya 中尚未保存的实时正文。CLI 对已保存文件仍使用自己的 read 工具，修改时使用自己的 write/edit 工具。

MCP 通过一次性 scope token 限定当前窗口、会话和 turn。令牌只传入受控子进程；turn 结束立即吊销，不开放局域网监听。

保留现有 edit/replace 服务端实现作为未来“自定义模型 Agent”能力，但它们不出现在多 CLI 的 `tools/list`、allowed tools 或系统提示中。

## 7. 文档同步、Diff 和回退

### 7.1 Turn checkpoint

每轮开始记录工作区、已打开文档内容/hash/dirty 状态和已知 Markdown 文件集合。

启动 CLI 前：

1. 当前文档已保存：直接记录 checkpoint；
2. 当前文档有未保存修改：先通过现有保存链写盘，再确认写盘内容与 Muya 一致；
3. 无路径的新文档：允许只读问答；若用户要求修改，先引导保存，不能让 CLI 猜测临时路径。

### 7.2 外部修改同步

CLI 写盘后由现有文件 watcher 通知 renderer。若 Muya 没有本轮之外的新修改，载入磁盘内容；若用户在 Agent 运行期间又编辑同一文档，标记冲突并禁止静默覆盖。

### 7.3 变更收集

本轮结束后比较 checkpoint 与工作区：

- 已打开 Markdown：比较开始和结束内容；
- 新建 Markdown：比较开始/结束文件集合并读取新文件；
- 多文件修改：按文件分组展示；
- 非 Markdown 修改只在工具时间线提示，不进入 AnnotaMD 回退集合。

### 7.4 一键回退

回退前对每个文件校验当前 hash 是否仍等于本轮结束 hash。全部通过才原子回退；任一文件被用户或其他进程再次修改时，整轮不回退并提示冲突。

新建文档回退时首版不自动删除文件，避免数据丢失。

## 8. 会话与运行生命周期

- 每个会话固定 CLI Provider、模型、思考强度、权限模式和 workspace；
- 改变其中任一项后，下一次发送创建新会话；
- 会话历史保存 AnnotaMD 消息和归一化工具时间线；
- Provider 原生 session id 可恢复时一并保存；
- 停止时先拒绝待审批，再终止 CLI；超时后强制结束；
- 应用重启后，原先 running 状态改为 failed，可重新发送；
- 历史简介显示更新时间和 Agent 配置名，标题支持编辑。

## 9. 架构

```text
Renderer (Vue / Muya)
├─ AgentSidebar / ConversationStore / Composer
├─ ApprovalCard / ToolTimeline / TurnDiffReview
├─ CurrentDocumentContext / Selection / Attachments
└─ ExternalChangeConflict UI
          │ typed IPC
          ▼
Electron Main
├─ AiWorkspaceService / AiStore
├─ ProviderRuntimeAdapter
│  ├─ CodexAppServerAdapter
│  ├─ ClaudePermissionAdapter
│  └─ OpenCodeAcpAdapter
├─ ApprovalCoordinator
├─ TurnCheckpointCoordinator
├─ MarkdownChangeCollector
└─ AnnotaMDContextMcpGateway
          │ structured protocol / stdio
          ▼
Local CLI runtime ── native read/write/bash/network/tools
```

Renderer 不能提交任意 executable、CLI 参数或环境变量。Provider adapter 根据已保存配置生成固定启动参数，并使用参数数组、`shell: false`、输出上限和停止超时。

## 10. 实施顺序

### 阶段 A：边界纠正

- 删除 Ask 和模板 UI；
- 新增权限模式类型、持久化和输入区选择器；
- CLI 工作目录改为真实 workspace；
- 恢复 CLI 原生工具、用户配置、Skills 和扩展；
- 从 CLI MCP 白名单移除 edit/replace；
- 更新命令构建测试。

### 阶段 B：原生审批

- 公共 approval request/decision 事件和 IPC；
- Codex app-server；
- Claude permission prompt；
- OpenCode server/ACP；
- Stop/崩溃/删除时自动拒绝；
- 审批卡片 Electron E2E。

### 阶段 C：CLI 写盘 Diff

- turn checkpoint；
- 已打开 Markdown 外部写盘同步；
- 多 Markdown 变更收集；
- Diff、保留和原子回退；
- 新建 Markdown 发现并打开；
- 运行期间同文档冲突测试。

### 阶段 D：其余 Provider

- 逐个确认官方审批协议；
- 支持请求批准或明确标为仅完全访问；
- 测试版本升级后的兼容错误。

## 11. 验收标准

1. 设置页只有 CLI Agent 配置，没有 Ask/API 配置和模板。
2. 输入区显示权限模式和紧凑的 Agent/模型入口。
3. 默认是“请求批准”；没有审批适配的 Provider 不会假装安全。
4. Codex、Claude Code、OpenCode 使用真实 workspace 和各自原生工具。
5. CLI 看不到 AnnotaMD edit/replace 工具，但能读取未保存正文、选区和批注。
6. 原生审批请求可在侧栏允许或拒绝，并继续同一 turn。
7. CLI 修改 Markdown 后 Muya 同步显示，本轮结束出现多文件 Diff。
8. 一键回退只在 hash 全部匹配时执行；冲突时不覆盖用户新修改。
9. 关闭文档不关闭 Agent；关闭 Agent 不停止 turn。
10. 定向单测、桌面端类型检查和真实 Electron 界面验收全部通过。

## 12. DBX 复用说明

继续复用 DBX 的 CLI 检测、Provider 图标、模型发现、JSON/JSONL 解析、会话/历史交互和错误分类。DBX 当前的一次性、禁原生工具运行方式不用于新的权限和编辑链路；审批与原生工具必须由新的 Provider runtime adapter 完成。

复制或修改 DBX 代码时保留 Apache-2.0 来源与许可，不复制数据库、SQL、Tauri 宿主或品牌资产。
