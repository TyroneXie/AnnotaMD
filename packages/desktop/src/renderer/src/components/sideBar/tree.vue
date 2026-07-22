<template>
  <div
    class="tree-view"
    :class="{ 'without-projects': projectTrees.length === 0 }"
  >
    <div class="title">
      <!-- Keep the editor title-bar spacing clear. -->
    </div>

    <!-- Opened tabs -->
    <div
      v-if="openedFilesInSidebar"
      class="opened-files"
      :class="{ 'fills-sidebar': showOpenedFiles && projectTrees.length === 0 }"
    >
      <div class="title">
        <el-icon
          class="icon-arrow"
          :class="{ fold: !showOpenedFiles }"
          :size="12"
          @click.stop="toggleOpenedFiles()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleOpenedFiles()"
        >{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <el-tooltip
          effect="dark"
          :content="t('sideBar.tree.closeAll')"
          placement="bottom"
          :visible-arrow="false"
          :open-delay="350"
        >
          <a
            href="javascript:;"
            :aria-label="t('sideBar.tree.closeAll')"
            @click.stop="closeAll"
          >
            <svg
              class="icon"
              aria-hidden="true"
            >
              <use xlink:href="#icon-close-all" />
            </svg>
          </a>
        </el-tooltip>
      </div>
      <div
        v-show="showOpenedFiles"
        class="opened-files-list"
      >
        <transition-group name="list">
          <opened-file
            v-for="tab of tabs"
            :key="tab.id"
            :file="tab"
          />
        </transition-group>
      </div>
    </div>

    <!-- Multi-root workspace tree view -->
    <div v-if="projectTrees.length" class="project-trees">
      <div
        v-for="projectTree of projectTrees"
        :key="projectTree.pathname"
        class="project-tree"
      >
        <div
          class="title"
          @contextmenu.prevent="handleRootContextMenu($event, projectTree)"
        >
          <el-icon
            class="icon-arrow"
            :class="{ fold: !isRootExpanded(projectTree.pathname) }"
            :size="12"
            @click.stop="toggleDirectories(projectTree.pathname)"
          >
            <ArrowRight />
          </el-icon>
          <span
            class="default-cursor text-overflow"
            :title="projectTree.pathname"
            @click.stop="toggleDirectories(projectTree.pathname)"
          >{{ projectTree.name }}</span>
          <el-popover
            v-if="projectTree === projectTrees[0]"
            placement="bottom-end"
            :width="220"
            trigger="click"
            :visible-arrow="false"
            popper-class="sidebar-sort-popover"
          >
            <template #reference>
              <button
                class="sort-trigger"
                :aria-label="t('preferences.general.sidebar.fileSortBy.title')"
                :title="t('preferences.general.sidebar.fileSortBy.title')"
                @click.stop
              >
                <span class="sort-glyph" aria-hidden="true">
                  <span class="sort-glyph-lines">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span class="sort-glyph-arrow" />
                </span>
              </button>
            </template>
            <div class="sort-menu">
              <div class="sort-menu-label">
                {{ t('preferences.general.sidebar.fileSortBy.title') }}
              </div>
              <button
                v-for="option of fileSortByOptions"
                :key="String(option.value)"
                class="sort-menu-item"
                :class="{ active: fileSortBy === option.value }"
                @click="setFileSortBy(String(option.value))"
              >
                <span>{{ option.label }}</span>
                <el-icon v-if="fileSortBy === option.value" :size="15"><Check /></el-icon>
              </button>
              <div class="sort-menu-divider" />
              <div class="sort-menu-label">
                {{ t('preferences.general.sidebar.fileSortOrder.title') }}
              </div>
              <button
                v-for="option of fileSortOrderOptions"
                :key="String(option.value)"
                class="sort-menu-item"
                :class="{ active: fileSortOrder === option.value }"
                @click="setFileSortOrder(String(option.value))"
              >
                <span>{{ option.label }}</span>
                <el-icon v-if="fileSortOrder === option.value" :size="15"><Check /></el-icon>
              </button>
            </div>
          </el-popover>
          <button
            class="root-remove"
            :title="t('sideBar.tree.removeFolderFromWorkspace')"
            @click.stop="removeRoot(projectTree.pathname)"
          >
            <el-icon :size="13"><Close /></el-icon>
          </button>
        </div>
        <div
          v-show="isRootExpanded(projectTree.pathname)"
          class="tree-wrapper"
        >
          <folder
            v-for="folder of projectTree.folders"
            :key="folder.id"
            :folder="folder"
            :depth="depth"
          />
          <input
            v-show="createCacheDirname === projectTree.pathname"
            ref="input"
            v-model="createName"
            :placeholder="t('sideBar.tree.newMarkdownFilePlaceholder')"
            type="text"
            class="new-input"
            :style="{ 'margin-left': `${depth * 5 + 15}px` }"
            @keypress.enter="handleInputEnter"
          >
          <file
            v-for="file of projectTree.files"
            :key="file.id"
            :file="file"
            :depth="depth"
          />
          <div
            v-if="
              projectTree.files.length === 0 &&
                projectTree.folders.length === 0 &&
                createCacheDirname !== projectTree.pathname
            "
            class="empty-project"
          >
            <span>{{ t('sideBar.tree.emptyProject') }}</span>
            <div class="centered-group">
              <button
                class="button-primary"
                @click.stop="createFile(projectTree)"
              >
                {{ t('sideBar.tree.createFile') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <button class="add-folder" @click="openFolder">
        <el-icon :size="14"><Plus /></el-icon>
        <span>{{ t('sideBar.tree.addFolder') }}</span>
      </button>
    </div>
    <div
      v-else
      class="open-project"
    >
      <div class="centered-group">
        <OpenFileSplitButton
          @open-file="openFile"
          @open-folder="openFolder"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import OpenFileSplitButton from '@/components/OpenFileSplitButton.vue'
import bus from '../../bus'
import { showRootContextMenu } from '../../contextMenu/sideBar'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Check, Close, Plus } from '@element-plus/icons-vue'
import { getFileSortByOptions, getFileSortOrderOptions } from '../../prefComponents/general/config'
import type { TreeNode, TabDescriptor } from './types'

const { t } = useI18n()

const props = defineProps<{
  projectTrees: TreeNode[]
  openedFiles?: TabDescriptor[]
  tabs?: TabDescriptor[]
}>()

const depth = 0
// Persist the section collapse state (#2421). The tree is rendered under a
// v-if and is destroyed when the sidebar collapses to its icon strip, so local
// refs reset to expanded on re-open. Back them with localStorage (like the
// sidebar width) so the state survives a re-mount and app restart.
const SHOW_DIRECTORIES_KEY = 'side-bar-expanded-roots'
const SHOW_OPENED_FILES_KEY = 'side-bar-show-opened-files'
const readSectionExpanded = (key: string): boolean => localStorage.getItem(key) !== 'false'
const expandedRoots = ref<Record<string, boolean>>(
  JSON.parse(localStorage.getItem(SHOW_DIRECTORIES_KEY) || '{}') as Record<string, boolean>
)
const showOpenedFiles = ref(readSectionExpanded(SHOW_OPENED_FILES_KEY))
const createName = ref('')
const input = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

// Computed properties
const { createCache } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { openedFilesInSidebar, fileSortBy, fileSortOrder } = storeToRefs(preferencesStore)
const fileSortByOptions = computed(() => getFileSortByOptions())
const fileSortOrderOptions = computed(() => getFileSortOrderOptions(String(fileSortBy.value)))

// The createCache state is `{ dirname, type }` while an input is shown, and
// `{}` otherwise. Expose a typed accessor for the template so we don't have
// to thread `as any` through every comparison.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

// Methods
const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const openFile = (): void => {
  window.electron.ipcRenderer.send('annotamd::cmd-open-file')
}

const closeAll = (): void => {
  editorStore.ASK_FOR_SAVE_ALL(true)
}

const setFileSortBy = (value: string): void => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'fileSortBy', value })
}

