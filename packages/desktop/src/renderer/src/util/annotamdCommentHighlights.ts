interface CommentSelectionPoint {
  key: string
  offset: number
}

export interface CommentHighlightSource {
  id?: string
  scope: 'selection' | 'document'
  resolved: boolean
  anchor?: CommentSelectionPoint
  focus?: CommentSelectionPoint
}

interface MuyaContentBlock {
  path?: Array<string | number>
}

interface TextBoundary {
  node: Text
  offset: number
}

interface HighlightRegistry {
  delete: (name: string) => void
  set: (name: string, highlight: unknown) => void
}

type HighlightConstructor = new (...ranges: Range[]) => unknown

const BLOCK_DOM_PROPERTY = '__MUYA_BLOCK__'

export const ANNOTAMD_COMMENT_HIGHLIGHT = 'annotamd-selection-comment'
export const ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT = 'annotamd-active-selection-comment'
export const ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID = 'annotamd-comment-composer'

const COMMENT_INLINE_CODE_BRIDGE_CLASSES = [
  'annotamd-comment-code-bridge-start',
  'annotamd-comment-code-bridge-end',
  'annotamd-active-comment-code-bridge-start',
  'annotamd-active-comment-code-bridge-end'
] as const
const inlineCodeBridgesByRoot = new WeakMap<HTMLElement, Set<HTMLElement>>()

export interface CommentAnchorRect {
  id: string
  top: number
  bottom: number
}

interface CommentRangeEntry {
  comment: CommentHighlightSource
  range: Range
}

export interface CommentRangeLayout {
  entries: CommentRangeEntry[]
  ranges: Range[]
  anchorRects: CommentAnchorRect[]
}

const pathKey = (path: Array<string | number>): string => path.join('/')

const textBoundaryAt = (element: HTMLElement, rawOffset: number): TextBoundary | null => {
  let remaining = Math.max(0, rawOffset)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let lastText: Text | null = null
  let node = walker.nextNode()

  while (node) {
    const text = node as Text
    const length = text.data.length
    lastText = text
    if (remaining <= length) {
      return { node: text, offset: remaining }
    }
    remaining -= length
    node = walker.nextNode()
  }

  return lastText ? { node: lastText, offset: lastText.data.length } : null
}

const contentBlocksByPath = (root: HTMLElement): Map<string, HTMLElement> => {
  const blocks = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('.mu-content').forEach((element) => {
    const block = (element as HTMLElement & Record<string, unknown>)[
      BLOCK_DOM_PROPERTY
    ] as MuyaContentBlock | undefined
    if (Array.isArray(block?.path)) {
      blocks.set(pathKey(block.path), element)
    }
  })
  return blocks
}

const isBefore = (
  firstElement: HTMLElement,
  firstOffset: number,
  secondElement: HTMLElement,
  secondOffset: number
): boolean => {
  if (firstElement === secondElement) return firstOffset <= secondOffset
  return Boolean(firstElement.compareDocumentPosition(secondElement) & Node.DOCUMENT_POSITION_FOLLOWING)
}

const rangeForComment = (
  blocks: Map<string, HTMLElement>,
  comment: CommentHighlightSource
): Range | null => {
  if (comment.scope !== 'selection' || comment.resolved || !comment.anchor || !comment.focus) {
    return null
  }

  const anchorElement = blocks.get(comment.anchor.key)
  const focusElement = blocks.get(comment.focus.key)
  if (!anchorElement || !focusElement) return null

  const anchor = textBoundaryAt(anchorElement, comment.anchor.offset)
  const focus = textBoundaryAt(focusElement, comment.focus.offset)
  if (!anchor || !focus) return null

  const anchorFirst = isBefore(
    anchorElement,
    comment.anchor.offset,
    focusElement,
    comment.focus.offset
  )
  const start = anchorFirst ? anchor : focus
  const end = anchorFirst ? focus : anchor
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range.collapsed ? null : range
}

export const readAnnotaMDCommentText = (
  root: HTMLElement,
  comment: CommentHighlightSource
): string | null => {
  return createAnnotaMDCommentTextReader(root)(comment)
}

export const createAnnotaMDCommentTextReader = (
  root: HTMLElement
): ((comment: CommentHighlightSource) => string | null) => {
  const blocks = contentBlocksByPath(root)
  return (comment) => rangeForComment(blocks, comment)?.toString() ?? null
}

