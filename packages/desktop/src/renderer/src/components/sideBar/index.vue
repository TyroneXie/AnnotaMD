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
        :workspace-path="agentWorkspacePath"
        :document-context="agentDocumentContext"
        @close="closeAgentWorkspace"
        @clear-selection="emit('clearAgentSelection')"
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
import { ref, computed, onMounted, nextTick } from 'vue'
import { DUAL_SIDE_PANE_MIN_WIDTH, useLayoutStore } from '@/store/layout'
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
import type { AiDocumentContext } from '@shared/types/aiWorkspace'
import AppUpdateControl from '../appUpdate/AppUpdateControl.vue'
import AgentWorkspacePanel from '../agent/AgentWorkspacePanel.vue'

defineProps<{
  agentWorkspacePath: string
  agentDocumentContext?: AiDocumentContext | null
}>()

const emit = defineEmits<{
  clearAgentSelection: []
}>()

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const commentsStore = useAnnotaMDCommentsStore()
const rightPaneStore = useRightPaneStore()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)

const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(280)
const agentSideBarViewWidth = ref(428)

const { rightColumn, showSideBar, sideBarWidth, agentSideBarWidth } = storeToRefs(layoutStore)

const { projectTrees } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

const finalSideBarWidth = computed<number>(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return 48
  if (rightColumn.value === 'agent') {
    return Math.min(Math.max(agentSideBarViewWidth.value, 380), 680)
  }
  return sideBarViewWidth.value < 220 ? 220 : sideBarViewWidth.value
})

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    if (!dragBarEl) return
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let currentAgentSideBarWidth = +agentSideBarWidth.value
    let startWidth = currentSideBarWidth

    sideBarViewWidth.value = currentSideBarWidth
    agentSideBarViewWidth.value = currentAgentSideBarWidth

    const mouseUpHandler = (): void => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      if (rightColumn.value === 'agent') {
        layoutStore.CHANGE_AGENT_SIDE_BAR_WIDTH(currentAgentSideBarWidth)
      } else {
        layoutStore.CHANGE_SIDE_BAR_WIDTH(currentSideBarWidth < 220 ? 220 : currentSideBarWidth)
      }
    }

    const mouseMoveHandler = (event: MouseEvent): void => {
      const offset = event.clientX - startX
      if (rightColumn.value === 'agent') {
        currentAgentSideBarWidth = Math.min(Math.max(startWidth + offset, 380), 680)
        agentSideBarViewWidth.value = currentAgentSideBarWidth
      } else {
        currentSideBarWidth = startWidth + offset
        sideBarViewWidth.value = currentSideBarWidth
      }
    }

    const mouseDownHandler = (event: MouseEvent): void => {
      startX = event.clientX
      startWidth = rightColumn.value === 'agent'
        ? +agentSideBarWidth.value
        : +sideBarWidth.value
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
    // the user's real width with the clamped 220px minimum (#2421).
    const widthToPersist = finalSideBarWidth.value
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    if (name === 'agent') layoutStore.CHANGE_AGENT_SIDE_BAR_WIDTH(widthToPersist)
    else layoutStore.CHANGE_SIDE_BAR_WIDTH(widthToPersist)
  } else {
    if (name === 'agent' && window.innerWidth < DUAL_SIDE_PANE_MIN_WIDTH) {
      commentsStore.setPaneVisible(false)
      rightPaneStore.closeIf('comments')
    }
    const needDispatch = rightColumn.value === ''
    layoutStore.SET_LAYOUT({ rightColumn: name })
    if (name === 'agent') agentSideBarViewWidth.value = +agentSideBarWidth.value
    else sideBarViewWidth.value = +sideBarWidth.value
    if (needDispatch) {
      layoutStore.CHANGE_SIDE_BAR_WIDTH(finalSideBarWidth.value)
    }
  }
}

const closeAgentWorkspace = (): void => {
  if (rightColumn.value === 'agent') layoutStore.SET_LAYOUT({ rightColumn: '' })
}

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
  width: 280px;
  height: 100vh;
  min-width: 220px;
  position: relative;
  color: #646a73;
  user-select: none;
  background: #f7f8fa;
  border-right: 1px solid #eceff3;
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
  padding: 38px 6px 10px;
  box-sizing: border-box;
  background: #fbfcfd;
  border-right: 1px solid #eceff3;
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
  border-radius: 9px;
  color: #646a73;
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
}

.left-column ul > li:hover {
  background: #eef3ff;
  color: #3370ff;
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
  background: #e8f1ff;
  color: #3370ff;
  box-shadow: inset 0 0 0 1px rgba(51, 112, 255, 0.1);
}

.side-bar:hover .left-column ul li svg {
  opacity: 1;
}

.right-column {
  flex: 1;
  width: calc(100% - 48px);
  overflow: hidden;
  background: #fbfcfd;
  box-shadow: inset -1px 0 0 #eceff3;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid #3370ff;
}
</style>