const setFileSortOrder = (value: string): void => {
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'fileSortOrder', value })
}

const createFile = (tree: TreeNode): void => {
  projectStore.CHANGE_ACTIVE_ITEM(tree)
  bus.emit('SIDEBAR::new', 'file')
}

const handleRootContextMenu = (event: MouseEvent, tree: TreeNode): void => {
  projectStore.CHANGE_ACTIVE_ITEM(tree)
  showRootContextMenu(event, () => removeRoot(tree.pathname))
}

const toggleOpenedFiles = (): void => {
  showOpenedFiles.value = !showOpenedFiles.value
  localStorage.setItem(SHOW_OPENED_FILES_KEY, String(showOpenedFiles.value))
}

const isRootExpanded = (pathname: string): boolean => expandedRoots.value[pathname] !== false

const toggleDirectories = (pathname: string): void => {
  expandedRoots.value[pathname] = !isRootExpanded(pathname)
  localStorage.setItem(SHOW_DIRECTORIES_KEY, JSON.stringify(expandedRoots.value))
}

const removeRoot = (pathname: string): void => {
  projectStore.REMOVE_PROJECT(pathname)
}

// From createFileOrDirectoryMixins
const handleInputFocus = (): void => {
  nextTick(() => {
    const target = Array.isArray(input.value)
      ? input.value.find((element) => element.offsetParent !== null)
      : input.value
    if (target) {
      target.focus()
      createName.value = ''
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

const handleDocumentClick = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null
  if (target && target.tagName !== 'INPUT') {
    projectStore.CHANGE_ACTIVE_ITEM({})
    projectStore.createCache = {}
    projectStore.renameCache = null
  }
}

const handleDocumentContextMenu = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null
  if (target && target.tagName !== 'INPUT') {
    projectStore.createCache = {}
    projectStore.renameCache = null
  }
}

const handleDocumentKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    projectStore.createCache = {}
    projectStore.renameCache = null
  }
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)

  // Hide rename / create inputs on outside clicks. Buttons that open these
  // inputs must use @click.stop so their click never reaches this listener.
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('contextmenu', handleDocumentContextMenu)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  bus.off('SIDEBAR::show-new-input', handleInputFocus)
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('contextmenu', handleDocumentContextMenu)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: #646a73;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tree-view > .title {
  height: 35px;
  line-height: 35px;
  padding: 0 15px;
  display: flex;
  flex-shrink: 0;
  flex-direction: row-reverse;
}

