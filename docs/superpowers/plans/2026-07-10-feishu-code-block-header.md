# Feishu-style Code Block Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible Markdown fence chrome with a unified Feishu-style code-block header and use the text cursor throughout the editable page.

**Architecture:** Keep fenced Markdown serialization and language metadata unchanged. Reuse Muya's existing editable `language-input` as the left header control, keep wrap/copy actions in the code node, and implement visibility/layout through scoped Muya CSS. Preserve pointer/grab cursors on interactive controls while the editor canvas inherits `cursor: text`.

**Tech Stack:** TypeScript, Muya, Snabbdom, CSS, Vue, Vitest.

## Global Constraints

- Do not add visible ``` markers or mutate Markdown content.
- The language input shows the localized `Code Block` placeholder only while empty and inactive.
- Wrap/copy controls appear only while the code block is hovered or active.
- The code header and body share one background and border.
- Existing syntax highlighting, language selection, copy, global wrap persistence, and line numbers remain functional.
- Interactive controls retain pointer/grab cursors; the editable canvas uses the text cursor.

---

### Task 1: Lock the DOM and interaction contract

**Files:**
- Modify: `packages/muya/src/block/commonMark/codeBlock/__tests__/copyButton.spec.ts`
- Modify: `packages/desktop/test/unit/specs/annotamd-code-block-controls.spec.ts`

- [ ] Add failing tests for a left editable language input, no language button in the right actions, hover-only action CSS, no fenced pseudo-elements, and an editor text cursor.
- [ ] Run the tests and verify they fail for the missing Feishu-style contract.

### Task 2: Implement the code-block header

**Files:**
- Modify: `packages/muya/src/block/content/langInputContent/index.ts`
- Modify: `packages/muya/src/block/commonMark/codeBlock/code.ts`
- Modify: `packages/muya/src/assets/styles/blockSyntax.css`

- [ ] Localize the empty language placeholder with `Code Block` and track whether the language input is active.
- [ ] Remove the right-side language button while preserving wrap/copy handlers.
- [ ] Remove fenced pseudo-markers and style the language input/actions as one background-integrated header.
- [ ] Run focused tests and verify language editing, copy, wrap, and serialization remain intact.

### Task 3: Apply the editor text cursor and visually verify

**Files:**
- Modify: `packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue`

- [ ] Set the editor canvas cursor to `text` while leaving interactive overrides unchanged.
- [ ] Run `vue-tsc`, targeted Vitest suites, and `git diff --check`.
- [ ] Open `design.md`, inspect empty/language code blocks, hover/reveal actions, and confirm computed cursor/action visibility.
