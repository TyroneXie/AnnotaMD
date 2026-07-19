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

export interface CommentAnchorRect {
  id: string
  top: number
  bottom: number
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
  const range = rangeForComment(contentBlocksByPath(root), comment)
  return range?.toString() ?? null
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
  const blocks = contentBlocksByPath(root)
  return comments.flatMap((comment) => {
    if (!comment.id) return []
    const range = rangeForComment(blocks, comment)
    if (!range) return []
    const rect = range.getBoundingClientRect()
    return [{ id: comment.id, top: rect.top, bottom: rect.bottom }]
  })
}

export const findAnnotaMDCommentAtPosition = (
  root: HTMLElement,
  comments: CommentHighlightSource[],
  node: Node,
  offset: number
): CommentHighlightSource | null => {
  if (!root.contains(node)) return null
  const blocks = contentBlocksByPath(root)

  for (const comment of comments) {
    const range = rangeForComment(blocks, comment)
    if (range?.isPointInRange(node, offset)) return comment
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
  activeCommentId: string | null = null
): void => {
  const api = highlightApi()
  if (!api) return

  api.registry.delete(ANNOTAMD_COMMENT_HIGHLIGHT)
  api.registry.delete(ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT)
  const ranges = buildAnnotaMDCommentRanges(root, comments)
  if (ranges.length) {
    api.registry.set(ANNOTAMD_COMMENT_HIGHLIGHT, new api.HighlightClass(...ranges))
  }
  const activeComment = comments.find((comment) => comment.id === activeCommentId)
  if (activeComment) {
    const activeRange = rangeForComment(contentBlocksByPath(root), activeComment)
    if (activeRange) {
      api.registry.set(
        ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT,
        new api.HighlightClass(activeRange)
      )
    }
  }
}

export const clearAnnotaMDCommentHighlights = (): void => {
  const registry = highlightApi()?.registry
  registry?.delete(ANNOTAMD_COMMENT_HIGHLIGHT)
  registry?.delete(ANNOTAMD_ACTIVE_COMMENT_HIGHLIGHT)
}