.sort-trigger {
  width: 26px;
  height: 26px;
  margin-left: 6px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8f959e;
  background: transparent;
  cursor: pointer;
}

.sort-trigger:hover,
.sort-trigger:focus-visible {
  color: #3370ff;
  background: #eef3ff;
  outline: none;
}

.sort-glyph {
  width: 17px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.sort-glyph-lines {
  width: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.sort-glyph-lines i {
  display: block;
  height: 1px;
  border-radius: 1px;
  background: currentColor;
}

.sort-glyph-lines i:nth-child(1) {
  width: 10px;
}

.sort-glyph-lines i:nth-child(2) {
  width: 10px;
}

.sort-glyph-lines i:nth-child(3) {
  width: 7px;
}

.sort-glyph-arrow {
  position: relative;
  width: 5px;
  height: 14px;
  flex: none;
}

.sort-glyph-arrow::before {
  position: absolute;
  top: 0;
  left: 2px;
  width: 1px;
  height: 11px;
  border-radius: 1px;
  background: currentColor;
  content: '';
}

.sort-glyph-arrow::after {
  position: absolute;
  right: 0.5px;
  bottom: 0.5px;
  width: 4px;
  height: 4px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(45deg);
  content: '';
}

:global(.sidebar-sort-popover.el-popover) {
  padding: 8px;
  border-radius: 9px;
  box-shadow: 0 6px 20px rgba(31, 35, 41, 0.14);
}

.sort-menu-label {
  padding: 5px 10px 4px;
  color: #8f959e;
  font-size: 12px;
  line-height: 18px;
}

.sort-menu-item {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1f2329;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.sort-menu-item:hover {
  background: #f5f6f7;
}

.sort-menu-item.active {
  color: #3370ff;
  background: #eef3ff;
}

.sort-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: #e5e6eb;
}

.icon-arrow {
  margin-right: 5px;
  transition: transform 0.25s ease-out;
  transform: rotate(90deg);
  color: #8f959e;
  cursor: pointer;
}

.icon-arrow.fold {
  transform: rotate(0);
}

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  color: #1f2329;
  font-size: 13px;
  font-weight: 700;
}

.opened-files .title {
  margin: 4px 10px 2px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  border-radius: 7px;
}

.opened-files .title > span {
  flex: 1;
}

.opened-files .title > a {
  display: block;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  text-decoration: none;
  color: #8f959e;
  margin-left: 8px;
  transition: opacity 0.12s ease;
}
.opened-files div.title:hover > a,
.opened-files div.title > a:hover {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}

.opened-files div.title:hover > a:hover,
.opened-files div.title > a:hover:hover {
  color: #3370ff;
}
.opened-files {
  display: flex;
  flex-direction: column;
}
.opened-files.fills-sidebar {
  flex: 0 1 auto;
  min-height: 0;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  max-height: 112px;
  overflow: auto;
  flex: 1;
  padding: 0 8px;
}

.opened-files.fills-sidebar .opened-files-list {
  max-height: none;
  min-height: 0;
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.project-tree {
  display: flex;
  flex-direction: column;
  overflow: visible;
  flex: none;
}

.project-trees {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-bottom: 10px;
}

.project-tree > .title {
  margin: 4px 10px 2px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  border-radius: 7px;
}

.project-tree > .title > span {
  flex: 1;
  user-select: none;
}

.project-tree > .title > a,
.project-tree > .title > .root-remove {
  pointer-events: auto;
  cursor: pointer;
  margin-left: 8px;
  color: #8f959e;
  opacity: 0;
  border: 0;
  background: transparent;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.project-tree > .title > a:hover,
.project-tree > .title > .root-remove:hover {
  color: #3370ff;
}

.project-tree > .title > a.active {
  color: #3370ff;
}

.project-tree > .tree-wrapper {
  overflow: visible;
  padding: 0 8px 12px;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.project-tree div.title:hover > a,
.project-tree div.title:hover > .root-remove {
  opacity: 1;
}

.add-folder {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  margin: 4px 12px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #646a73;
  font-size: 12px;
  cursor: pointer;
}

.add-folder:hover {
  background: #eef3ff;
  color: #3370ff;
}
.open-project {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding-bottom: 100px;
}

.tree-view.without-projects .open-project {
  flex: 1 1 0;
  min-height: 80px;
  justify-content: center;
  padding: 8px 12px;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.new-input {
  outline: none;
  height: 28px;
  margin: 3px 0;
  padding: 0 8px;
  color: #1f2329;
  border: 1px solid #c9d8ff;
  background: #ffffff;
  width: calc(100% - 45px);
  border-radius: 7px;
}
.tree-wrapper {
  position: relative;
}
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: #8f959e;
  & button {
    margin-top: 10px;
  }
}

.empty-project > a {
  color: #3370ff;
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
