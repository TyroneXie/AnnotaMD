export interface CommentBubbleInput {
  id: string
  anchorTop: number | null
  height: number
}

export interface CommentBubbleLayout {
  positions: Record<string, number>
  height: number
}

export const isCommentAnchorVisible = (
  anchorTop: number,
  anchorBottom: number,
  viewportTop: number,
  viewportBottom: number
): boolean => anchorBottom > viewportTop && anchorTop < viewportBottom

export const layoutCommentBubbles = (
  bubbles: CommentBubbleInput[],
  minimumTop: number,
  minimumHeight: number,
  gap = 12,
  selectedId?: string | null
): CommentBubbleLayout => {
  const ordered = bubbles
    .map((bubble, index) => ({ ...bubble, index }))
    .sort((first, second) => {
      const firstTop = first.anchorTop ?? Number.POSITIVE_INFINITY
      const secondTop = second.anchorTop ?? Number.POSITIVE_INFINITY
      return firstTop - secondTop || first.index - second.index
    })

  const positions: Record<string, number> = {}
  const selectedIndex = selectedId
    ? ordered.findIndex((bubble) => bubble.id === selectedId && bubble.anchorTop != null)
    : -1

  if (selectedIndex >= 0) {
    const selected = ordered[selectedIndex]
    const selectedTop = selected.anchorTop as number
    positions[selected.id] = selectedTop

    let nextTop = selectedTop + Math.max(0, selected.height) + gap
    for (let index = selectedIndex + 1; index < ordered.length; index++) {
      const bubble = ordered[index]
      const preferredTop = bubble.anchorTop ?? Math.max(minimumTop, nextTop)
      const top = Math.max(preferredTop, nextTop)
      positions[bubble.id] = top
      nextTop = top + Math.max(0, bubble.height) + gap
    }

    let nextBottom = selectedTop - gap
    for (let index = selectedIndex - 1; index >= 0; index--) {
      const bubble = ordered[index]
      const height = Math.max(0, bubble.height)
      const preferredTop = bubble.anchorTop ?? nextBottom - height
      const top = Math.min(preferredTop, nextBottom - height)
      positions[bubble.id] = top
      nextBottom = top - gap
    }

    return {
      positions,
      height: Math.max(minimumHeight, nextTop + 68)
    }
  }

  let nextTop = Number.NEGATIVE_INFINITY

  ordered.forEach((bubble) => {
    const preferredTop = bubble.anchorTop ?? Math.max(minimumTop, nextTop)
    const top = Math.max(preferredTop, nextTop)
    positions[bubble.id] = top
    nextTop = top + Math.max(0, bubble.height) + gap
  })

  return {
    positions,
    height: Math.max(minimumHeight, nextTop + 68)
  }
}
