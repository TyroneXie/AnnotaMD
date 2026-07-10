# Multi-root Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one AnnotaMD editor window to mount, persist, watch, display, and safely detach multiple folders while preserving multi-file tabs and Finder open-file routing.

**Architecture:** Keep each root as an independent existing `TreeNode`, expose `projectTrees` as the canonical array, and retain a compatibility `projectTree` computed value for single-root consumers such as search and relative-image defaults. Mirror the same root array in `EditorWindow`, with one watcher per root and path-based routing of filesystem events. Finder file opens continue to use existing tab logic, but window scoring checks all mounted roots.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, Vitest, chokidar.

## Global Constraints

- Adding a folder appends it to the active window instead of replacing existing roots.
- Removing a folder only detaches/unwatches it; it never deletes disk content and never closes already-open tabs.
- Existing single-root buffered state remains restorable.
- Duplicate and nested roots are not added twice.
- Existing `openFilesInNewWindow` and `openFolderInNewWindow` preferences keep their meaning.

---

### Task 1: Pure multi-root helpers

**Files:**
- Create: `packages/desktop/src/renderer/src/store/projectRoots.ts`
- Test: `packages/desktop/test/unit/specs/project-roots.spec.ts`

- [ ] Write failing tests for normalize/dedupe, nested-root rejection, path-to-root lookup, and legacy buffer migration.
- [ ] Run the test and verify failure because helpers do not exist.
- [ ] Implement `addProjectRoot`, `removeProjectRoot`, `findProjectRootForPath`, and `readBufferedProjectRoots`.
- [ ] Run the test and verify all helper tests pass.

### Task 2: Renderer project store

**Files:**
- Modify: `packages/desktop/src/renderer/src/store/project.ts`
- Modify: `packages/desktop/src/renderer/src/store/editor.ts`

- [ ] Add failing static/store tests for `projectTrees`, append semantics, per-path watcher event routing, removal, and buffered `rootDirectories`.
- [ ] Implement canonical `projectTrees`, compatibility `projectTree`, append/remove actions, and root-array persistence.
- [ ] Route each filesystem event to the matching root by pathname.
- [ ] Verify project tests and TypeScript.

### Task 3: Main-process roots and Finder routing

**Files:**
- Modify: `packages/desktop/src/main/windows/editor.ts`
- Modify: `packages/desktop/src/main/app/index.ts`
- Test: `packages/desktop/test/unit/specs/multi-root-main.spec.ts`

- [ ] Add failing tests for append watchers, detach watchers, all-root candidate scoring, and restoring `rootDirectories`.
- [ ] Replace the single internal root with an array while retaining the legacy getter.
- [ ] Add `removeFolder(pathname)` and IPC wiring.
- [ ] Update existing-directory detection and Finder file routing to inspect all roots.
- [ ] Verify main-process tests and TypeScript.

### Task 4: Sidebar UI

**Files:**
- Modify: `packages/desktop/src/renderer/src/pages/app.vue`
- Modify: `packages/desktop/src/renderer/src/components/sideBar/index.vue`
- Modify: `packages/desktop/src/renderer/src/components/sideBar/tree.vue`
- Modify: `packages/desktop/static/locales/en.json`
- Modify: `packages/desktop/static/locales/zh-CN.json`

- [ ] Render all roots independently with stable keys and collapse state.
- [ ] Add an always-available “Add folder” action.
- [ ] Add root hover/context “Remove from workspace”; emit detach IPC only.
- [ ] Keep already-open tabs untouched after detaching.
- [ ] Run locale generation, component tests, and TypeScript.

### Task 5: Restore and visual verification

**Files:**
- Modify only files above if verification exposes defects.

- [ ] Run targeted Vitest suites and `vue-tsc`.
- [ ] Start Electron with `design.md`, add two folders, verify both roots render, detach one, and confirm its tab remains open.
- [ ] Verify duplicate/nested folder attempts do not duplicate roots.
- [ ] Verify opening another Finder file focuses/adds a tab in the existing matching window.
- [ ] Leave the development app open; do not package.
