import { onBeforeUnmount, ref } from 'vue'

export const AUTO_HIDE_SCROLLBAR_DELAY_MS = 5_000
const SCROLLBAR_HIT_AREA_PX = 12

export const useAutoHideScrollbar = () => {
  const scrollbarVisible = ref(false)
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let draggingScrollbar = false
  let stopDragging: (() => void) | null = null

  const clearHideTimer = (): void => {
    if (hideTimer != null) clearTimeout(hideTimer)
    hideTimer = null
  }

  const scheduleHide = (): void => {
    clearHideTimer()
    if (draggingScrollbar) return
    hideTimer = setTimeout(() => {
      scrollbarVisible.value = false
      hideTimer = null
    }, AUTO_HIDE_SCROLLBAR_DELAY_MS)
  }

  const revealScrollbar = (): void => {
    scrollbarVisible.value = true
    scheduleHide()
  }

  const finishDragging = (): void => {
    draggingScrollbar = false
    window.removeEventListener('pointerup', finishDragging)
    window.removeEventListener('pointercancel', finishDragging)
    stopDragging = null
    scheduleHide()
  }

  const handleScrollbarPointerDown = (event: PointerEvent): void => {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const rect = target.getBoundingClientRect()
    const onVerticalScrollbar = target.scrollHeight > target.clientHeight
      && event.clientX >= rect.right - SCROLLBAR_HIT_AREA_PX
    const onHorizontalScrollbar = target.scrollWidth > target.clientWidth
      && event.clientY >= rect.bottom - SCROLLBAR_HIT_AREA_PX
    if (!onVerticalScrollbar && !onHorizontalScrollbar) return

    draggingScrollbar = true
    clearHideTimer()
    scrollbarVisible.value = true
    stopDragging = finishDragging
    window.addEventListener('pointerup', finishDragging)
    window.addEventListener('pointercancel', finishDragging)
  }

  onBeforeUnmount(() => {
    clearHideTimer()
    if (stopDragging) {
      window.removeEventListener('pointerup', finishDragging)
      window.removeEventListener('pointercancel', finishDragging)
      stopDragging = null
      draggingScrollbar = false
    }
  })

  return {
    scrollbarVisible,
    revealScrollbar,
    handleScrollbarPointerDown
  }
}
