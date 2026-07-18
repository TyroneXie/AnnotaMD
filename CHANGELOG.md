# Changelog

## 2.8.0 - 2026-07-18

### Added

- Added an Emoji block picker and reliable emoji insertion in WYSIWYG documents.
- Added rendered HTML block previews with safe handling for empty HTML blocks.
- Added eleven switchable action-icon themes backed by local official icon libraries, with a shared icon system across editor menus and toolbars.
- Added live theme previews and consolidated appearance controls for themes, language, typography, code blocks, and icon style.

### Changed

- Reorganized Settings into clearer Appearance, Editing, General, Image, and Custom CSS sections, with denser aligned controls and fewer redundant expert options.
- Unified paragraph, heading, quote, highlight, HTML, code, list, diagram, image, and toolbar block glyphs across quick-insert and block menus.
- Kept opened-file navigation synchronized with the active document and let the opened-file list use the available sidebar height.
- Distinguished copy, duplicate, insert, heading-level, and section-move actions in every icon theme so adjacent block-menu actions no longer reuse the same glyph.

### Fixed

- Fixed Emoji content disappearing after reopening a document.
- Fixed HTML and other rendered blocks exposing incorrect text-block controls or source-only presentation in WYSIWYG mode.
- Fixed heading block-menu labels and icons briefly overlapping while the pointer entered the paragraph gutter.
- Fixed settings list spacing and removed the obsolete sidebar exclude-pattern field.

## 2.7.1 - 2026-07-17

### Fixed

- Fixed a crash when deleting a table column after the table had been detached from the document, by guarding against null table/row references in the table row/column menu.

### Changed

- Redesigned README with a professional showcase hero image featuring feature callouts and app screenshot.

## 2.7.0 - 2026-07-16

### Added

- Added comment-card collision avoidance and direct visual association between annotated text and its corresponding comment.
- Added automatic disk saving by default in both WYSIWYG and source modes, with regression coverage for both editing paths.
- Added file sorting to the sidebar and scrollbar visibility to the View menu so frequently used display controls stay close to the document.

### Changed

- Reload externally modified files automatically without showing a confirmation prompt, while cancelling stale delayed saves before applying disk content.
- Default editor text to 15px and enable code-block line numbers by default across static, schema, renderer, and Muya configuration.
- Keep comments in the right rail and emphasize a comment only while its text or card is hovered, focused, or selected.
- Replace the ambiguous insert-above and insert-below block-menu glyphs with explicit block-and-plus direction icons.
- Reworked Settings into a denser, aligned layout with right-aligned controls, compact numeric steppers, clearer labels, and selectable light/dark themes.
- Removed redundant expert-facing save-delay and bulk-save controls while keeping reliable automatic saving with an internal delay.

### Fixed

- Fixed table column highlights and insertion guides remaining active after the pointer moved to the tab bar or outside the editor viewport.
- Fixed the settings window sometimes opening as a persistent blank white surface by waiting for its first rendered frame before showing it.

## 2.6.1 - 2026-07-16

### Changed

- Let compact table columns release unused width while preserving single-line header labels, reducing unnecessary horizontal scrolling.
- Kept narrow Mermaid and other rendered diagrams at their intrinsic size while continuing to shrink diagrams that exceed the editor width.

### Fixed

- Fixed sticky table headers drifting from the inner table boundary or using mismatched typography after columns become compact.
- Fixed off-screen code-block line numbers receiving negative offsets and leaking over unrelated rendered content.

## 2.6.0 - 2026-07-16

### Added

- Added four-corner proportional image resizing with persisted Markdown width, content-edge guidance, and magnetic full-width snapping.
- Added a Feishu-style image block affordance that appears over the actual image area and remains anchored to the paragraph gutter while resizing.
- Added ordinary single-click navigation for rendered web, local Markdown, and anchor links while preserving the existing safe desktop routing.

### Changed

- Centered standalone images by default and kept mixed inline images inline unless an explicit alignment is stored.
- Made editor font-size preferences apply consistently to table text, numbers, dates, and inline code.
- Replaced the selected-image darkening effect with a light outline and invisible in-frame corner resize targets.
- Moved image editing, toggleable inline/alignment, and deletion actions from the click toolbar into a dedicated vertical image block menu, with deletion kept last.

### Fixed

- Fixed image resize cursors appearing away from the visible bitmap and made the resize outline remain stable while moving between the image and corner targets.
- Fixed image paragraphs showing text-block `T` controls or duplicate controls from inactive editor instances, and kept the image block control reachable across the whole image row while moving to its menu.
- Fixed rendered links lacking a pointer cursor or requiring Cmd/Ctrl-click before opening their destination.

## 2.5.0 - 2026-07-15

### Added

- Added link creation to the shared inline toolbar for regular paragraphs, lists, and table cells.
- Added Feishu-style link editing for both visible text and destination, plus copy-link and copy-original-URL actions.

### Changed

- Kept Markdown delimiters hidden while editing rendered links, inline code, emphasis, strong text, strikethrough, and headings in WYSIWYG mode.
- Limited link display choices to the Markdown-backed link and title views instead of exposing unsupported card and preview modes.
- Unified action-icon sizing across inline, link, image, preview, and table toolbars, with refreshed edit, more, link-copy, and web-link shapes.
- Matched inline-code height to surrounding text and aligned strikethrough rules across prose and inline code.

### Fixed

- Fixed mismatched strikethrough baselines when a deleted range contains inline code.
- Fixed link actions being unavailable from paragraph and table-cell selection toolbars.

## 2.4.1 - 2026-07-15

### Fixed

- Fixed the code-block language picker automatically expanding the full Prism language catalogue when opened for an uncommon language.
- Reset the language picker to the common-language list every time it opens, while keeping the current uncommon language available as a single entry.

## 2.4.0 - 2026-07-15

### Added

- Added “Copy File Name” and “Copy Full Path” actions to editor-tab and opened-file context menus.
- Added continuous line numbers for every line in source mode.

### Changed

- Matched the source-mode editing width to the WYSIWYG editor's maximum text width.
- Removed block editing controls and the inner scrollbar from source mode.
- Always start new application sessions in WYSIWYG mode instead of restoring transient source, typewriter, or focus modes.

### Fixed

- Fixed Mermaid fenced blocks whose three-backtick closing fence is attached directly to a final statement such as `end`, so the diagram and following Markdown render correctly.

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
