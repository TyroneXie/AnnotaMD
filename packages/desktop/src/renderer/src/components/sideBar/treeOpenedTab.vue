<template>
  <div
    ref="openedFileEl"
    class="opened-file"
    :title="file.pathname"
    :class="[{ active: currentFile?.id === file.id, unsaved: !file.isSaved }]"
    @click="selectFile(file)"
    @contextmenu.prevent="handleContextMenu"
  >
    <el-icon
      class="close-icon"
      :size="10"
      @click.stop="removeFileInTab(file)"
    >
      <Close />
    </el-icon>
    <span class="name">{{ file.filename }}</span>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { Close } from '@element-plus/icons-vue'
import type { TabDescriptor } from './types'
import { showContextMenu } from '../../contextMenu/tabs'

const props = defineProps<{
  file: TabDescriptor
}>()

const editorStore = useEditorStore()

const { currentFile } = storeToRefs(editorStore)
const openedFileEl = ref<HTMLElement | null>(null)

watch(
  () => currentFile.value?.id,
  async (currentFileId) => {
    if (currentFileId !== props.file.id) return
    await nextTick()
    openedFileEl.value?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true }
)

const selectFile = (file: TabDescriptor): void => {
  if (file.id !== currentFile.value?.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const removeFileInTab = (file: TabDescriptor): void => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}

const handleContextMenu = (event: MouseEvent): void => {
  showContextMenu(event, props.file)
}
</script>

<style scoped>
.opened-file {
  display: flex;
  user-select: none;
  height: 26px;
  line-height: 26px;
  margin: 0 2px 1px;
  padding-left: 32px;
  padding-right: 8px;
  position: relative;
  color: var(--ui-text);
  border-radius: 7px;
  font-size: 12.5px;
  & > .close-icon {
    display: none;
    position: absolute;
    top: 6px;
    left: 9px;
    cursor: pointer;
  }
  &:hover > .close-icon {
    display: inline-flex;
  }
  &:hover {
    background: var(--ui-hover);
    color: var(--ui-ink);
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.opened-file.active {
  background: var(--ui-paper);
  border: 1px solid var(--ui-border);
  color: var(--ui-ink);
  font-weight: 600;
}
.unsaved.opened-file::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--annotamd-blue);
  position: absolute;
  top: 8px;
  left: 12px;
}
.unsaved.opened-file:hover::before {
  content: none;
}
</style>
