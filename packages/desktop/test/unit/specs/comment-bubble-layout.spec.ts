import { describe, expect, it } from 'vitest'
import {
  isCommentAnchorVisible,
  layoutCommentBubbles
} from '@/util/commentBubbleLayout'

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

  it('pins the selected bubble to its anchor and makes surrounding bubbles yield', () => {
    const layout = layoutCommentBubbles([
      { id: 'first', anchorTop: 100, height: 140 },
      { id: 'selected', anchorTop: 180, height: 120 },
      { id: 'third', anchorTop: 210, height: 80 }
    ], 0, 400, 12, 'selected')

    expect(layout.positions.selected).toBe(180)
    expect(layout.positions.first).toBe(28)
    expect(layout.positions.third).toBe(312)
  })

  it('places comments without a live text anchor after anchored bubbles', () => {
    const layout = layoutCommentBubbles([
      { id: 'resolved', anchorTop: null, height: 60 },
      { id: 'active', anchorTop: 20, height: 80 }
    ], 0, 240)

    expect(layout.positions.active).toBe(20)
    expect(layout.positions.resolved).toBe(112)
  })

  it('lets comments leave the viewport with text anchors above it', () => {
    const layout = layoutCommentBubbles([
      { id: 'above', anchorTop: -140, height: 80 },
      { id: 'visible', anchorTop: 40, height: 80 }
    ], 0, 240)

    expect(layout.positions.above).toBe(-140)
    expect(layout.positions.visible).toBe(40)
  })

  it('keeps dense comment positions stable as their anchors cross the viewport top', () => {
    const bubbles = [
      { id: 'long', anchorTop: 100, height: 180 },
      { id: 'next', anchorTop: 110, height: 80 }
    ]

    const before = layoutCommentBubbles(bubbles, 99, 400)
    const after = layoutCommentBubbles(bubbles, 111, 400)

    expect(before.positions).toEqual({ long: 100, next: 292 })
    expect(after.positions).toEqual(before.positions)
  })

  it('orders a composer and saved comments by their text anchors', () => {
    const layout = layoutCommentBubbles([
      { id: 'composer', anchorTop: 220, height: 180 },
      { id: 'saved', anchorTop: 40, height: 100 }
    ], 0, 400)

    expect(layout.positions.saved).toBe(40)
    expect(layout.positions.composer).toBe(220)
  })

  it('hides comments after their text anchor leaves the viewport', () => {
    expect(isCommentAnchorVisible(-40, -10, 0, 400)).toBe(false)
    expect(isCommentAnchorVisible(410, 430, 0, 400)).toBe(false)
    expect(isCommentAnchorVisible(-10, 10, 0, 400)).toBe(true)
    expect(isCommentAnchorVisible(390, 410, 0, 400)).toBe(true)
  })
})
