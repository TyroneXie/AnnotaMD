import { ref } from 'vue'
import { defineStore } from 'pinia'

export type RightPaneMode = 'closed' | 'comments'

type OpenRightPaneMode = Exclude<RightPaneMode, 'closed'>

export const useRightPaneStore = defineStore('rightPane', () => {
  const mode = ref<RightPaneMode>('closed')

  const openComments = (): void => {
    mode.value = 'comments'
  }

  const closeIf = (expectedMode?: OpenRightPaneMode): void => {
    if (!expectedMode || mode.value === expectedMode) {
      mode.value = 'closed'
    }
  }

  return {
    mode,
    openComments,
    closeIf
  }
})
