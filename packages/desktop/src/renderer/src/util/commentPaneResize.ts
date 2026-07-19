export const COMMENT_PANE_DEFAULT_WIDTH = 310
export const COMMENT_PANE_MIN_WIDTH = 280
export const COMMENT_PANE_MAX_WIDTH = 500

const COMMENT_PANE_WIDTH_KEY = 'annotamd-comment-pane-width'

type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>

export const clampCommentPaneWidth = (width: number, viewportWidth: number): number => {
  const viewportMaximum = Math.max(
    COMMENT_PANE_MIN_WIDTH,
    Math.min(COMMENT_PANE_MAX_WIDTH, Math.round(viewportWidth * 0.5))
  )
  return Math.min(viewportMaximum, Math.max(COMMENT_PANE_MIN_WIDTH, Math.round(width)))
}

export const readCommentPaneWidth = (storage: WidthStorage, viewportWidth: number): number => {
  const storedWidth = Number(storage.getItem(COMMENT_PANE_WIDTH_KEY))
  const width = Number.isFinite(storedWidth) && storedWidth > 0
    ? storedWidth
    : COMMENT_PANE_DEFAULT_WIDTH
  return clampCommentPaneWidth(width, viewportWidth)
}

export const writeCommentPaneWidth = (width: number, storage: WidthStorage): void => {
  storage.setItem(COMMENT_PANE_WIDTH_KEY, String(Math.round(width)))
}
