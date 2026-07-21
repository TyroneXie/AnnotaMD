import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  AUTO_HIDE_SCROLLBAR_DELAY_MS,
  useAutoHideScrollbar
} from '@/composables/useAutoHideScrollbar'

afterEach(() => {
  vi.useRealTimers()
})

describe('auto-hiding side-pane scrollbars', () => {
  it('stays hidden initially and hides five seconds after scrolling stops', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const controller = scope.run(() => useAutoHideScrollbar())!

    expect(controller.scrollbarVisible.value).toBe(false)
    controller.revealScrollbar()
    expect(controller.scrollbarVisible.value).toBe(true)

    vi.advanceTimersByTime(AUTO_HIDE_SCROLLBAR_DELAY_MS - 1)
    expect(controller.scrollbarVisible.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(controller.scrollbarVisible.value).toBe(false)
    scope.stop()
  })

  it('restarts the five-second delay when scrolling continues', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const controller = scope.run(() => useAutoHideScrollbar())!

    controller.revealScrollbar()
    vi.advanceTimersByTime(4_000)
    controller.revealScrollbar()
    vi.advanceTimersByTime(4_999)
    expect(controller.scrollbarVisible.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(controller.scrollbarVisible.value).toBe(false)
    scope.stop()
  })

  it('does not hide while the scrollbar thumb is being dragged', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const controller = scope.run(() => useAutoHideScrollbar())!
    const scroller = document.createElement('div')
    Object.defineProperties(scroller, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 300 }
    })
    scroller.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 200,
      bottom: 100,
      left: 0,
      width: 200,
      height: 100,
      toJSON: () => ({})
    })

    scroller.addEventListener('pointerdown', controller.handleScrollbarPointerDown)
    scroller.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 198,
      clientY: 50,
      bubbles: true
    }))
    vi.advanceTimersByTime(AUTO_HIDE_SCROLLBAR_DELAY_MS * 2)
    expect(controller.scrollbarVisible.value).toBe(true)

    window.dispatchEvent(new PointerEvent('pointerup'))
    vi.advanceTimersByTime(AUTO_HIDE_SCROLLBAR_DELAY_MS)
    expect(controller.scrollbarVisible.value).toBe(false)
    scope.stop()
  })
})
