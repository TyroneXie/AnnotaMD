# Unified Text Block Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make paragraphs, H1–H6 headings, quotes, ordered lists, bullet lists, and Todo items use one symmetric Feishu-style type conversion bar, then add item-level list conversion, batch conversion, and a real highlight container.

**Architecture:** Keep Muya's native Markdown container model, but introduce a leaf-target adapter for list items and quotes. Type conversion is driven by one shared text-block target matrix; list-item conversion splits the surrounding list and merges adjacent compatible lists after conversion. Multi-selection reuses the same leaf conversion operation inside one JSON-state transaction. Highlight blocks are explicit container states serialized as a compatible `[!HIGHLIGHT]` quote extension and excluded from the global TOC.

**Tech Stack:** TypeScript, Muya block tree and JSON OT state, Snabbdom UI, Vitest/happy-dom, CSS.

## Global Constraints

- Preserve clean CommonMark/GFM Markdown for ordinary paragraphs, headings, quotes, and lists.
- One user conversion must create one undo record.
- Use event delegation and one floating menu; never create one menu instance per list item.
- Do not allow highlight blocks inside highlight blocks in the first version.
- Keep code blocks, tables, images, diagrams, math, HTML, and front matter outside the text-block conversion matrix.
- Do not refactor unrelated editor behavior.

---

### Task 1: Shared text-block conversion matrix

**Files:**
- Modify: `packages/muya/src/block/blockTransforms.ts`
- Modify: `packages/muya/src/ui/paragraphFrontMenu/config.ts`
- Modify: `packages/muya/src/ui/paragraphFrontMenu/index.ts`
- Test: `packages/muya/src/ui/paragraphFrontMenu/__tests__/canTurnIntoMenu.spec.ts`
- Test: `packages/muya/src/ui/paragraphFrontMenu/__tests__/annotamdFrontMenu.spec.ts`

**Interfaces:**
- Produces: `TEXT_BLOCK_LABELS`, `isTextBlockTarget(block)`, and symmetric `canTurnInto(block, label)` behavior.
- Produces: quote/list/heading conversion without dropping text.

- [ ] Write failing matrix tests asserting paragraph, every heading, quote, and all list types expose paragraph, H1–H6, quote, ordered, bullet, and Todo targets.
- [ ] Run the focused Vitest files and confirm failures are caused by current asymmetric whitelists.
- [ ] Replace block-specific whitelists with one text-target matrix while preserving empty-paragraph insertion-only targets.
- [ ] Generalize front-menu conversion so heading and quote targets use the same path and list-container whole-list conversion remains temporarily supported.
- [ ] Run focused tests and Muya typecheck.

### Task 2: List-item leaf target and split/merge adapter

**Files:**
- Create: `packages/muya/src/block/listItemTransforms.ts`
- Modify: `packages/muya/src/ui/paragraphFrontButton/index.ts`
- Modify: `packages/muya/src/ui/paragraphFrontMenu/index.ts`
- Test: `packages/muya/src/block/__tests__/listItemTransforms.spec.ts`
- Test: `packages/muya/src/ui/paragraphFrontButton/__tests__/listItemTarget.spec.ts`

**Interfaces:**
- Produces: `resolveTextLeafTarget(block): Parent`.
- Produces: `convertListItem(item, label): Parent[]`, splitting the enclosing list into before/replacement/after segments.
- Produces: `mergeAdjacentCompatibleLists(block): Parent` for ordered, bullet, and Todo lists with matching metadata.

- [ ] Write failing tests for converting a middle list item to paragraph, heading, quote, and another list type.
- [ ] Write failing tests for merging new list items into compatible previous/next lists and preserving incompatible boundaries.
- [ ] Implement state-based split/rebuild so the source item is converted without mutating sibling content.
- [ ] Change front-button hit testing to target the hovered list item while retaining container behavior for non-text structural blocks.
- [ ] Route front-menu conversion through the list-item adapter and immediately retarget the floating menu.
- [ ] Run list-transform, front-button, front-menu, undo, and Markdown serialization tests.

