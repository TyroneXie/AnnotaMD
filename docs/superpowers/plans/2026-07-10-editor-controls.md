# AnnotaMD Editor Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before reporting completion.

**Goal:** 实现已确认的代码块设置迁移、全局换行按钮、标题栏入口清理和可持久化文字颜色工具栏。

**Architecture:** 复用现有 Pinia 偏好与 Muya `setOptions` watcher；代码块仅新增 UI 事件桥接。颜色扩展现有 `Format` 的 HTML token 处理，避免额外文档模型。

**Tech Stack:** Vue 3、Pinia、Electron、Muya TypeScript、Snabbdom、Vitest、CSS。

## Global Constraints

- 保留“视图 → 源码模式”和现有快捷键。
- 每次启动默认快编辑，运行期间允许进入源码模式。
- 换行是全局持久偏好，不写入 Markdown。
- 颜色必须写入 Markdown 内联 HTML，并经过现有 sanitizer/renderer。
- 不重置、不覆盖当前工作区的其他未提交改动。

---

### Task 1: 迁移代码块设置

**Files:**
- Modify: `packages/desktop/src/renderer/src/prefComponents/editor/index.vue`
- Modify: `packages/desktop/src/renderer/src/prefComponents/markdown/index.vue`
- Modify: `packages/desktop/static/locales/en.json`
- Modify: `packages/desktop/static/locales/zh-CN.json`
- Test: `packages/desktop/test/unit/specs/annotamd-code-block-controls.spec.ts`

- [ ] 写静态结构测试，断言 Markdown 含行号/换行，Editor 不再含这两个控件。
- [ ] 运行测试并确认因控件仍在 Editor 而失败。
- [ ] 移动模板、store refs 和双语文案。
- [ ] 运行测试及 `vue-tsc --noEmit -p tsconfig.annotamd.json`。

### Task 2: 代码块换行按钮

**Files:**
- Modify: `packages/muya/src/block/commonMark/codeBlock/code.ts`
- Modify: `packages/muya/src/assets/styles/blockSyntax.css`
- Modify: `packages/muya/src/locales/en.ts`
- Modify: `packages/muya/src/locales/zh-CN.ts`
- Modify: `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue`
- Test: `packages/muya/src/block/commonMark/codeBlock/__tests__/copyButton.spec.ts`
- Test: `packages/desktop/test/unit/specs/annotamd-code-block-controls.spec.ts`

- [ ] 扩展代码块单测，断言换行按钮发出 `{ enabled: !current }` 且不影响复制。
- [ ] 运行单测并确认按钮不存在而失败。
- [ ] 渲染按钮、绑定事件并添加根节点驱动的激活样式。
- [ ] 在桌面编辑器监听事件并持久化 `wrapCodeBlocks`。
- [ ] 运行目标测试和类型检查。

### Task 3: 删除标题栏模式切换并固定启动模式

**Files:**
- Modify: `packages/desktop/src/renderer/src/components/titleBar/index.vue`
- Modify: `packages/desktop/src/main/windows/editor.ts`
- Test: `packages/desktop/test/unit/specs/annotamd-code-block-controls.spec.ts`

- [ ] 写测试，断言标题栏不含分段切换，菜单源码入口仍存在，启动 payload 固定为 false。
- [ ] 运行测试并确认失败。
- [ ] 删除模板、函数、import、样式；启动和 reload 均传 `sourceCodeModeEnabled: false`。
- [ ] 运行测试和类型检查。

### Task 4: 紧凑工具栏与颜色持久化

**Files:**
- Modify: `packages/muya/src/ui/inlineFormatToolbar/config.ts`
- Modify: `packages/muya/src/ui/inlineFormatToolbar/index.ts`
- Modify: `packages/muya/src/ui/inlineFormatToolbar/index.css`
- Modify: `packages/muya/src/block/base/format.ts`
- Modify: `packages/muya/src/locales/en.ts`
- Modify: `packages/muya/src/locales/zh-CN.ts`
- Test: `packages/muya/src/block/base/__tests__/formatToggle.spec.ts`
- Test: `packages/muya/src/ui/inlineFormatToolbar/__tests__/config.spec.ts`
- Test: `packages/desktop/test/unit/specs/annotamd-toolbar-style.spec.ts`

- [ ] 先写格式单测：应用、替换、清除字体色和背景色，生成目标 `<span style>`。
- [ ] 写配置/CSS 测试，断言两个色板入口和紧凑尺寸。
- [ ] 运行测试并确认失败原因是缺少颜色格式。
- [ ] 扩展 HTML token offset/format 匹配，增加 `format(type, value)` 和内联 span 生成。
- [ ] 渲染色板、默认色清除和激活状态，完成紧凑 CSS。
- [ ] 运行 Muya 目标测试、桌面测试和类型检查。

### Task 5: 实际应用验收

- [ ] 启动现有 Electron dev 服务并打开 `design.md`。
- [ ] 检查 Markdown 设置分组、代码块按钮、标题栏和工具栏。
- [ ] 应用颜色后读取编辑器 Markdown，确认包含目标 span；切源码再切回确认样式仍在。
- [ ] 运行完整目标测试、`vue-tsc`、`git diff --check`。
