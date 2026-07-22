<template>
  <template v-if="sidebar">
    <button
      v-if="showCompact"
      type="button"
      class="app-update-sidebar"
      :class="`is-${state.status}`"
      :disabled="busy"
      :title="statusText"
      :aria-label="statusText"
      @click.stop="runAction"
    >
      <Download class="app-update-icon" aria-hidden="true" />
    </button>
  </template>

  <div v-else class="app-update-panel">
    <div class="app-update-copy">
      <div class="app-update-version">
        {{ t('updates.currentVersion', { version: state.currentVersion }) }}
      </div>
      <div class="app-update-status" :class="{ error: state.status === 'error' }">
        {{ statusText }}
      </div>
      <div v-if="state.status === 'downloading'" class="app-update-progress" aria-hidden="true">
        <span :style="{ width: `${roundedProgress}%` }" />
      </div>
    </div>
    <el-button
      size="small"
      :type="state.status === 'downloaded' ? 'primary' : 'default'"
      :loading="busy"
      :disabled="state.status === 'downloading'"
      @click="runAction"
    >
      {{ actionLabel }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download } from '@element-plus/icons-vue'
import type { AppUpdateState } from '@shared/types/update'

withDefaults(defineProps<{ sidebar?: boolean }>(), { sidebar: false })

const { t } = useI18n()
const state = reactive<AppUpdateState>({
  status: 'idle',
  currentVersion: ''
})
let stopUpdateListener: (() => void) | null = null

const applyState = (next: AppUpdateState): void => {
  Object.assign(state, next)
}

const roundedProgress = computed(() => Math.round(state.progress ?? 0))
const busy = computed(() => state.status === 'checking' || state.status === 'downloading')
const manualInstallRequired = computed(() => Boolean(state.manualInstallRequired))
const showCompact = computed(() => {
  if (state.status === 'error') return Boolean(state.version)
  return ['available', 'downloading', 'downloaded'].includes(state.status)
})

const statusText = computed(() => {
  switch (state.status) {
    case 'checking':
      return t('updates.checking')
    case 'available':
      return manualInstallRequired.value
        ? `${t('updates.available', { version: state.version ?? '' })} ${t('updates.unsupported')}`
        : t('updates.available', { version: state.version ?? '' })
    case 'downloading':
      return t('updates.downloading', { progress: roundedProgress.value })
    case 'downloaded':
      return t('updates.downloaded', { version: state.version ?? '' })
    case 'up-to-date':
      return t('updates.upToDate')
    case 'error':
      return t('updates.error')
    case 'unsupported':
      return t('updates.unsupported')
    default:
      return manualInstallRequired.value ? t('updates.unsupported') : t('updates.ready')
  }
})

const actionLabel = computed(() => {
  switch (state.status) {
    case 'available':
      return manualInstallRequired.value ? t('updates.viewDownloads') : t('updates.download')
    case 'downloading':
      return `${roundedProgress.value}%`
    case 'downloaded':
      return t('updates.restart')
    case 'checking':
      return t('updates.checkingShort')
    case 'error':
      return state.version ? t('updates.retryDownload') : t('updates.retry')
    case 'unsupported':
      return t('updates.viewDownloads')
    default:
      return t('updates.check')
  }
})

const runAction = async(): Promise<void> => {
  let next: AppUpdateState | null = null
  if (
    state.status === 'unsupported' ||
    (manualInstallRequired.value && (
      state.status === 'available' || (state.status === 'error' && Boolean(state.version))
    ))
  ) {
    await window.electron.shell.openExternal('https://github.com/TyroneXie/AnnotaMD/releases/latest')
    return
  }
  if (state.status === 'available' || (state.status === 'error' && state.version)) {
    next = await window.electron.ipcRenderer.invoke('annotamd::update:download')
  } else if (state.status === 'downloaded') {
    next = await window.electron.ipcRenderer.invoke('annotamd::update:install')
  } else if (!busy.value) {
    next = await window.electron.ipcRenderer.invoke('annotamd::update:check')
  }
  if (next) applyState(next)
}

onMounted(async() => {
  stopUpdateListener = window.electron.ipcRenderer.on('annotamd::update:state', (_event, next) => {
    applyState(next)
  })
  applyState(await window.electron.ipcRenderer.invoke('annotamd::update:get-state'))
})

onBeforeUnmount(() => {
  stopUpdateListener?.()
  stopUpdateListener = null
})
</script>

<style scoped>
.app-update-sidebar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: #e8f1ff;
  color: #3370ff;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
}

.app-update-sidebar:hover:not(:disabled) {
  background: #dce9ff;
  box-shadow: inset 0 0 0 1px rgba(51, 112, 255, 0.12);
}

.app-update-sidebar.is-downloaded {
  background: #e8f8ef;
  color: #1f9d55;
}

.app-update-sidebar.is-error {
  background: #fff1ef;
  color: #d14343;
}

.app-update-icon {
  width: 17px;
  height: 17px;
}

.app-update-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--prefControlWidth);
  align-items: center;
  gap: 16px;
  min-height: 52px;
  margin: 4px 0;
  color: var(--editorColor);
  font-size: 14px;
}

.app-update-copy {
  flex: 1;
  min-width: 0;
}

.app-update-version {
  color: var(--editorColor);
  font-size: 14px;
  line-height: 20px;
}

.app-update-status {
  color: var(--editorColor50);
  font-size: 12px;
  line-height: 18px;
}

.app-update-status.error {
  color: var(--notificationErrorBg);
}

.app-update-progress {
  width: min(280px, 100%);
  height: 3px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--editorColor10);
}

.app-update-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--themeColor);
  transition: width 0.16s ease;
}

.app-update-panel :deep(.el-button) {
  justify-self: end;
  min-width: 104px;
  height: 28px;
  margin: 0;
  font-size: 13px;
}
</style>