### Task 3: Multi-block conversion

**Files:**
- Create: `packages/muya/src/block/multiBlockTransforms.ts`
- Modify: `packages/muya/src/ui/paragraphFrontMenu/index.ts`
- Modify: `packages/muya/src/selection/index.ts`
- Test: `packages/muya/src/block/__tests__/multiBlockTransforms.spec.ts`

**Interfaces:**
- Produces: `collectSelectedTextLeaves(selection): Parent[]`.
- Produces: `convertTextLeaves(blocks, label): Parent[]` with one JSON-state dispatch.

- [ ] Write failing tests for multiple paragraphs to one list, multiple list items to paragraphs/headings, and mixed selection rejection.
- [ ] Implement selection normalization to complete text leaves without including structural siblings outside the range.
- [ ] Apply leaf conversions in stable document order and dispatch one compound operation.
- [ ] Preserve selection over replacement leaves after conversion.
- [ ] Run selection, history, front-menu, and Markdown round-trip tests.

### Task 4: Highlight container state and Markdown round trip

**Files:**
- Create: `packages/muya/src/block/extra/highlightBlock/index.ts`
- Create: `packages/muya/src/block/extra/highlightBlock/index.css`
- Modify: `packages/muya/src/block/index.ts`
- Modify: `packages/muya/src/state/types.ts`
- Modify: `packages/muya/src/config/emptyStates.ts`
- Modify: Muya Markdown parse/serialize adapters located by the Task 4 RED tests.
- Modify: `packages/muya/src/ui/paragraphQuickInsertMenu/config.ts`
- Modify: `packages/muya/src/ui/paragraphFrontButton/index.ts`
- Modify: `packages/muya/src/ui/paragraphFrontMenu/index.ts`
- Test: `packages/muya/src/block/extra/highlightBlock/__tests__/highlightBlock.spec.ts`

**Interfaces:**
- Produces: `IHighlightBlockState { name: 'highlight-block'; meta: { collapsed: boolean }; children: TState[] }`.
- Parses and serializes the compatible extension marker `> [!HIGHLIGHT]`.

- [ ] Write failing parse/serialize tests for a highlight block containing heading, paragraph, list, Todo, and code.
- [ ] Add the state type, block constructor, registration, and fixed light-blue/orange visual treatment.
- [ ] Add parser recognition and serializer output while rejecting nested highlight markers as highlight containers.
- [ ] Exclude descendant headings from `getTOC()` and verify surrounding external headings remain unchanged.
- [ ] Add container copy/move/delete/collapse behavior and local/Markdown-persisted collapsed metadata.
- [ ] Run block, parser, serializer, TOC, and front-menu tests.

### Task 5: End-to-end verification

**Files:**
- Modify only files required by failures introduced by Tasks 1–4.

- [ ] Run focused Muya tests for transforms, menu, selection, history, parsing, serialization, and TOC.
- [ ] Run `pnpm --filter @muyajs/core lint:types`.
- [ ] Run desktop AnnotaMD typecheck and focused renderer tests.
- [ ] Start Electron with the existing design document and verify paragraph/heading/quote/list/Todo symmetry, middle-item split/merge, multi-select conversion, highlight nesting guard, collapse, TOC exclusion, undo, and saved Markdown.
- [ ] Inspect the final diff and remove only changes made obsolete by this implementation.

## Self-review

- Spec coverage: symmetric type bar, leaf list-item editing, list split/merge, batch conversion, single undo record, and highlight container are each assigned to a task.
- Placeholder scan: no deferred implementation placeholders; Task 4 intentionally locates parser adapters through failing tests because parser ownership is generated through Muya's markdown pipeline rather than a single named file.
- Type consistency: Task 2 leaf APIs feed Task 3 batching; Task 4 adds one explicit state discriminator without changing ordinary text labels.
