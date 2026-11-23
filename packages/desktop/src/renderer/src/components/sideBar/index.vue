<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :style="[!rightColumn ? { 'min-width': '48px' } : {}, { width: `${finalSideBarWidth}px` }]"
  >
    <div class="left-column">
      <ul>
        <li
          v-for="(c, index) of sideBarIcons"
          :key="index"
          :class="[{ active: c.id === rightColumn }, `sidebar-${c.id}-toggle`]"
          :title="c.name()"
          role="button"
          tabindex="0"
          :aria-label="c.name()"
          :aria-pressed="c.id === rightColumn"
          @click="handleLeftIconClick(c.id)"
          @keydown.enter.prevent="handleLeftIconClick(c.id)"
          @keydown.space.prevent="handleLeftIconClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
      <div class="bottom-actions">
        <app-update-control sidebar />
        <ul class="bottom">
          <li
            v-for="(c, index) of sideBarBottomIcons"
            :key="index"
            @click="handleLeftBottomClick(c.id)"
          >
            <component :is="c.icon" />
          </li>
        </ul>
      </div>
    </div>
    <div
      v-show="rightColumn"
      class="right-column"
    >
      <tree
        v-if="rightColumn === 'files'"
        :project-trees="projectTrees"
        :opened-files="openedFiles"
        :tabs="tabs"
      />
      <side-bar-search v-else-if="rightColumn === 'search'" />
      <toc v-else-if="rightColumn === 'toc'" />
      <AgentWorkspacePanel
        v-else-if="rightColumn === 'agent'"
        ref="agentWorkspace"
        :workspace-path="agentWorkspacePath"
        :document-context="agentDocumentContext"
        :quote="agentQuote"
        @close="closeAgentWorkspace"
        @clear-selection="clearAgentQuote"
      />
    </div>
    <div
      v-show="rightColumn"
      ref="dragBar"
      class="drag-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { DUAL_SIDE_PANE_MIN_WIDTH, SIDEBAR_MIN_WIDTH, useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'
import { useRightPaneStore } from '@/store/rightPane'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import { storeToRefs } from 'pinia'
import type { TabDescriptor } from './types'
import type { AiDocumentContext, AiDraftQuote } from '@shared/types/aiWorkspace'
import AppUpdateControl from '../appUpdate/AppUpdateControl.vue'
import AgentWorkspacePanel from '../agent/AgentWorkspacePanel.vue'

const props = defineProps<{
  agentWorkspacePath: string
  agentDocumentContext?: AiDocumentContext | null
}>()

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const commentsStore = useAnnotaMDCommentsStore()
const rightPaneStore = useRightPaneStore()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)
const agentWorkspace = ref<InstanceType<typeof AgentWorkspacePanel> | null>(null)
const agentQuote = shallowRef<AiDraftQuote>()

const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(SIDEBAR_MIN_WIDTH)

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)

const { projectTrees } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

// Every right-column panel shares one width so switching icons never resizes the sidebar.
const finalSideBarWidth = computed<number>(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return 48
  return sideBarViewWidth.value < SIDEBAR_MIN_WIDTH ? SIDEBAR_MIN_WIDTH : sideBarViewWidth.value
})

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    if (!dragBarEl) return
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let startWidth = currentSideBarWidth

    sideBarViewWidth.value = currentSideBarWidth

    const mouseUpHandler = (): void => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      layoutStore.CHANGE_SIDE_BAR_WIDTH(currentSideBarWidth < SIDEBAR_MIN_WIDTH ? SIDEBAR_MIN_WIDTH : currentSideBarWidth)
    }

    const mouseMoveHandler = (event: MouseEvent): void => {
      const offset = event.clientX - startX
      currentSideBarWidth = startWidth + offset
      sideBarViewWidth.value = currentSideBarWidth
    }

    const mouseDownHandler = (event: MouseEvent): void => {
      startX = event.clientX
      startWidth = +sideBarWidth.value
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
  })
})

