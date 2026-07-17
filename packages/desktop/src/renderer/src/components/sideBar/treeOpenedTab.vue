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
  height: 28px;
  line-height: 28px;
  margin: 1px 0;
  padding-left: 32px;
  padding-right: 8px;
  position: relative;
  color: #646a73;
  border-radius: 7px;
  font-size: 12px;
  & > .close-icon {
    display: none;
    position: absolute;
    top: 9px;
    left: 9px;
    cursor: pointer;
  }
  &:hover > .close-icon {
    display: inline-flex;
  }
  &:hover {
    background: #eef3ff;
    color: #3370ff;
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.opened-file.active {
  background: #e8f1ff;
  color: #3370ff;
  font-weight: 600;
}
.unsaved.opened-file::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3370ff;
  position: absolute;
  top: 11px;
  left: 12px;
}
.unsaved.opened-file:hover::before {
  content: none;
}
</style>
