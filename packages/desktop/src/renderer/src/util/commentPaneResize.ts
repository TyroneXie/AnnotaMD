export const RIGHT_PANE_DEFAULT_WIDTH = 360
export const RIGHT_PANE_MIN_WIDTH = 320
export const RIGHT_PANE_MAX_WIDTH = 560

export const COMMENT_PANE_DEFAULT_WIDTH = RIGHT_PANE_DEFAULT_WIDTH
export const COMMENT_PANE_MIN_WIDTH = RIGHT_PANE_MIN_WIDTH
export const COMMENT_PANE_MAX_WIDTH = RIGHT_PANE_MAX_WIDTH
export const AGENT_PANE_DEFAULT_WIDTH = RIGHT_PANE_DEFAULT_WIDTH
export const AGENT_PANE_MIN_WIDTH = RIGHT_PANE_MIN_WIDTH
export const AGENT_PANE_MAX_WIDTH = RIGHT_PANE_MAX_WIDTH

const RIGHT_PANE_WIDTH_KEY = 'annotamd-right-pane-width'
const COMMENT_PANE_WIDTH_KEY = 'annotamd-comment-pane-width'
const AGENT_PANE_WIDTH_KEY = 'annotamd-agent-pane-width'

type WidthStorage = Pick<Storage, 'getItem' | 'setItem'>

export const clampRightPaneWidth = (width: number, viewportWidth: number): number => {
  const viewportMaximum = Math.max(
    RIGHT_PANE_MIN_WIDTH,
    Math.min(RIGHT_PANE_MAX_WIDTH, Math.round(viewportWidth * 0.5))
  )
  return Math.min(viewportMaximum, Math.max(RIGHT_PANE_MIN_WIDTH, Math.round(width)))
}

export const clampCommentPaneWidth = clampRightPaneWidth
export const clampAgentPaneWidth = clampRightPaneWidth

export const readRightPaneWidth = (storage: WidthStorage, viewportWidth: number): number => {
  const storedWidth = [RIGHT_PANE_WIDTH_KEY, AGENT_PANE_WIDTH_KEY, COMMENT_PANE_WIDTH_KEY]
    .map(key => Number(storage.getItem(key)))
    .find(value => Number.isFinite(value) && value > 0)
  return clampRightPaneWidth(storedWidth ?? RIGHT_PANE_DEFAULT_WIDTH, viewportWidth)
}

export const writeRightPaneWidth = (width: number, storage: WidthStorage): void => {
  storage.setItem(RIGHT_PANE_WIDTH_KEY, String(Math.round(width)))
}

export const readCommentPaneWidth = readRightPaneWidth
export const readAgentPaneWidth = readRightPaneWidth

export const writeCommentPaneWidth = writeRightPaneWidth
export const writeAgentPaneWidth = writeRightPaneWidth
