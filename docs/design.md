# Markdown Reader — 设计文档

## 1. 设计参考

主界面布局参考 [Buddy macOS](/Users/david/project/github/buddy/buddy-macos) 的设计风格：
- 左侧 Sidebar 通顶通底，可拖拽调整宽度，可隐藏
- 右侧主内容区有圆角（左上、左下），视觉上与 Sidebar 分离
- 自定义 TitleBar（50px），内嵌功能按钮，不使用系统 NSToolbar
- 主题系统基于少量基础色派生语义 token，支持深色/浅色模式

与 Buddy 的差异：
- Markdown Reader 是 SwiftUI 原生应用（非 Electron），使用 NavigationSplitView
- 无右侧状态栏，仅两列布局
- 目录树替代任务列表

## 2. 界面布局

### 2.1 主窗口（目录已打开）

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ ◉ ◉  ┌─ Sidebar ──┐  ┌──── Detail Area ──────────────┐│
│          │ ▼ 📁 docs   │  │  TitleBar (50px)              ││
│          │   ▼ 📁 dev  │  │  [≡]  [渲染|原文]  [📂 Open]  ││
│          │     📄 api  │  ├────────────────────────────────┤│
│          │     📄 setup│  │                                ││
│          │   📄 readme │  │   # Welcome to Markdown Reader ││
│          │ ▶ 📁 design │  │                                ││
│          │ 📄 index    │  │   This is a **markdown** doc.  ││
│          │ 📷 logo.png │  │                                ││
│          │             │  │   - Feature one                ││
│          │             │  │   - Feature two                ││
│          │  [Settings] │  │                                ││
│          └─────↕───────┘  └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

关键视觉特征（参考 Buddy）：
- Sidebar 使用较深的背景色（.sidebar 背景）
- 右侧主区域使用 `bg-elevated` 稍亮的背景色，左上角和左下角带圆角
- Sidebar 和 Detail 之间有细微的 border 分隔线
- TitleBar 区域是拖拽区域（drag region），按钮为 no-drag

### 2.2 主窗口（首次启动 / 空状态）

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ ◉ ◉    Markdown Reader                                  │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   (隐藏)     │              📂                              │
│              │                                              │
│              │      Open a folder to get started            │
│              │                                              │
│              │      Press Cmd+O or click Open in toolbar    │
│              │                                              │
│              │                                              │
│              │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 2.3 窗口尺寸

- 默认宽度：900pt
- 默认高度：600pt
- Sidebar 默认宽度：240pt（与 Buddy 一致）
- Sidebar 最小宽度：150pt
- Sidebar 最大宽度：400pt
- 主体区最小宽度：400pt
- TitleBar 高度：50pt

## 3. 组件设计

### 3.1 Sidebar 目录树

**视觉规范（参考 Buddy Sidebar）：**
- 使用系统标准 Sidebar 样式（.sidebar）
- 顶部红绿灯区域 + 收起按钮（50px，与 TitleBar 对齐）
- 底部固定区域：Settings 按钮（参考 Buddy 底部固定设置入口）
- 中间区域：目录树列表，可滚动
- 目录图标：`folder.fill`（展开）/ `folder`（折叠）
- Markdown 文件图标：`doc.text`
- 非 Markdown 文件：`doc`，文字灰显（.secondary foregroundStyle）
- 当前选中行：系统高亮色背景（.bg-subtle）
- 行高：跟随系统默认

**Sidebar 宽度调整（参考 Buddy ResizeHandle）：**
- Sidebar 右边缘有拖拽手柄
- 拖拽可实时调整宽度（150pt ~ 400pt）
- 拖过 140px 阈值 → 自动隐藏 Sidebar
- 隐藏后恢复宽度为 240pt 默认值

