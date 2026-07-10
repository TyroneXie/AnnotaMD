<template>
  <div class="tree-view">
    <div class="title">
      <!-- Placeholder -->
    </div>

    <!-- Opened tabs -->
    <div v-if="openedFilesInSidebar" class="opened-files">
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
        <a
          href="javascript:;"
          :title="t('sideBar.tree.saveAll')"
          @click.stop="saveAll(false)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-save-all" />
          </svg>
        </a>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.closeAll')"
          @click.stop="saveAll(true)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-close-all" />
          </svg>
        </a>
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
        <el-button
          text
          bg
          type="primary"
          @click="openFolder"
        >
          {{ t('sideBar.tree.openFolder') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import bus from '../../bus'
import { showRootContextMenu } from '../../contextMenu/sideBar'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Close, Plus } from '@element-plus/icons-vue'
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
const { openedFilesInSidebar } = storeToRefs(preferencesStore)

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

const saveAll = (isClose: boolean): void => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
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

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)

  // Hide rename / create inputs on outside clicks. Buttons that open these
  // inputs must use @click.stop so their click never reaches this listener.
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      projectStore.CHANGE_ACTIVE_ITEM({})
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })
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
  display: none;
  text-decoration: none;
  color: #8f959e;
  margin-left: 8px;
}
.opened-files div.title:hover > a,
.opened-files div.title > a:hover {
  display: block;
}

.opened-files div.title:hover > a:hover,
.opened-files div.title > a:hover:hover {
  color: #3370ff;
}
.opened-files {
  display: flex;
  flex-direction: column;
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

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
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
