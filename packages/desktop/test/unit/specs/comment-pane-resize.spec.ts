import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMMENT_PANE_DEFAULT_WIDTH,
  COMMENT_PANE_MAX_WIDTH,
  COMMENT_PANE_MIN_WIDTH,
  clampCommentPaneWidth,
  readCommentPaneWidth,
  writeCommentPaneWidth
} from '@/util/commentPaneResize'

describe('comment pane resizing', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value) }
  }

  beforeEach(() => values.clear())

  it('clamps the pane to a usable viewport-aware range', () => {
    expect(clampCommentPaneWidth(120, 1400)).toBe(COMMENT_PANE_MIN_WIDTH)
    expect(clampCommentPaneWidth(420, 1400)).toBe(420)
    expect(clampCommentPaneWidth(900, 1400)).toBe(COMMENT_PANE_MAX_WIDTH)
    expect(clampCommentPaneWidth(500, 720)).toBe(360)
  })

  it('persists and restores the last width', () => {
    expect(readCommentPaneWidth(storage, 1400)).toBe(COMMENT_PANE_DEFAULT_WIDTH)
    writeCommentPaneWidth(438, storage)
    expect(readCommentPaneWidth(storage, 1400)).toBe(438)
  })

  it('ignores invalid persisted values', () => {
    storage.setItem('annotamd-comment-pane-width', 'not-a-number')
    expect(readCommentPaneWidth(storage, 1400)).toBe(COMMENT_PANE_DEFAULT_WIDTH)
  })
})
