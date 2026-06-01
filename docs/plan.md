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
- [ ] 配置 SPM 依赖：Textual (gonzalezreal/textual v0.3.1+)
- [ ] 设置最低部署目标：macOS 15.0
- [ ] 配置窗口样式：`.windowStyle(.hiddenTitleBar)` + `.defaultSize(width: 900, height: 600)`
- [ ] 创建自定义 HStack + DragGesture 两列布局骨架（含 ResizeHandle 分隔线）
- [ ] 创建基础 Model：FileNode, Document, DisplayMode
- [ ] 创建基础 ViewModel：AppViewModel, FileTreeViewModel, DocumentViewModel（使用 @Observable）
- [ ] 创建 FileService
- [ ] 实现打开目录功能（Cmd+O，NSOpenPanel）
- [ ] 创建 WelcomeView 空状态视图（全幅显示，无 Sidebar 区域）
- [ ] 窗口标题显示逻辑

**交付物：** 可运行的应用，能打开目录，显示 Welcome 空状态，两列布局可见

### M2：Sidebar 目录树

**目标：** 实现完整的目录树导航功能

- [ ] FileService 实现目录扫描（递归遍历，.md 文件正常显示，非 .md 文件灰显）
- [ ] FileNode 构建树形结构（添加 isMarkdown 属性）
- [ ] SidebarView 使用 OutlineGroup 渲染目录树
- [ ] 点击文件切换选中状态
- [ ] 点击目录展开/折叠
- [ ] Sidebar 显隐切换（TitleBar 按钮 + Cmd+\，HStack 条件渲染 + 动画）
- [ ] ResizeHandle：1px 分隔线 + 8px 拖拽热区，DragGesture 调整 sidebarWidth
- [ ] Sidebar 拖拽低于 140px 阈值自动隐藏，恢复默认 240pt
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
- [ ] RenderedMarkdownView 使用 Textual `StructuredText` 渲染
- [ ] 应用 `.textual.structuredTextStyle(.gitHub)` 预设风格
- [ ] 支持 GFM 扩展（表格、任务列表等）
- [ ] 适配深色/浅色模式
- [ ] 链接点击在默认浏览器打开
- [ ] 使用 `.id(fileURL)` 确保视图正确重建
- [ ] 滚动视图支持
- [ ] ErrorView 错误提示视图

**交付物：** 点击文件可看到渲染后的 Markdown 内容，链接可点击

### M4：原文视图 + 渲染/原文切换

**目标：** 实现原文视图和自定义 TitleBar 切换

- [ ] SourceMarkdownView 等宽字体（SF Mono）显示原文
- [ ] Word Wrap 默认启用
- [ ] 文本选择和复制支持
- [ ] 自定义 TitleBarView（50px）：Segmented Picker（渲染/原文）
- [ ] TitleBar 内 Sidebar 显隐按钮
- [ ] TitleBar 内 Open 按钮
- [ ] 切换渲染/原文视图
- [ ] 快捷键：Cmd+Shift+E / Cmd+Shift+R 切换

**交付物：** 完整的核心功能可用，可在渲染和原文间切换

### M5：集成测试 + 优化

**目标：** 确保应用稳定可用

- [ ] 大文件滚动性能测试（500KB Markdown 文件，验证 Textual 60fps 目标）
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

## 4. 风险与注意事项

| 风险 | 影响 | 应对 |
|------|------|------|
| Textual v0.x API 不稳定 | 升级时需适配代码 | 锁定小版本号 `.upToNextMinor(from: "0.3.1")`，关注 release notes |
| Textual 大文件性能 | 渲染卡顿 | 实测 500KB+ 文件性能，必要时大文件降级为原文视图 |
| OutlineGroup 大目录性能 | 目录树卡顿 | 懒加载子目录 |
| macOS 15.0+ 限制 | 缩小用户范围 | 目标用户为开发者，macOS 15 采用率 75-85%，可接受 |
| Swift 6 严格并发 | 编译错误 | ViewModel 标注 `@MainActor`，确保 Sendable 合规 |
| 自定义布局窗口 resize 状态同步 | DragGesture 偏移累积 | 基于 sidebarWidth 绝对值计算而非累加 translation |
| 全屏模式 TitleBar 适配 | 红绿灯行为异常 | 处理全屏模式下红绿灯区域宽度变化（76px → 32px） |
