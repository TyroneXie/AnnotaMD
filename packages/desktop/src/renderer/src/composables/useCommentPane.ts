import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { DUAL_SIDE_PANE_MIN_WIDTH, useLayoutStore } from '@/store/layout'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'
import { useRightPaneStore } from '@/store/rightPane'
import { useEditorStore } from '@/store/editor'

/**
 * Shared state for the comment pane toggle. The button lives in the window
 * title bar, which is outside the editor tree, so the toggle logic cannot sit
 * in the tabs component anymore.
 */
export function useCommentPane() {
  const layoutStore = useLayoutStore()
  const commentsStore = useAnnotaMDCommentsStore()
  const rightPaneStore = useRightPaneStore()
  const editorStore = useEditorStore()

  const { currentFile } = storeToRefs(editorStore)
  const { paneVisible } = storeToRefs(commentsStore)
  const { mode } = storeToRefs(rightPaneStore)

  const commentPaneActive = computed(() => paneVisible.value && mode.value === 'comments')
  const selectionCommentCount = computed(() => {
    const pathname = currentFile.value?.pathname
    if (!pathname) return 0
    return commentsStore
      .commentsForFile(pathname)
      .filter(comment => comment.scope === 'selection' && !comment.resolved).length
  })

  const toggleCommentPane = (): void => {
    if (commentPaneActive.value) {
      commentsStore.setPaneVisible(false)
      return
    }
    if (window.innerWidth < DUAL_SIDE_PANE_MIN_WIDTH && layoutStore.rightColumn === 'agent') {
      layoutStore.SET_LAYOUT({ rightColumn: '' })
    }
    rightPaneStore.openComments()
    commentsStore.setPaneVisible(true)
  }

  return { commentPaneActive, selectionCommentCount, toggleCommentPane }
}
