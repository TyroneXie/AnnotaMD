# Changelog

## 2.3.0 - 2026-07-15

### Added

- Added table column resizing by dragging any column boundary horizontally.
- Added a dashed content-edge guide and magnetic snapping when the table's right edge approaches the editor's maximum text width.

### Changed

- Kept every cell in a resized column synchronized through a shared table column layout.
- Kept narrow resized columns usable with a minimum width and safe text wrapping.
- Kept column resizing as a session-level visual adjustment without changing the Markdown source.

## 2.2.0 - 2026-07-13

### Added

- Added Feishu-inspired block menus, text formatting toolbars, table controls, and consistent icon tooltips.
- Added selection and document comments stored outside Markdown, including comment highlights and direct navigation.
- Added richer code-block controls, diagram view controls, image preview improvements, and sticky table headers.
- Added a first-run/open-file experience, multi-folder sidebar improvements, and clearer open-file tabs.
- Added a draggable, persistent-width comment pane.

### Changed

- Unified action icons and interaction styling across text, table, block, image, and preview toolbars.
- Improved table row/column selection, movement, resizing, overflow behavior, and responsive layouts.
- Improved editor, sidebar, settings, search, and empty-state styling for a more compact AnnotaMD interface.
- Replaced remaining user-facing MarkText branding and paths with AnnotaMD equivalents where migrated.

### Fixed

- Fixed comment positioning, selection highlighting, diagram fullscreen overlays, and toolbar layering issues.
- Fixed first-tab visibility, persisted sidebar defaults, application data paths, and packaged-build layout differences.

## 2.0.0 - 2026-07-10

- 基于 Electron、Vue 与 Muya 重构 AnnotaMD V2。
- 默认提供所见即所得的 Markdown 快编辑体验。
- 新增多文件夹工作区、多标签页、文件树和大纲导航。
- 新增选区批注、全文批注及本地批注存储。
- 新增飞书风格的块菜单、浮动格式工具栏和三栏界面。
- 改进代码块语言选择、行号、自动换行和复制操作。
- 改进 Mermaid 图表视图、全屏缩放和背景色控制。
- 改进表格横向滚动、标题行吸顶和窄窗口适配。
- 统一设置页样式、中英文界面和 AnnotaMD 品牌信息。
- 修复安装包、应用窗口和关于页面误用 MarkText 图标的问题，统一使用 AnnotaMD 品牌图标。
- 修复发布版继承 MarkText 旧布局状态、首次启动不显示左侧边栏的问题。