export const buildAnnotaMDCommentRangeLayout = (
  root: HTMLElement,
  comments: CommentHighlightSource[],
  anchorOnlySources: CommentHighlightSource[] = []
): CommentRangeLayout => {
  const blocks = contentBlocksByPath(root)
  const entries: CommentRangeEntry[] = []
  const anchorRects: CommentAnchorRect[] = []

  comments.forEach((comment) => {
    const range = rangeForComment(blocks, comment)
    if (!range) return
    entries.push({ comment, range })
    if (comment.id) {
      // happy-dom/jsdom do not implement Range geometry; production Chromium
      // does. Keep range lookup testable without changing browser behavior.
      const rect = typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : { top: 0, bottom: 0 }
      anchorRects.push({ id: comment.id, top: rect.top, bottom: rect.bottom })
    }
  })

  anchorOnlySources.forEach((source) => {
    const range = rangeForComment(blocks, source)
    if (!range || !source.id) return
    const rect = typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : { top: 0, bottom: 0 }
    anchorRects.push({ id: source.id, top: rect.top, bottom: rect.bottom })
  })

  return {
    entries,
    ranges: entries.map(({ range }) => range),
    anchorRects
  }
}

const syncInlineCodeBridgeClasses = (
  root: HTMLElement,
  layout: CommentRangeLayout,
  activeCommentId: string | null
): void => {
  inlineCodeBridgesByRoot.get(root)?.forEach((code) => {
    code.classList.remove(...COMMENT_INLINE_CODE_BRIDGE_CLASSES)
  })
  const markedInlineCodes = new Set<HTMLElement>()

  layout.entries.forEach(({ comment, range }) => {
    const commonAncestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer as HTMLElement
      : range.commonAncestorContainer.parentElement
    if (!commonAncestor) return
    const inlineCodes = commonAncestor.matches('code.mu-inline-rule')
      ? [commonAncestor]
      : [...commonAncestor.querySelectorAll<HTMLElement>('code.mu-inline-rule')]
    inlineCodes.forEach((code) => {
      try {
        if (!range.intersectsNode(code)) return
        markedInlineCodes.add(code)
        const active = comment.id === activeCommentId
        if (range.comparePoint(code, 0) === 0) {
          code.classList.add(
            active
              ? 'annotamd-active-comment-code-bridge-start'
              : 'annotamd-comment-code-bridge-start'
          )
        }
        if (range.comparePoint(code, code.childNodes.length) === 0) {
          code.classList.add(
            active
              ? 'annotamd-active-comment-code-bridge-end'
              : 'annotamd-comment-code-bridge-end'
          )
        }
      } catch {
        // Ignore stale nodes replaced by Muya between layout and paint.
      }
    })
  })

  inlineCodeBridgesByRoot.set(root, markedInlineCodes)
}

export const buildAnnotaMDCommentRanges = (
  root: HTMLElement,
  comments: CommentHighlightSource[]
): Range[] => {
  const blocks = contentBlocksByPath(root)
  const ranges: Range[] = []

  comments.forEach((comment) => {
    const range = rangeForComment(blocks, comment)
    if (range) ranges.push(range)
  })

  return ranges
}

export const buildAnnotaMDCommentAnchorRects = (
  root: HTMLElement,
  comments: CommentHighlightSource[]
): CommentAnchorRect[] => {
  return buildAnnotaMDCommentRangeLayout(root, comments).anchorRects
}

export const findAnnotaMDCommentAtPosition = (
  root: HTMLElement,
  comments: CommentHighlightSource[],
  node: Node,
  offset: number,
  layout?: CommentRangeLayout | null
): CommentHighlightSource | null => {
  if (!root.contains(node)) return null
  const entries = layout?.entries ?? buildAnnotaMDCommentRangeLayout(root, comments).entries

  for (const { comment, range } of entries) {
    if (range.isPointInRange(node, offset)) return comment
  }

  return null
}

const highlightApi = (): {
  registry: HighlightRegistry
  HighlightClass: HighlightConstructor
} | null => {
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
  const HighlightClass = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight
  return registry && HighlightClass ? { registry, HighlightClass } : null
}

export const syncAnnotaMDCommentHighlights = (
  root: HTMLElement,
  comments: CommentHighlightSource[],
  activeCommentId: string | null = null,
  layout?: CommentRangeLayout
): void => {
  const api = highlightApi()
  if (!api) return

  api.registry.delete(ANNOTAMD_COMMENT_HIGHLIGHT)
  api.registry.delete(ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT)
  const resolvedLayout = layout ?? buildAnnotaMDCommentRangeLayout(root, comments)
  syncInlineCodeBridgeClasses(root, resolvedLayout, activeCommentId)
  const { ranges } = resolvedLayout
  if (ranges.length) {
    api.registry.set(ANNOTAMD_COMMENT_HIGHLIGHT, new api.HighlightClass(...ranges))
  }
  const activeRange = resolvedLayout.entries.find(
    ({ comment }) => comment.id === activeCommentId
  )?.range
  if (activeRange) {
    api.registry.set(
      ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT,
      new api.HighlightClass(activeRange)
    )
  }
}

export const clearAnnotaMDCommentHighlights = (): void => {
  const registry = highlightApi()?.registry
  registry?.delete(ANNOTAMD_COMMENT_HIGHLIGHT)
  registry?.delete(ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT)
}
