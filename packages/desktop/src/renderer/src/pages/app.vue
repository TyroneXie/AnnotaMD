<template>
  <div
    class="editor-container"
    :class="{
      'comment-pane-open': commentPaneActive
    }"
    :style="commentPaneStyle"
  >
    <side-bar
      v-if="init"
      :agent-workspace-path="agentWorkspacePath"
      :agent-document-context="agentDocumentContext"
      @clear-agent-selection="agentSelectionText = ''"
    />

    <div class="editor-middle">
      <title-bar
        :project="currentProject"
        :pathname="pathname"
        :filename="filename"
        :active="windowActive"
        :word-count="wordCount"
        :platform="platform"
        :is-saved="isSaved"
      />

      <div
        v-if="!init"
        class="editor-placeholder"
      />
      <recent v-if="!hasCurrentFile && init" />
      <editor-with-tabs
        v-if="hasCurrentFile && init"
        :markdown="markdown"
        :cursor="cursor"
        :muya-index-cursor="muyaIndexCursor"
        :source-code="sourceCode"
        :show-tab-bar="showTabBar"
        :text-direction="textDirection"
        :platform="platform"
      />
      <command-palette />
      <about-dialog />
      <export-setting-dialog />
      <rename />
      <import-modal />
    </div>
    <div
      v-if="commentPaneActive"
      class="annotamd-comment-pane-resizer"
      role="separator"
      aria-label="Resize comment pane"
      aria-orientation="vertical"
      :aria-valuenow="activePaneWidth"
      :aria-valuemin="activePaneMinWidth"
      :aria-valuemax="activePaneMaxWidth"
      tabindex="0"
      @mousedown="startCommentPaneResize"
      @keydown.left.prevent="resizeCommentPaneBy(16)"
      @keydown.right.prevent="resizeCommentPaneBy(-16)"
    />
    <AnnotaMDCommentPane v-if="commentPaneActive" />
  </div>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addStyles, addThemeStyle, addCustomStyle, type AddStylesOptions } from '@/util/theme'
import Recent from '@/components/recent/index.vue'
import EditorWithTabs from '@/components/editorWithTabs/index.vue'
import TitleBar from '@/components/titleBar/index.vue'
import SideBar from '@/components/sideBar/index.vue'
import AboutDialog from '@/components/about/index.vue'
import CommandPalette from '@/components/commandPalette/index.vue'
import ExportSettingDialog from '@/components/exportSettings/index.vue'
import Rename from '@/components/rename/index.vue'
import ImportModal from '@/components/import/index.vue'
import AnnotaMDCommentPane from '@/components/annotamd/CommentPane.vue'
import { subscribeAgentDocumentTransactionIpc } from '@/components/agent/agentDocumentTransactionIpc'
import bus from '@/bus'
import { DEFAULT_STYLE } from '@/config'
import { DUAL_SIDE_PANE_MIN_WIDTH, useLayoutStore } from '@/store/layout'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'
import { useNotificationStore } from '@/store/notification'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'
import { useRightPaneStore } from '@/store/rightPane'
import type { AiDocumentContext } from '@shared/types/aiWorkspace'
import { createAgentDocumentUri } from '@/components/editorWithTabs/agentDocumentTransaction'
import {
  RIGHT_PANE_MAX_WIDTH,
  RIGHT_PANE_MIN_WIDTH,
  clampRightPaneWidth,
  readRightPaneWidth,
  writeRightPaneWidth
} from '@/util/commentPaneResize'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const listenForMainStore = useListenForMainStore()
const commandCenterStore = useCommandCenterStore()
const notificationStore = useNotificationStore()
const annotaMDCommentsStore = useAnnotaMDCommentsStore()
const rightPaneStore = useRightPaneStore()

const timer = ref<ReturnType<typeof setTimeout> | null>(null)
const rightPaneWidth = ref(readRightPaneWidth(window.localStorage, window.innerWidth))
const agentSelectionText = ref('')

const { windowActive, platform, init } = storeToRefs(mainStore)
const { showTabBar } = storeToRefs(layoutStore)
const { sourceCode, theme, customCss, textDirection, zoom } = storeToRefs(preferencesStore)
const { projectTrees } = storeToRefs(projectStore)
const { currentFile } = storeToRefs(editorStore)
const { paneVisible: commentPaneVisible } = storeToRefs(annotaMDCommentsStore)
const { mode: rightPaneMode } = storeToRefs(rightPaneStore)