**交互：**
- 单击文件 → 右侧显示内容
- 单击目录 → 展开/折叠
- ↑↓ 键 → 在目录树中移动选中项
- Enter 键 → 打开文件/展开目录
- Sidebar 显隐切换：TitleBar 按钮（`sidebar.leading`）或 `Cmd+\`

### 3.2 TitleBar（参考 Buddy TitleBar）

自定义 TitleBar（50px），不使用系统 NSToolbar。使用 SwiftUI `.toolbar` modifier 配合 `ToolbarItem` 实现。

```
┌─────────────────────────────────────────────────────────────┐
│  [红绿灯占位] [≡ Sidebar]    文件名    [渲染|原文]  [📂 Open] │
└─────────────────────────────────────────────────────────────┘
```

**布局逻辑（参考 Buddy）：**
- 左侧：红绿灯占位区（非全屏 76px / 全屏 32px）+ Sidebar 切换按钮
- 中间：当前文件名（truncate，左对齐）
- 右侧：渲染/原文切换 Picker + Open 按钮

**Sidebar 关闭时：**
- 红绿灯占位移到 Detail 区域左上角
- Sidebar 切换按钮移到 TitleBar 左侧显示

**渲染/原文切换：**
- 使用 `Picker` 控件，Segmented 样式
- 两个选项：「渲染」和「原文」
- 默认选中「渲染」
- 仅在有文件选中时可用，否则灰显

### 3.3 渲染视图

- 使用 MarkdownUI 的 `Markdown` 视图渲染内容
- 支持标准 Markdown + GFM 扩展（表格、任务列表、删除线等）
- 自适应深色/浅色模式
- 代码块语法高亮（MarkdownUI 内置支持）
- 链接点击 → 在系统默认浏览器中打开（通过 `OpenURLAction`）
- 使用 `.id(fileURL)` 确保文件切换时视图正确重建
- 内容区有适当的 padding（参考 Buddy 的 message-body 样式）

**Markdown 内容排版规范（参考 Buddy globals.css）：**
- 行高：1.6
- 段落间距：8px
- 标题 margin-top：12px，margin-bottom：6px
- 代码块：圆角 6px，padding 10px 12px
- 表格：border-collapse，padding 4px 8px
- 引用块：左边框 3px solid，padding 2px 10px

### 3.4 原文视图

- 使用等宽字体（SF Mono）
- 默认启用 Word Wrap（不出现横向滚动条）
- 支持文本选择和复制
- 行号显示（P2）
- 语法高亮（P2）
- 字体大小：13px（参考 Buddy 代码块字号）

### 3.5 Welcome 视图

- 居中显示应用图标 + 提示文字
- 主文字：「Open a folder to get started」
- 副文字：「Press Cmd+O or click Open in toolbar」
- 提供 Open 按钮直接触发打开对话框

### 3.6 Error 视图

- 显示错误类型图标（SF Symbol: exclamationmark.triangle）
- 显示错误描述文字
- 场景：文件权限不足、编码异常、非 Markdown 文件点击

## 4. 交互设计

### 4.1 快捷键

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Cmd+O` | 打开目录/文件 | 系统标准打开对话框 |
| `Cmd+\` | 切换 Sidebar 显隐 | 避免与 Cmd+S（保存）冲突，VS Code 风格 |
| `Cmd+Shift+E` | 切换到渲染视图 | 应用内快捷键 |
| `Cmd+Shift+R` | 切换到原文视图 | 应用内快捷键 |
| `Cmd+F` | 文件内搜索（P2） | |

> 注意：原方案中 `Cmd+1/Cmd+2` 与 macOS Mission Control 快捷键冲突，已改为 `Cmd+Shift+E/R`。

### 4.2 拖拽交互（P2）

- 拖拽目录到窗口 → 以该目录为根打开
- 拖拽文件到窗口 → 直接打开文件

### 4.3 窗口标题

- 无目录打开时：`Markdown Reader`
- 目录已打开时：`Markdown Reader — <目录名>`

## 5. 状态管理

### 5.1 全局状态

```
AppState
  ├── rootDirectory: URL?          // 当前打开的根目录
  ├── selectedFile: FileNode?      // 当前选中的文件
  ├── isSidebarVisible: Bool       // Sidebar 是否可见
  └── sidebarWidth: CGFloat        // Sidebar 当前宽度
```

### 5.2 文档状态

```
DocumentState
  ├── content: String              // 文件原始内容
  ├── filePath: URL                // 文件路径
  ├── displayMode: DisplayMode     // .rendered | .source
  └── error: FileError?           // 读取错误（如有）
```

### 5.3 目录树状态

```
FileTreeState
  ├── nodes: [FileNode]            // 目录树数据
  ├── expandedDirs: Set<URL>       // 已展开的目录
  └── selectedFileURL: URL?        // 当前选中的文件 URL
```

## 6. 配色与主题

### 6.1 主题策略

首版遵循 macOS 系统主题（浅色/深色自动切换），不实现自定义主题切换。后续迭代可参考 Buddy 的主题派生系统（基于 surface/ink/accent/success/danger 五色派生 20+ 语义 token）。

### 6.2 语义色值

| 语义 Token | 浅色模式 | 深色模式 | 用途 |
|------------|----------|----------|------|
| bg | 系统 Sidebar 背景 | 系统 Sidebar 背景 | Sidebar 背景 |
| bg-elevated | 白色偏灰 (#f3f3f1) | 深灰 (#1e1e20) | Detail 区域背景 |
| bg-subtle | 选中态背景 | 选中态背景 | 选中行高亮 |
| fg | 近黑 (#1c1c1a) | 近白 (#e8e8e3) | 主文字 |
| fg-secondary | 65% ink | 65% ink | 次要文字 |
| fg-muted | 45% ink | 42% ink | 灰显文字 |
| border | 6% ink alpha | 6% ink alpha | 分隔线 |
| accent | 系统蓝色 | 系统蓝色 | 链接、强调色 |

### 6.3 非 Markdown 文件

- 文字使用 `.secondary` 前景色灰显
- 图标使用 `doc` SF Symbol

## 7. 图标与视觉资产

- 应用图标：后续设计
- 文件/目录图标：使用 SF Symbols
  - 目录（展开）：`folder.fill`
  - 目录（折叠）：`folder`
  - Markdown 文件：`doc.text`
  - 其他文件：`doc`（灰显）

## 8. 动效

- Sidebar 显隐：系统默认动画（与 NavigationSplitView 一致）
- 文件切换：无特殊动画，直接替换内容
- 选中行高亮：系统默认过渡
