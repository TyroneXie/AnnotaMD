# Markdown Reader — 架构文档

## 1. 架构总览

采用 SwiftUI 原生的声明式架构，遵循 MVVM 模式。应用以单窗口为主，自定义两列布局（HStack + DragGesture）。窗口使用 `.windowStyle(.hiddenTitleBar)` 隐藏系统标题栏，通过自定义 TitleBar 视图实现工具栏功能。使用 `@Observable` (macOS 15.0+) 进行状态管理，Swift 6.0 严格并发。

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ ◉ ◉  ┌─ Sidebar ──┐  ┌──── Detail Area ──────────────┐│
│          │ ▼ 📁 docs   │  │  TitleBar (50px)              ││
│          │   📄 readme │  │  [≡]  [渲染|原文]  [📂 Open]   ││
│          │   📷 logo   │  ├────────────────────────────────┤│
│          │ ▶ 📁 design │  │                                ││
│          │ 📄 index    │  │  Content View (渲染/原文)       ││
│          │             │  │                                ││
│          │  [Settings] │  │                                ││
│          └─────↕───────┘  └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘

布局结构：
ContentView (HStack)
  ├── SidebarView (条件渲染，isSidebarVisible 控制显隐)
  ├── ResizeHandle (1px 分隔线 + DragGesture，拖拽热区 8px)
  └── DetailView (圆角容器，左上/左下圆角)
        ├── TitleBar (自定义，50px)
        └── ContentArea (渲染/原文视图)
```

## 2. 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| UI 框架 | SwiftUI | macOS 原生，声明式，与 Textual 无缝集成 |
| Markdown 渲染 | Textual (gonzalezreal/textual v0.3.1+) | MarkdownUI 的官方继任者，使用 Foundation AttributedString 原生解析（无 cmark-gfm 依赖），原生支持文本选择和语法高亮 |
| 目录树 | SwiftUI List + OutlineGroup | 原生树形展示方案 |
| 布局 | 自定义 HStack + DragGesture | 支持自定义拖拽阈值（140px 自动隐藏）、单文件模式无 Sidebar、圆角 Detail 区域；NavigationSplitView 无法满足这些需求 |
| 窗口样式 | .windowStyle(.hiddenTitleBar) | 支持自定义 TitleBar 视图和圆角 Detail 区域；系统 NSToolbar 无法实现 Buddy 风格布局 |
| 文件系统 | FileManager + URL | 原生文件访问 |
| 异步 | Swift Concurrency (async/await) | 现代异步方案，Swift 6 严格并发检查 |
| 状态管理 | @Observable (macOS 15.0+) | macOS 15.0 原生支持，更简洁的观察机制 |

## 3. 模块划分

### 3.1 App 层

- **MarkdownReaderApp**: 应用入口，WindowGroup 配置（`.windowStyle(.hiddenTitleBar)` + `.defaultSize(width: 900, height: 600)`），最低部署目标 macOS 15.0

### 3.2 视图层 (Views)

| 视图 | 职责 |
|------|------|
| ContentView | 主视图，管理自定义 HStack 两列布局 + ResizeHandle |
| SidebarView | 左侧目录树，展示文件结构 |
| FileRowView | 目录树中单个文件/目录行 |
| TitleBarView | 自定义标题栏（50px），包含 Sidebar 切换、文件名、渲染/原文 Picker、Open 按钮 |
| ResizeHandle | Sidebar 边缘分隔线 + 拖拽调整宽度（1px 分隔线 + 8px 拖拽热区） |
| DetailView | 右侧主体区容器（圆角），包含 TitleBar 和内容区 |
| RenderedMarkdownView | Markdown 渲染显示视图 |
| SourceMarkdownView | Markdown 原文显示视图 |
| WelcomeView | 空状态占位视图，提示用户打开目录 |
| ErrorView | 错误提示视图（文件读取失败等） |

### 3.3 视图模型层 (ViewModels)

| ViewModel | 职责 |
|-----------|------|
| AppViewModel | 全局状态：rootDirectory, selectedFile, isSidebarVisible, sidebarWidth（使用 @Observable） |
| FileTreeViewModel | 管理目录树数据，文件扫描，目录展开/折叠状态 |
| DocumentViewModel | 管理当前文档状态，文件读取，渲染/原文切换 |

### 3.4 模型层 (Models)

| Model | 职责 |
|-------|------|
| FileNode | 文件/目录节点模型（name, path, isDirectory, isMarkdown, children） |
| Document | 当前文档模型（content, filePath, displayMode） |
| DisplayMode | 枚举：.rendered / .source |

### 3.5 服务层 (Services)

| Service | 职责 |
|---------|------|
| FileService | 文件系统操作：扫描目录、读取文件内容 |

## 4. 数据流

```
用户操作 → View → ViewModel → Service → 文件系统
                  ↑
                  └── State 更新 → View 刷新
