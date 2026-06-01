# Markdown Reader — 开发计划

## 1. 里程碑概览

| 阶段 | 内容 | 预计工时 |
|------|------|----------|
| M1 | 项目初始化 + 基础框架 + 打开目录 | 1-1.5天 |
| M2 | Sidebar 目录树 | 1-2天 |
| M3 | Markdown 渲染显示 | 1天 |
| M4 | 原文视图 + 渲染/原文切换 | 0.5-1天 |
| M5 | 集成测试 + 优化 | 1天 |

**总计预估：4.5-6.5天**

## 2. 详细计划

### M1：项目初始化 + 基础框架 + 打开目录

**目标：** 创建 Xcode 项目，集成依赖，搭建基础布局，实现打开目录功能

- [ ] 创建 SwiftUI macOS 项目（MarkdownReader）
- [ ] 配置 SPM 依赖：MarkdownUI (gonzalezreal/swift-markdown-ui v2.4.0+)
- [ ] 设置最低部署目标：macOS 13.0
- [ ] 创建 NavigationSplitView 两列布局骨架
- [ ] 创建基础 Model：FileNode, Document, DisplayMode
- [ ] 创建基础 ViewModel：FileTreeViewModel, DocumentViewModel（使用 ObservableObject）
- [ ] 创建 FileService
- [ ] 实现打开目录功能（Cmd+O，NSOpenPanel）
- [ ] 创建 WelcomeView 空状态视图
- [ ] 窗口标题显示逻辑

**交付物：** 可运行的应用，能打开目录，显示 Welcome 空状态，两列布局可见

### M2：Sidebar 目录树

**目标：** 实现完整的目录树导航功能

- [ ] FileService 实现目录扫描（递归遍历，.md 文件正常显示，非 .md 文件灰显）
- [ ] FileNode 构建树形结构（添加 isMarkdown 属性）
- [ ] SidebarView 使用 OutlineGroup 渲染目录树
- [ ] 点击文件切换选中状态
- [ ] 点击目录展开/折叠
- [ ] Sidebar 显隐切换（工具栏按钮 + Cmd+\）
- [ ] 当前选中行高亮
- [ ] SF Symbols 图标（folder/doc.text/doc）
- [ ] 非 .md 文件灰显样式
- [ ] 键盘导航（↑↓ 移动选中，Enter 打开/展开）
- [ ] 空目录状态提示

**交付物：** 可浏览目录树，键盘/鼠标均可导航

### M3：Markdown 渲染显示

**目标：** 实现右侧 Markdown 渲染显示

- [ ] DocumentViewModel 读取文件内容（含错误处理）
- [ ] 选中文件时自动加载内容
- [ ] RenderedMarkdownView 使用 MarkdownUI 渲染
- [ ] 支持 GFM 扩展（表格、任务列表等）
- [ ] 适配深色/浅色模式
- [ ] 链接点击在默认浏览器打开
- [ ] 使用 `.id(fileURL)` 确保视图正确重建
- [ ] 滚动视图支持
- [ ] ErrorView 错误提示视图

**交付物：** 点击文件可看到渲染后的 Markdown 内容，链接可点击

### M4：原文视图 + 渲染/原文切换

**目标：** 实现原文视图和工具栏切换

- [ ] SourceMarkdownView 等宽字体（SF Mono）显示原文
- [ ] Word Wrap 默认启用
- [ ] 文本选择和复制支持
- [ ] 窗口级工具栏：Segmented Picker（渲染/原文）
- [ ] 工具栏 Sidebar 显隐按钮
- [ ] 工具栏 Open 按钮
- [ ] 切换渲染/原文视图
- [ ] 快捷键：Cmd+Shift+E / Cmd+Shift+R 切换

**交付物：** 完整的核心功能可用，可在渲染和原文间切换

### M5：集成测试 + 优化

**目标：** 确保应用稳定可用

- [ ] 大文件滚动性能测试（500KB Markdown 文件，60fps 目标）
- [ ] 深色/浅色模式切换测试
- [ ] 边界情况处理（空目录、权限问题、编码异常、非 .md 文件点击）
- [ ] 窗口尺寸约束验证
- [ ] 快捷键功能验证
- [ ] 键盘导航全流程验证
- [ ] Model / ViewModel 基础单元测试
- [ ] 修复发现的问题

**交付物：** 可发布的首版应用

## 3. 后续迭代（不在首版范围）

- P2：拖拽打开、原文语法高亮、搜索、最近打开记录、原文行号显示
- P3：全文搜索、导出 PDF
- 未来：评估从 MarkdownUI 迁移至 Textual

## 4. 风险与注意事项

| 风险 | 影响 | 应对 |
|------|------|------|
| MarkdownUI 大文件性能 | 渲染卡顿 | 预加载测试（500KB 基准），必要时分块渲染 |
| OutlineGroup 大目录性能 | 目录树卡顿 | 懒加载子目录 |
| macOS 版本兼容性 | 低版本 API 不可用 | 明确最低 macOS 13.0，使用 ObservableObject 而非 @Observable |
| MarkdownUI 维护状态 | 未来无 bug 修复 | 首版用 MarkdownUI，后续评估迁移至 Textual |
| cmark-gfm 依赖冲突 | 与 apple/swift-markdown 冲突 | 首版不引入 swift-markdown，如需引入参考 Issue #306 |
| NavigationSplitView 视图复用 | 文件切换不触发 .onAppear | 使用 `.id(fileURL)` 强制重建 |
