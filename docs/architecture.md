# Markdown Reader — 架构文档

## 1. 架构总览

采用 SwiftUI 原生的声明式架构，遵循 MVVM 模式。应用以单窗口为主，两列布局（NavigationSplitView）。ViewModel 使用 `ObservableObject` + `@Published` 以兼容 macOS 13.0。

```
┌──────────────────────────────────────────────┐
│                  App (MarkdownReaderApp)      │
│  ┌────────────┐  ┌──────────────────────────┐│
│  │  Sidebar    │  │  Detail Area             ││
│  │            │  │  ┌──────────────────────┐ ││
│  │  目录树     │  │  │  Toolbar            │ ││
│  │  FileTree  │  │  │  [渲染] [原文] 切换  │ ││
│  │  View      │  │  ├──────────────────────┤ ││
│  │            │  │  │  Content View       │ ││
│  │            │  │  │  (渲染/原文)         │ ││
│  │            │  │  │                     │ ││
│  └────────────┘  │  └──────────────────────┘ ││
│                  └──────────────────────────┘│
└──────────────────────────────────────────────┘
```

## 2. 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| UI 框架 | SwiftUI | macOS 原生，声明式，与 MarkdownUI 无缝集成 |
| Markdown 渲染 | MarkdownUI (gonzalezreal/swift-markdown-ui v2.4.0+) | 成熟的 SwiftUI Markdown 渲染库，支持 GFM；注意该项目已进入维护模式，后续可迁移至 Textual |
| 目录树 | SwiftUI List + OutlineGroup | 原生树形展示方案 |
| 布局 | NavigationSplitView | macOS 标准两列布局，内置 Sidebar 显隐 |
| 文件系统 | FileManager + URL | 原生文件访问 |
| 异步 | Swift Concurrency (async/await) | 现代异步方案 |
| 状态管理 | ObservableObject + @Published | 兼容 macOS 13.0；后续可迁移至 @Observable (macOS 14+) |

## 3. 模块划分

### 3.1 App 层

- **MarkdownReaderApp**: 应用入口，WindowGroup 配置

### 3.2 视图层 (Views)

| 视图 | 职责 |
|------|------|
| ContentView | 主视图，管理 NavigationSplitView 两列布局 |
| SidebarView | 左侧目录树，展示文件结构 |
| FileRowView | 目录树中单个文件/目录行 |
| DetailView | 右侧主体区容器，包含工具栏和内容区 |
| RenderedMarkdownView | Markdown 渲染显示视图 |
| SourceMarkdownView | Markdown 原文显示视图 |
| WelcomeView | 空状态占位视图，提示用户打开目录 |
| ErrorView | 错误提示视图（文件读取失败等） |

### 3.3 视图模型层 (ViewModels)

| ViewModel | 职责 |
|-----------|------|
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

## 5. 依赖关系

```
MarkdownReaderApp
  └── ContentView
        ├── SidebarView
        │     ├── FileRowView
        │     └── FileTreeViewModel (ObservableObject) → FileService
        └── DetailView
              ├── RenderedMarkdownView
              ├── SourceMarkdownView
              ├── WelcomeView
              ├── ErrorView
              └── DocumentViewModel (ObservableObject) → FileService
```

外部依赖：
- MarkdownUI: `https://github.com/gonzalezreal/swift-markdown-ui` v2.4.0+ (SPM)
  - 许可证：MIT
  - 最低 macOS 12.0（GFM 表格等特性需 macOS 13.0+）
  - 注意：项目已进入维护模式，作者已启动继任项目 Textual

## 6. 关键设计决策

| 决策 | 选择 | 备选 | 理由 |
|------|------|------|------|
| 布局方案 | NavigationSplitView | 自定义 HSplitView | 原生支持 Sidebar 显隐，符合 macOS 标准 |
| Markdown 渲染 | MarkdownUI (v2.4.0+) | 自研 AttributedString / Textual | 功能完善，支持 GFM 扩展；Textual 尚未成熟，首版用 MarkdownUI |
| 状态管理 | ObservableObject | @Observable (macOS 14+) | 兼容 macOS 13.0 最低版本要求；后续可迁移 |
| 目录树渲染 | OutlineGroup | 递归 List | OutlineGroup 专为树形数据设计 |
| 非 .md 文件展示 | 灰显显示 | 完全过滤 | 让用户看到完整目录结构，但明确标识不可预览 |

## 7. 已知注意事项

- **NavigationSplitView 内容替换问题**：同一类型视图替换内容时 SwiftUI 可能不触发 `.onAppear`，需用 `.id(fileURL)` 强制重建视图
- **MarkdownUI cmark-gfm 冲突**：若项目同时依赖 `apple/swift-markdown`，可能产生 cmark-gfm 目标命名冲突（MarkdownUI Issue #306）
- **MarkdownUI 维护状态**：项目处于维护模式，新功能开发已转移到 Textual；首版使用 MarkdownUI，后续迭代评估迁移
