<template>
  <div>
    <div
      v-if="showTitleBar"
      class="title-bar-editor-bg"
      :class="{ 'tabs-visible': showTabBar }"
    />
    <div
      v-if="showTitleBar"
      class="title-bar"
      :class="[
        { active: active },
        { 'tabs-visible': showTabBar },
        { frameless: titleBarStyle === 'custom' },
        { isOsx: isOsx }
      ]"
    >
      <div
        class="title"
        @dblclick.stop="toggleMaxmizeOnMacOS"
      >
        <span v-if="!filename">AnnotaMD</span>
        <span v-else>
          <span
            v-for="(path, index) of paths"
            :key="index"
          >
            {{ path }}
            <el-icon
              class="path-arrow"
              :size="12"
            >
              <ArrowRight />
            </el-icon>
          </span>
          <span
            class="filename"
            :class="{ isOsx: platform === 'darwin' }"
            @click="rename"
          >
            {{ filename }}
          </span>
          <span
            class="save-dot"
            :class="{ show: !isSaved }"
          />
        </span>
      </div>
      <div
        v-if="filename"
        class="title-pane-toggles title-no-drag"
        :class="{ 'with-window-controls': titleBarStyle === 'custom' && !isOsx }"
      >
        <button
          type="button"
          class="title-pane-toggle tab-comment-toggle"
          :class="{ 'is-active': commentPaneActive }"
          :title="t('annotamd.comments.title')"
          :aria-label="t('annotamd.comments.title')"
          :aria-pressed="commentPaneActive"
          @click.stop="openCommentPane"
        >
          <el-icon class="title-pane-icon" aria-hidden="true"><ChatLineRound /></el-icon>
          <span v-if="selectionCommentCount" class="title-pane-count">
            {{ selectionCommentCount }}
          </span>
        </button>
        <button
          type="button"
          class="title-pane-toggle tab-agent-toggle"
          :class="{ 'is-active': agentPaneActive }"
          :title="t('annotamd.agentWorkspace.open')"
          :aria-label="t('annotamd.agentWorkspace.open')"
          :aria-pressed="agentPaneActive"
          @click.stop="openAgentPane"
        >
          <el-icon class="title-pane-icon" aria-hidden="true"><Cpu /></el-icon>
        </button>
      </div>
      <div
        v-if="showCustomTitleBar"
        class="left-toolbar title-no-drag"
      >
        <div
          class="frameless-titlebar-menu title-no-drag"
          @click.stop="handleMenuClick"
        >
          <span class="text-center-vertical">&#9776;</span>
        </div>
      </div>
      <div
        v-if="titleBarStyle === 'custom' && !isFullScreen && !isOsx"
        class="right-toolbar"
        :class="[{ 'title-no-drag': titleBarStyle === 'custom' }]"
      >
        <div
          class="frameless-titlebar-button frameless-titlebar-close"
          @click.stop="handleCloseClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path :d="windowIconClose" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-toggle"
          @click.stop="handleMaximizeClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path
                v-show="!isMaximized"
                :d="windowIconMaximize"
              />
              <path
                v-show="isMaximized"
                :d="windowIconRestore"
              />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-minimize"
          @click.stop="handleMinimizeClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path :d="windowIconMinimize" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore } from '@/store/preferences.js'
import { useLayoutStore } from '@/store/layout.js'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR } from '../../config'
import { isOsx as isOsxPlatform } from '@/util'
import { shouldShowInAppTitleBar } from './visibility'
import { useEditorStore } from '@/store/editor'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'
import { useRightPaneStore } from '@/store/rightPane'
import { ArrowRight, ChatLineRound, Cpu } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { FileWordCount } from '@shared/types/files'

interface ProjectInfo {
  name?: string
}

const props = defineProps<{
  project?: ProjectInfo | null
  filename?: string
  pathname?: string
  active?: boolean
  wordCount?: FileWordCount | null
  platform?: string
  isSaved?: boolean
}>()

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const commentsStore = useAnnotaMDCommentsStore()
const rightPaneStore = useRightPaneStore()
const { t } = useI18n()

const isOsx = isOsxPlatform
const windowIconMinimize = minimizePath
const windowIconRestore = restorePath
const windowIconMaximize = maximizePath
const windowIconClose = closePath

