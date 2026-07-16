export interface CommentBubbleInput {
  id: string
  anchorTop: number | null
  height: number
}

export interface CommentBubbleLayout {
  positions: Record<string, number>
  height: number
}

export const layoutCommentBubbles = (
  bubbles: CommentBubbleInput[],
  minimumTop: number,
  minimumHeight: number,
  gap = 12
): CommentBubbleLayout => {
  const ordered = bubbles
    .map((bubble, index) => ({ ...bubble, index }))
    .sort((first, second) => {
      const firstTop = first.anchorTop ?? Number.POSITIVE_INFINITY
      const secondTop = second.anchorTop ?? Number.POSITIVE_INFINITY
      return firstTop - secondTop || first.index - second.index
    })

  const positions: Record<string, number> = {}
  let nextTop = minimumTop

  ordered.forEach((bubble) => {
    const desiredTop = bubble.anchorTop == null ? nextTop : Math.max(minimumTop, bubble.anchorTop)
    const top = Math.max(desiredTop, nextTop)
    positions[bubble.id] = top
    nextTop = top + Math.max(0, bubble.height) + gap
  })

  return {
    positions,
    height: Math.max(minimumHeight, nextTop + 68)
  }
}