const handleLeftIconClick = (name: string): void => {
  if (rightColumn.value === name) {
    // Capture the expanded width BEFORE collapsing: once rightColumn is '',
    // finalSideBarWidth evaluates to the 45px icon strip and would overwrite
    // the user's real width with the clamped minimum (#2421).
    const widthToPersist = finalSideBarWidth.value
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    layoutStore.CHANGE_SIDE_BAR_WIDTH(widthToPersist)
  } else {
    if (name === 'agent' && window.innerWidth < DUAL_SIDE_PANE_MIN_WIDTH) {
      commentsStore.setPaneVisible(false)
      rightPaneStore.closeIf('comments')
    }
    const needDispatch = rightColumn.value === ''
    layoutStore.SET_LAYOUT({ rightColumn: name })
    sideBarViewWidth.value = +sideBarWidth.value
    if (needDispatch) {
      layoutStore.CHANGE_SIDE_BAR_WIDTH(finalSideBarWidth.value)
    }
  }
}

const closeAgentWorkspace = (): void => {
  if (rightColumn.value === 'agent') layoutStore.SET_LAYOUT({ rightColumn: '' })
}

const clearAgentQuote = (quote: AiDraftQuote): void => {
  if (agentQuote.value === quote) agentQuote.value = undefined
}

const quoteSelectionInAgent = async (event: Event): Promise<void> => {
  const quote = (event as CustomEvent<AiDraftQuote>).detail
  if (!quote?.text || quote.documentId !== props.agentDocumentContext?.documentId) return
  agentQuote.value = quote
  if (!showSideBar.value) layoutStore.SET_LAYOUT({ showSideBar: true })
  if (rightColumn.value !== 'agent') handleLeftIconClick('agent')
  await nextTick()
  if (agentQuote.value === quote) agentWorkspace.value?.focusComposer()
}

watch(() => props.agentDocumentContext?.documentId, () => { agentQuote.value = undefined })
onMounted(() => window.addEventListener('annotamd:agent-quote-requested', quoteSelectionInAgent))
onBeforeUnmount(() => window.removeEventListener('annotamd:agent-quote-requested', quoteSelectionInAgent))

const handleLeftBottomClick = (name: string): void => {
  if (name === 'settings') {
    projectStore.OPEN_SETTING_WINDOW()
  }
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-shrink: 0;
  flex-grow: 0;
  width: 320px;
  height: 100%;
  min-width: 320px;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--ui-muted);
  user-select: none;
  background: var(--ui-sidebar);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgb(16 18 22 / 4%);
}

.side-bar .left-column svg {
  color: currentColor;
}

.left-column {
  height: 100%;
  width: 48px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 6px 10px;
  box-sizing: border-box;
  background: var(--ui-sidebar);
  border-right: 1px solid var(--ui-divider);
}

.left-column > ul {
  opacity: 1;
}

.bottom-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.left-column ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.left-column ul > li {
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  border-radius: 8px;
  color: var(--ui-muted);
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
}

.left-column ul > li:hover {
  background: var(--ui-hover);
  color: var(--ui-ink);
}

.left-column ul > li:focus-visible {
  outline: 2px solid #3370ff;
  outline-offset: 1px;
}

.left-column ul > li > svg {
  width: 17px;
  height: 17px;
  color: currentColor;
  opacity: 1;
}

.left-column ul > li.active {
  background: var(--ui-selected);
  color: var(--ui-ink);
  box-shadow: inset 0 0 0 1px var(--ui-border);
}

.side-bar:hover .left-column ul li svg {
  opacity: 1;
}

.right-column {
  flex: 1;
  width: calc(100% - 48px);
  overflow: hidden;
  background: var(--ui-canvas);
  box-shadow: none;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 6px;
  cursor: col-resize;
}

/* The visible indicator lives in the gap between cards (app.vue); this bar is
   only the drag hit area, so it must not paint on the card edge. */
body.layout-classic .drag-bar {
  width: 6px;
}
</style>