const isFullScreen = ref(false)
const isMaximized = ref(false)

onMounted(async () => {
  try {
    const [fs, max] = await Promise.all([
      window.electron.windowControl.isFullScreen(),
      window.electron.windowControl.isMaximized()
    ])
    isFullScreen.value = !!fs
    isMaximized.value = !!max
  } catch {}
})

const { titleBarStyle } = storeToRefs(preferencesStore)
const { showTabBar } = storeToRefs(layoutStore)
const { paneVisible: commentPaneVisible } = storeToRefs(commentsStore)
const { mode: rightPaneMode } = storeToRefs(rightPaneStore)

const commentPaneActive = computed(() => (
  commentPaneVisible.value && rightPaneMode.value === 'comments'
))
const agentPaneActive = computed(() => rightPaneMode.value === 'agent')
const selectionCommentCount = computed(() => {
  if (!props.pathname) return 0
  return commentsStore
    .commentsForFile(props.pathname)
    .filter(comment => comment.scope === 'selection' && !comment.resolved).length
})

const openCommentPane = (): void => {
  if (commentPaneActive.value) return
  rightPaneStore.openComments()
  commentsStore.setPaneVisible(true)
}

const openAgentPane = (): void => {
  if (agentPaneActive.value) return
  commentsStore.setPaneVisible(false)
  rightPaneStore.openAgent()
}

const paths = computed(() => {
  if (!props.pathname) return []
  const pathnameToken = props.pathname.split(PATH_SEPARATOR).filter((i) => i)
  return pathnameToken.slice(0, pathnameToken.length - 1).slice(-3)
})

const showCustomTitleBar = computed(() => {
  return titleBarStyle.value === 'custom' && !isOsx
})

const showTitleBar = computed(() => {
  return shouldShowInAppTitleBar(titleBarStyle.value, isOsx)
})

watch(
  () => props.filename,
  (value) => {
    // Set filename when hover on dock
    const hasOpenFolder = !!(props.project && props.project.name)
    const projectName = props.project?.name ?? ''
    let title = ''
    if (value) {
      title = hasOpenFolder ? `${value} - ${projectName}` : `${value}`
    } else {
      title = hasOpenFolder ? projectName : ''
    }

    document.title = title
  }
)

const handleCloseClick = () => {
  window.electron.windowControl.close()
}

const handleMaximizeClick = async () => {
  if (isFullScreen.value) {
    window.electron.windowControl.setFullScreen(false)
    return
  }
  if (isMaximized.value) window.electron.windowControl.unmaximize()
  else window.electron.windowControl.maximize()
}

const toggleMaxmizeOnMacOS = () => {
  if (isOsx) {
    handleMaximizeClick()
  }
}

const handleMinimizeClick = () => {
  window.electron.windowControl.minimize()
}

const handleMenuClick = () => {
  window.electron.windowControl.popupApplicationMenu({ x: 23, y: 20 })
}

const rename = () => {
  if (props.platform === 'darwin') {
    editorStore.RESPONSE_FOR_RENAME()
  }
}

const onMaximize = () => {
  isMaximized.value = true
}
const onUnmaximize = () => {
  isMaximized.value = false
}
const onEnterFullScreen = () => {
  isFullScreen.value = true
}
const onLeaveFullScreen = () => {
  isFullScreen.value = false
}

const offMaximize = window.electron.ipcRenderer.on('annotamd::window-maximize', onMaximize)
const offUnmaximize = window.electron.ipcRenderer.on('annotamd::window-unmaximize', onUnmaximize)
const offEnterFullScreen = window.electron.ipcRenderer.on(
  'annotamd::window-enter-full-screen',
  onEnterFullScreen
)
const offLeaveFullScreen = window.electron.ipcRenderer.on(
  'annotamd::window-leave-full-screen',
  onLeaveFullScreen
)

onBeforeUnmount(() => {
  offMaximize()
  offUnmaximize()
  offEnterFullScreen()
  offLeaveFullScreen()
})
</script>