const hasCurrentFile = computed<boolean>(() => {
  return currentFile.value?.markdown !== undefined
})
const commentPaneActive = computed<boolean>(() => {
  return init.value && hasCurrentFile.value && commentPaneVisible.value
    && rightPaneMode.value === 'comments'
})
const activePaneWidth = computed(() => rightPaneWidth.value)
const activePaneMinWidth = RIGHT_PANE_MIN_WIDTH
const activePaneMaxWidth = RIGHT_PANE_MAX_WIDTH

const commentPaneStyle = computed<Record<string, string>>(() => {
  return {
    '--annotamd-comment-pane-width': commentPaneActive.value
      ? `${activePaneWidth.value}px`
      : '0px',
    '--annotamd-editor-tab-height': '28px'
  }
})

let stopCommentPaneResize: (() => void) | null = null
let stopAgentDocumentTransactionIpc: (() => void) | null = null

const resizeCommentPaneBy = (delta: number): void => {
  rightPaneWidth.value = clampRightPaneWidth(rightPaneWidth.value + delta, window.innerWidth)
  writeRightPaneWidth(rightPaneWidth.value, window.localStorage)
}

const startCommentPaneResize = (event: MouseEvent): void => {
  if (event.button !== 0) return
  event.preventDefault()

  const startX = event.clientX
  const startWidth = rightPaneWidth.value
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handleMouseMove = (moveEvent: MouseEvent): void => {
    const nextWidth = startWidth + startX - moveEvent.clientX
    rightPaneWidth.value = clampRightPaneWidth(nextWidth, window.innerWidth)
  }

  const handleMouseUp = (): void => {
    writeRightPaneWidth(rightPaneWidth.value, window.localStorage)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
    stopCommentPaneResize = null
  }

  stopCommentPaneResize?.()
  stopCommentPaneResize = handleMouseUp
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const pathname = computed(() => currentFile.value?.pathname)
const agentWorkspacePath = computed<string>(() => {
  const filePath = pathname.value
  if (!filePath) {
    return projectTrees.value[0]?.pathname || ''
  }

  const projectRoot = projectTrees.value
    .filter(
      (tree) => tree.pathname === filePath
        || window.fileUtils.isChildOfDirectory(tree.pathname, filePath)
    )
    .sort((left, right) => right.pathname.length - left.pathname.length)[0]

  return projectRoot?.pathname ?? window.path.dirname(filePath)
})
const agentDocumentContext = computed<AiDocumentContext | null>(() => {
  const file = currentFile.value
  if (!file?.id) return null
  const filePath = file.pathname || undefined
  return {
    documentHandleId: file.id,
    documentId: file.id,
    documentUri: createAgentDocumentUri(file.id, filePath),
    filePath,
    markdown: file.markdown ?? '',
    revision: 0,
    dirty: !file.isSaved,
    ...(agentSelectionText.value ? { selectionText: agentSelectionText.value } : {})
  }
})
const currentProject = computed(() => {
  if (!pathname.value) return projectTrees.value[0] ?? null
  return projectTrees.value.find(
    (tree) => tree.pathname === pathname.value
      || window.fileUtils.isChildOfDirectory(tree.pathname, pathname.value!)
  ) ?? projectTrees.value[0] ?? null
})
const filename = computed(() => currentFile.value?.filename)
const isSaved = computed(() => currentFile.value?.isSaved)
// `markdown` is read by `<editor-with-tabs>` whose prop is `required: true`.
// In template space we render that subtree only when `hasCurrentFile` is set,
// but vue-tsc can't see through the v-if guard — coalesce to '' so the prop
// type is `string`. The `<editor-with-tabs>` mount is still gated.
const markdown = computed<string>(() => currentFile.value?.markdown ?? '')
const cursor = computed(() => currentFile.value?.cursor)
const wordCount = computed(() => currentFile.value?.wordCount)
// `muyaIndexCursor` is loosely typed as `unknown` on the editor store; the
// downstream prop expects `Object | undefined`. Cast at the boundary.
const muyaIndexCursor = computed<Record<string, unknown> | undefined>(
  () => currentFile.value?.muyaIndexCursor as Record<string, unknown> | undefined
)

const captureAgentSelection = (event: Event): void => {
  const detail = (event as CustomEvent<{ documentId?: string; text?: string }>).detail
  if (!detail?.text || detail.documentId !== currentFile.value?.id) return
  agentSelectionText.value = detail.text
}

const openAgentWithSelection = (): void => {
  if (window.innerWidth < DUAL_SIDE_PANE_MIN_WIDTH) {
    annotaMDCommentsStore.setPaneVisible(false)
    rightPaneStore.closeIf('comments')
  }
  layoutStore.SET_LAYOUT({ rightColumn: 'agent', showSideBar: true })
}

watch(commentPaneVisible, (visible) => {
  if (visible) {
    rightPaneStore.openComments()
  } else {
    rightPaneStore.closeIf('comments')
  }
}, { immediate: true })

watch([init, hasCurrentFile], ([isInitialized, hasFile]) => {
  if (isInitialized && !hasFile) {
    if (layoutStore.rightColumn !== 'agent') {
      layoutStore.SET_LAYOUT({ rightColumn: '' })
    }
    rightPaneStore.closeIf('comments')
    if (commentPaneVisible.value) {
      annotaMDCommentsStore.setPaneVisible(false)
    }
  }
})

watch(() => currentFile.value?.id, () => {
  agentSelectionText.value = ''
})

// Watchers
watch(theme, (value, oldValue) => {
  if (value !== oldValue) {
    addThemeStyle(value)
  }
})

watch(customCss, (value, oldValue) => {
  if (value !== oldValue) {
    addCustomStyle({
      customCss: value
    })
  }
})

watch(zoom, (zoomValue) => {
  bus.emit('annotamd::window-zoom', zoomValue)
})

const setupDragDropHandler = (): void => {
  window.addEventListener(
    'dragover',
    (e: DragEvent) => {
      if (!e.dataTransfer || !e.dataTransfer.types.length) return

      if (e.dataTransfer.types.indexOf('Files') >= 0) {
        if (
          e.dataTransfer.items.length === 1 &&
          e.dataTransfer.items[0]!.type.indexOf('image') > -1
        ) {
          // Do nothing
        } else {
          e.preventDefault()
          if (timer.value) {
            clearTimeout(timer.value)
          }
          timer.value = setTimeout(() => {
            bus.emit('importDialog', false)
          }, 300)
          bus.emit('importDialog', true)
        }
        e.dataTransfer.dropEffect = 'copy'
      } else if (e.dataTransfer.types.indexOf('text/uri-list') >= 0) {
        // A web-link / web-image drag (e.g. an <img> dragged from a browser).
        // The muya editor's own dragover/drop handlers accept these and insert
        // an image block, so leave the drop enabled — forcing dropEffect='none'
        // here would clobber the editor's 'copy' and suppress the drop event.
      } else {
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'none'
      }
    },
    false
  )
}
onMounted(async () => {
  window.addEventListener('annotamd:agent-selection-changed', captureAgentSelection)
  window.addEventListener('annotamd:open-agent-with-selection', openAgentWithSelection)
  stopAgentDocumentTransactionIpc = subscribeAgentDocumentTransactionIpc({
    editorAvailable: () => hasCurrentFile.value && !sourceCode.value
  })
  if (window.annotamd?.initialState) {
    preferencesStore.SET_USER_PREFERENCE(window.annotamd.initialState)
  }

  mainStore.LISTEN_WIN_STATUS()
  await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  preferencesStore.LISTEN_FOR_VIEW()
  listenForMainStore.LISTEN_FOR_SHOW_DIALOG()
  listenForMainStore.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()
  projectStore.LISTEN_FOR_UPDATE_PROJECT()
  projectStore.LISTEN_FOR_LOAD_PROJECT()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  preferencesStore.ASK_FOR_USER_PREFERENCE()
  preferencesStore.LISTEN_TOGGLE_VIEW()
  editorStore.LISTEN_SCREEN_SHOT()
  editorStore.LISTEN_FOR_CLOSE()
  editorStore.LISTEN_FOR_SAVE_AS()
  editorStore.LISTEN_FOR_MOVE_TO()
  editorStore.LISTEN_FOR_SAVE()
  editorStore.LISTEN_FOR_SET_PATHNAME()
  editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()
  editorStore.LISTEN_FOR_SAVE_CLOSE()
  editorStore.LISTEN_FOR_RENAME()
  editorStore.LISTEN_FOR_SET_LINE_ENDING()
  editorStore.LISTEN_FOR_SET_ENCODING()
  editorStore.LISTEN_FOR_SET_FINAL_NEWLINE()
  editorStore.LISTEN_FOR_NEW_TAB()
  editorStore.LISTEN_FOR_CLOSE_TAB()
  editorStore.LISTEN_FOR_TAB_CYCLE()
  editorStore.LISTEN_FOR_SWITCH_TABS()
  editorStore.LISTEN_FOR_PRINT_SERVICE_CLEARUP()
  editorStore.LISTEN_FOR_EXPORT_SUCCESS()
  editorStore.LISTEN_FOR_FILE_CHANGE()
  editorStore.LISTEN_WINDOW_ZOOM()
  editorStore.LISTEN_FOR_RELOAD_IMAGES()
  editorStore.LISTEN_FOR_CONTEXT_MENU()
  editorStore.LISTEN_FOR_STATE_REPLACE()

  // module: notification
  notificationStore.listenForNotification()

  setupDragDropHandler()

  nextTick(() => {
    // `initialState` from bootstrap carries nullable URL params (string|null);
    // `addStyles` requires non-null `theme` / `codeFontFamily` strings.
    // Coalesce against DEFAULT_STYLE for every nullable field.
    const init = window.annotamd?.initialState
    const style: AddStylesOptions = {
      theme: init?.theme ?? DEFAULT_STYLE.theme,
      codeFontFamily: init?.codeFontFamily ?? DEFAULT_STYLE.codeFontFamily,
      codeFontSize: init?.codeFontSize ?? DEFAULT_STYLE.codeFontSize,
      hideScrollbar: init?.hideScrollbar ?? DEFAULT_STYLE.hideScrollbar
    }
    addStyles(style)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('annotamd:agent-selection-changed', captureAgentSelection)
  window.removeEventListener('annotamd:open-agent-with-selection', openAgentWithSelection)
  stopCommentPaneResize?.()
  stopAgentDocumentTransactionIpc?.()
  stopAgentDocumentTransactionIpc = null
})
</script>

<style scoped>
:global(:root) {
  --annotamd-bg: #f5f6f8;
  --annotamd-surface: #ffffff;
  --annotamd-surface-soft: #f7f8fa;
  --annotamd-surface-blue: #e8f1ff;
  --annotamd-fill-soft: #f2f3f5;
  --annotamd-border: #dee0e3;
  --annotamd-border-soft: #eceff3;
  --annotamd-text: #2f3437;
  --annotamd-ink: #1f2329;
  --annotamd-muted: #6b7280;
  --annotamd-blue: #3370ff;
  --annotamd-green: #20a162;
}

:global(html),
:global(body),
:global(#app) {
  overflow: hidden;
  background: var(--annotamd-bg);
  color: var(--annotamd-text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

:global(*::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

:global(*::-webkit-scrollbar-track) {
  background: transparent;
}

:global(*::-webkit-scrollbar-thumb) {
  border: 3px solid transparent;
  border-radius: 999px;
  background: rgba(31, 35, 41, 0.22);
  background-clip: padding-box;
}

:global(*::-webkit-scrollbar-thumb:hover) {
  background: rgba(31, 35, 41, 0.34);
  background-clip: padding-box;
}

:global(.annotamd-auto-hide-scrollbar:not(.annotamd-scrollbar-visible)::-webkit-scrollbar-thumb),
:global(.annotamd-auto-hide-scrollbar:not(.annotamd-scrollbar-visible)::-webkit-scrollbar-thumb:hover) {
  background: transparent;
}

:global(.annotamd-auto-hide-scrollbar:not(.annotamd-scrollbar-visible)::-webkit-scrollbar),
:global(.annotamd-auto-hide-scrollbar:not(.annotamd-scrollbar-visible)::-webkit-scrollbar-corner) {
  background: transparent;
}

:global(.annotamd-shared-scroll-source::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
  background: transparent;
}

:global(.annotamd-shared-scroll-source::-webkit-scrollbar-thumb),
:global(.annotamd-shared-scroll-source::-webkit-scrollbar-thumb:hover) {
  background: transparent;
}

:global(.annotamd-editor-width-stable) {
  scrollbar-gutter: stable;
}

:global(.annotamd-editor-width-stable::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

.editor-placeholder,
.editor-container {
  display: flex;
  flex-direction: row;
  position: absolute;
  width: 100vw;
  height: 100vh;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
.editor-container {
  --annotamd-comment-pane-width: 0px;
  box-sizing: border-box;
  padding-right: var(--annotamd-comment-pane-width);
  overflow: hidden;
  background: var(--annotamd-surface);
}
.editor-container.comment-pane-open {
  --annotamd-comment-pane-width: 310px;
}
.annotamd-comment-pane-resizer {
  position: fixed;
  z-index: 31;
  top: var(--titleBarHeight);
  right: calc(var(--annotamd-comment-pane-width) - 4px);
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}
.annotamd-comment-pane-resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  background: transparent;
  content: '';
  transition: background-color 80ms ease;
}
.annotamd-comment-pane-resizer:hover::after,
.annotamd-comment-pane-resizer:focus-visible::after {
  background: var(--annotamd-blue);
}
.editor-container .hide {
  z-index: -1;
  opacity: 0;
  position: absolute;
  left: -10000px;
}
.editor-placeholder {
  background: var(--annotamd-surface);
}
.editor-middle {
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: calc(100vw - var(--annotamd-comment-pane-width));
  min-width: 0;
  min-height: 100vh;
  position: relative;
  background: var(--annotamd-surface);
  & > .editor {
    flex: 1;
  }
}
</style>