```

1. 用户在 SidebarView 点击文件 → FileTreeViewModel 更新选中状态
2. DocumentViewModel 监听选中变化 → FileService 读取文件内容
3. DocumentViewModel 更新 document 状态 → DetailView 刷新显示
4. 用户切换渲染/原文 → DocumentViewModel 更新 displayMode → DetailView 切换子视图
5. 用户拖拽 ResizeHandle → AppViewModel 更新 sidebarWidth，低于 140px 阈值时 isSidebarVisible = false
6. 用户点击 TitleBar Sidebar 按钮 / Cmd+\ → AppViewModel 切换 isSidebarVisible → HStack 条件渲染 SidebarView

## 5. 依赖关系

```
MarkdownReaderApp (.windowStyle(.hiddenTitleBar))
  └── ContentView (HStack)
        ├── SidebarView (if isSidebarVisible)
        │     ├── FileRowView
        │     └── FileTreeViewModel (@Observable) → FileService
        ├── ResizeHandle (1px 分隔线 + DragGesture)
        └── DetailView (圆角容器)
              ├── TitleBarView (自定义标题栏)
              ├── RenderedMarkdownView
              ├── SourceMarkdownView
              ├── WelcomeView
              ├── ErrorView
              └── DocumentViewModel (@Observable) → FileService

AppViewModel (@Observable)
  ├── rootDirectory: URL?
  ├── selectedFile: FileNode?
  ├── isSidebarVisible: Bool
  └── sidebarWidth: CGFloat
```

外部依赖：
- Textual: `https://github.com/gonzalezreal/textual` v0.3.1+ (SPM)
  - 许可证：MIT
  - Swift 6.0 + macOS 15.0+
  - 依赖：swift-concurrency-extras, swiftui-math
  - Markdown 解析基于 Foundation AttributedString（无 cmark-gfm 依赖）
  - 内置语法高亮、文本选择、数学公式支持

## 6. 关键设计决策

| 决策 | 选择 | 备选 | 理由 |
|------|------|------|------|
| 布局方案 | 自定义 HStack + DragGesture | NavigationSplitView | 支持自定义拖拽阈值（140px 自动隐藏 Sidebar）、单文件模式无 Sidebar、圆角 Detail 区域 |
| 窗口样式 | .windowStyle(.hiddenTitleBar) + 自定义 TitleBarView | 系统 NSToolbar (.toolbar) | 支持圆角 Detail 区域和自定义拖拽区域；系统 .toolbar 无法实现 Buddy 风格布局 |
| Markdown 渲染 | Textual (v0.3.1+) | MarkdownUI / 自研渲染 | MarkdownUI 的官方继任者，Foundation AttributedString 原生解析（无 cmark-gfm 依赖），原生文本选择 |
| 状态管理 | @Observable (macOS 15.0+) | ObservableObject | macOS 15.0 原生支持，更简洁，无需 @Published |
| 目录树渲染 | OutlineGroup | 递归 List | OutlineGroup 专为树形数据设计 |
| 非 .md 文件展示 | 灰显显示 | 完全过滤 | 让用户看到完整目录结构，但明确标识不可预览 |

## 7. 已知注意事项

- **视图重建**：同一类型视图替换内容时 SwiftUI 可能不触发 `.onAppear`，需用 `.id(fileURL)` 强制重建视图
- **Textual v0.x API 稳定性**：Textual 处于 v0.x 阶段，API 可能有小幅变化；锁定小版本号 `.upToNextMinor(from: "0.3.1")`
- **Textual 大文件性能**：使用 Foundation AttributedString 原生解析，理论上优于 cmark-gfm，但需实测 500KB+ 文件的滚动性能
- **Swift 6 严格并发**：需处理 Sendable 合规性和 actor 隔离，ViewModel 需标注 `@MainActor`
- **自定义布局窗口 resize 状态同步**：窗口 resize 时 DragGesture 的 translation 计算需基于窗口宽度差值，避免 sidebarWidth 累积偏移
- **全屏模式适配**：`.hiddenTitleBar` 模式下全屏时需处理红绿灯行为（红绿灯区域宽度从 76px 变为 32px）和 TitleBar 的自动隐藏/显示
