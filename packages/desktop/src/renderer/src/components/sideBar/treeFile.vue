<template>
  <div
    ref="fileEl"
    :title="file.pathname"
    class="side-bar-file"
    :style="{ 'padding-left': `${depth * 6 + 10}px`, opacity: file.isMarkdown ? 1 : 0.75 }"
    :class="[
      { current: currentFile?.pathname === file.pathname, active: file.id === activeItem.id }
    ]"
    @click="handleFileClick"
  >
    <file-icon :name="file.name" />
    <input
      v-if="renameCache === file.pathname"
      ref="renameInput"
      v-model="newName"
      type="text"
      class="rename"
      @click.stop="noop"
      @keypress.enter="rename"
    >
    <span v-else>{{ file.name }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import FileIcon from './icon.vue'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'
import type { TreeFileNode } from './types'

const props = defineProps<{
  file: TreeFileNode
  depth: number
}>()

const projectStore = useProjectStore()
const editorStore = useEditorStore()

const newName = ref('')
const fileEl = ref<HTMLDivElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

const { renameCache } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { currentFile, tabs } = storeToRefs(editorStore)

// from fileMixins
const handleFileClick = (): void => {
  const { isMarkdown, pathname } = props.file
  if (!isMarkdown) return
  const openedTab = tabs.value.find((f) => window.fileUtils.isSamePathSync(f.pathname, pathname))
  if (openedTab) {
    if (currentFile.value?.pathname === openedTab.pathname) {
      return
    }
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('annotamd::open-file', pathname, {})
  }
}

const noop = (): void => {}

const focusRenameInput = (): void => {
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      newName.value = props.file.name
    }
  })
}

const rename = (): void => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

onMounted(() => {
  if (fileEl.value) {
    fileEl.value.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      projectStore.CHANGE_ACTIVE_ITEM(props.file)
      showContextMenu(event, !!clipboard.value)
    })
  }

  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.side-bar-file {
  display: flex;
  position: relative;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 28px;
  box-sizing: border-box;
  margin: 1px 0;
  padding-right: 8px;
  border-radius: 7px;
  color: #646a73;
  font-size: 12px;
  &:hover {
    background: #eef3ff;
    color: #3370ff;
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &::before {
    content: '';
    position: absolute;
    display: block;
    left: 0;
    background: #3370ff;
    width: 3px;
    height: 0;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.2s ease;
  }
}
.side-bar-file.current::before {
  height: 16px;
}
.side-bar-file.current {
  background: #e8f1ff;
}
.side-bar-file.current > span {
  color: #3370ff;
  font-weight: 600;
}
.side-bar-file.active > span {
  color: #1f2329;
}
input.rename {
  height: 24px;
  outline: none;
  margin: 2px 0;
  padding: 0 8px;
  color: #1f2329;
  border: 1px solid #c9d8ff;
  background: #ffffff;
  width: 100%;
  border-radius: 7px;
}
</style>
