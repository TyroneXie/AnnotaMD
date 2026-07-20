<template>
  <button
    v-if="sidebar && showCompact"
    type="button"
    class="app-update-sidebar"
    :class="`is-${state.status}`"
    :disabled="busy"
    :title="statusText"
    :aria-label="statusText"
    @click.stop="runAction"
  >
    <span class="app-update-icon" :class="{ spinning: busy }" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path v-if="state.status === 'downloaded'" d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
        <path v-else-if="state.status === 'error'" d="M12 4 3.5 20h17L12 4Zm0 5v5m0 3v.5" />
        <template v-else-if="state.status === 'available'">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
          <path d="M5 20h14" />
        </template>
        <template v-else>
          <path d="M12 3a9 9 0 1 0 8.5 6" />
          <path d="M17 3h4v4" />
        </template>
      </svg>
    </span>
    <span v-if="state.status === 'downloading'" class="app-update-sidebar-progress">
      {{ roundedProgress }}
    </span>
  </button>

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
const showCompact = computed(() => {
  if (state.status === 'error') return Boolean(state.version)
  return ['available', 'downloading', 'downloaded'].includes(state.status)
})

const statusText = computed(() => {
  switch (state.status) {
    case 'checking':
      return t('updates.checking')
    case 'available':
      return t('updates.available', { version: state.version ?? '' })
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
      return t('updates.ready')
  }
})

const actionLabel = computed(() => {
  switch (state.status) {
    case 'available':
      return t('updates.download')
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
  if (state.status === 'unsupported') {
    await window.electron.shell.openExternal('https://github.com/TyroneXie/AnnotaMD/releases/latest')
    return
  }
  if (state.status === 'available' || (state.status === 'error' && state.version)) {
    next = await window.electron.ipcRenderer.invoke('mt::update:download')
  } else if (state.status === 'downloaded') {
    next = await window.electron.ipcRenderer.invoke('mt::update:install')
  } else if (!busy.value) {
    next = await window.electron.ipcRenderer.invoke('mt::update:check')
  }
  if (next) applyState(next)
}

onMounted(async() => {
  stopUpdateListener = window.electron.ipcRenderer.on('mt::update:state', (_event, next) => {
    applyState(next)
  })
  applyState(await window.electron.ipcRenderer.invoke('mt::update:get-state'))
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

.app-update-sidebar-progress {
  position: absolute;
  right: -3px;
  bottom: -2px;
  min-width: 16px;
  height: 12px;
  padding: 0 2px;
  border: 1px solid #fbfcfd;
  border-radius: 99px;
  background: #3370ff;
  color: #fff;
  font-size: 7px;
  line-height: 11px;
  box-sizing: border-box;
}

.app-update-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
}

.app-update-icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-update-icon.spinning {
  animation: app-update-spin 1s linear infinite;
}

.app-update-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 52px;
}

.app-update-copy {
  flex: 1;
  min-width: 0;
}

.app-update-version {
  color: var(--editorColor);
  font-size: 13px;
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

@keyframes app-update-spin {
  to { transform: rotate(360deg); }
}
</style>