<style scoped>
.title-bar-editor-bg {
  height: var(--titleBarHeight);
  background: #ffffff;
  position: relative;
  left: 0;
  top: 0;
  right: 0;
}
.title-bar {
  -webkit-app-region: drag;
  user-select: none;
  background: rgba(255, 255, 255, 0.96);
  height: var(--titleBarHeight);
  box-sizing: border-box;
  color: #8f959e;
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
  border-bottom: 1px solid #eceff3;
  box-shadow: 0 1px 0 rgba(31, 35, 41, 0.02);
  backdrop-filter: blur(18px) saturate(1.2);
  transition: color 0.2s ease-in-out;
  cursor: default;
}
.active {
  color: #646a73;
}
img {
  height: 90%;
  margin-top: 1px;
  vertical-align: top;
}
.title {
  padding: 0 142px;
  height: 100%;
  line-height: var(--titleBarHeight);
  font-size: 13px;
  text-align: center;
  transition: all 0.25s ease-in-out;
  & .filename {
    transition: all 0.25s ease-in-out;
  }
  &::after {
    content: '';
    position: absolute;
    top: 0;
    height: 1px;
    width: 100%;
    z-index: 1;
    -webkit-app-region: no-drag;
  }
}
div.title > span {
  /* Workaround for GH#339 */
  display: block;
  direction: rtl;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}

.title-bar .title .filename.isOsx:hover {
  color: #3370ff;
}

.title-bar .path-arrow {
  margin: 0 3px;
  color: #c0c4cc;
  vertical-align: -2px;
}

.title-bar .filename {
  color: #1f2329;
  font-weight: 600;
}

.title-pane-toggles {
  position: absolute;
  top: 50%;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transform: translateY(-50%);
}
.title-pane-toggles.with-window-controls {
  right: 150px;
}
.title-pane-toggle {
  position: relative;
  display: inline-grid;
  width: 32px;
  height: 30px;
  padding: 0;
  place-items: center;
  color: #646a73;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}
.title-pane-toggle:hover {
  color: #1f2329;
  background: #f3f5f7;
}
.title-pane-toggle.is-active {
  color: var(--annotamd-green, #159f67);
  background: #eaf7f0;
  background: color-mix(in srgb, var(--annotamd-green, #159f67) 12%, #fff);
}
.title-pane-toggle:active {
  transform: scale(0.96);
}
.title-pane-toggle:focus-visible {
  outline: 2px solid var(--annotamd-green, #159f67);
  outline-offset: 1px;
}
.title-pane-icon,
.title-pane-icon svg {
  width: 17px;
  height: 17px;
}
.title-pane-count {
  position: absolute;
  top: -3px;
  right: -3px;
  box-sizing: border-box;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  color: #fff;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #3370ff;
  font-size: 8px;
  font-weight: 600;
  line-height: 11px;
  text-align: center;
}

.active .save-dot {
  margin-right: 0.25rem;
  width: 8px;
  height: 8px;
  display: inline-block;
  border-radius: 50%;
  background: #3370ff;
  opacity: 0.7;
  visibility: hidden;
}
.active .save-dot.show {
  visibility: visible;
}
.title:hover {
  color: #1f2329;
}

.left-toolbar {
  padding: 0 10px;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  width: 118px; /* + 2*10px padding*/
  display: flex;
  flex-direction: row;
}
.right-toolbar {
  height: 100%;
  position: absolute;
  top: 0;
  right: 14px;
  width: auto;
  min-width: 186px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-direction: row;
  & .item {
    display: none;
  }
}

.title-no-drag {
  -webkit-app-region: no-drag;
}
/* frameless window controls */
.frameless-titlebar-button {
  position: relative;
  display: block;
  width: 46px;
  height: var(--titleBarHeight);
}
.frameless-titlebar-button > div {
  position: absolute;
  display: inline-flex;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
}
.frameless-titlebar-menu {
  color: #646a73;
}
.frameless-titlebar-close:hover {
  background-color: rgb(228, 79, 79);
}
.frameless-titlebar-minimize:hover,
.frameless-titlebar-toggle:hover {
  background-color: rgba(0, 0, 0, 0.1);
}
.frameless-titlebar-button svg {
  fill: #000000;
}
.frameless-titlebar-close:hover svg {
  fill: #ffffff;
}

.text-center-vertical {
  display: inline-block;
  vertical-align: middle;
  line-height: normal;
}
</style>
