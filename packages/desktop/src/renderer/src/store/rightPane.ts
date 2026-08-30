import { ref } from 'vue'
import { defineStore } from 'pinia'

export type RightPaneMode = 'closed' | 'comments' | 'agent'

type OpenRightPaneMode = Exclude<RightPaneMode, 'closed'>

export const useRightPaneStore = defineStore('rightPane', () => {
  const mode = ref<RightPaneMode>('closed')
  const agentMaximized = ref(false)

  const openComments = (): void => {
    mode.value = 'comments'
  }

  const openAgent = (): void => {
    mode.value = 'agent'
  }

  const closeIf = (expectedMode?: OpenRightPaneMode): void => {
    if (!expectedMode || mode.value === expectedMode) {
      if (mode.value === 'agent') agentMaximized.value = false
      mode.value = 'closed'
    }
  }

  const toggleAgentMaximized = (): void => {
    if (mode.value !== 'agent') return
    agentMaximized.value = !agentMaximized.value
  }

  return {
    mode,
    agentMaximized,
    openComments,
    openAgent,
    toggleAgentMaximized,
    closeIf
  }
})
