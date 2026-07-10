# Code Language Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Feishu-style, common-first code language picker with plain text, full search, expandable uncommon languages, and non-empty icon fallbacks.

**Architecture:** Keep Prism as the source of truth. Add pure language-list helpers to the Prism utility, keep picker-only row/category logic beside the picker, and reuse the existing selector mutation path so choosing plain text simply writes an empty language.

**Tech Stack:** TypeScript, Muya, Snabbdom, PrismJS, Fuse.js, Vitest, CSS.

## Global Constraints

- Preserve every Prism grammar as an independent syntax choice.
- Do not add a new icon dependency.
- Keep the default menu compact and searchable.
- Implement with failing tests before production changes.

---

### Task 1: Language groups

**Files:**
- Modify: `packages/muya/src/utils/prism/index.ts`
- Test: `packages/muya/src/utils/prism/__tests__/languageList.spec.ts`

- [ ] Add failing tests for `Plain Text`, the 20-language common list, uncommon exclusions, and full-catalogue search.
- [ ] Run the focused Vitest file and confirm the new tests fail for missing exports/behavior.
- [ ] Implement `listCommonLanguages` and `listAdditionalLanguages` with Prism as the source of truth.
- [ ] Run the focused test and confirm it passes.

### Task 2: Picker rows and fallback categories

**Files:**
- Create: `packages/muya/src/ui/codeBlockLanguageSelector/languageItems.ts`
- Create: `packages/muya/src/ui/codeBlockLanguageSelector/__tests__/languageItems.spec.ts`

- [ ] Add failing tests for the expand row and code/markup/query/config/plain categories.
- [ ] Run the focused Vitest file and confirm failure.
- [ ] Implement pure picker-row and category helpers.
- [ ] Run the focused test and confirm it passes.

### Task 3: Selector interaction and visual treatment

**Files:**
- Modify: `packages/muya/src/ui/codeBlockLanguageSelector/index.ts`
- Modify: `packages/muya/src/ui/codeBlockLanguageSelector/index.css`
- Modify: `packages/muya/src/block/content/langInputContent/index.ts`
- Modify: `packages/muya/src/block/commonMark/codeBlock/__tests__/copyButton.spec.ts`
- Modify: `packages/muya/src/locales/*.ts`

- [ ] Add a failing focus-event test proving the language input opens the picker.
- [ ] Run the focused test and confirm failure.
- [ ] Wire common/default, expanded, and search states into the selector; localize plain/more/no-results labels.
- [ ] Render existing icons first and compact category fallbacks otherwise.
- [ ] Emit the picker event when the language input receives focus.
- [ ] Run focused tests and confirm they pass.

### Task 4: Verification

**Files:**
- No production changes expected.

- [ ] Run all affected Muya tests.
- [ ] Run desktop AnnotaMD unit tests and `vue-tsc`.
- [ ] Open `design.md` in the Electron dev app.
- [ ] Verify default/common rows, more expansion, uncommon search, icon coverage, localization, and keyboard navigation through CDP and a screenshot.

