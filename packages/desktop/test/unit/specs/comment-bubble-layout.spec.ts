import { describe, expect, it } from 'vitest'
import { layoutCommentBubbles } from '@/util/commentBubbleLayout'

describe('comment bubble layout', () => {
  it('keeps bubbles near their text anchors when they do not collide', () => {
    const layout = layoutCommentBubbles([
      { id: 'first', anchorTop: 40, height: 80 },
      { id: 'second', anchorTop: 180, height: 80 }
    ], 0, 400)

    expect(layout.positions).toEqual({ first: 40, second: 180 })
    expect(layout.height).toBe(400)
  })

  it('moves colliding bubbles downward without changing their anchor order', () => {
    const layout = layoutCommentBubbles([
      { id: 'second', anchorTop: 60, height: 90 },
      { id: 'first', anchorTop: 40, height: 80 }
    ], 0, 200, 12)

    expect(layout.positions.first).toBe(40)
    expect(layout.positions.second).toBe(132)
    expect(layout.height).toBeGreaterThan(200)
  })

  it('places comments without a live text anchor after anchored bubbles', () => {
    const layout = layoutCommentBubbles([
      { id: 'resolved', anchorTop: null, height: 60 },
      { id: 'active', anchorTop: 20, height: 80 }
    ], 0, 240)

    expect(layout.positions.active).toBe(20)
    expect(layout.positions.resolved).toBe(112)
  })
})
