<template>
  <div class="pref-general">
    <h4>{{ t('preferences.general.title') }}</h4>
    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.autoSave.title') }}
        </h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.autoSave.description')"
          :bool="autoSave"
          :on-change="(value) => onSelectChange('autoSave', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.sidebar.title') }}
        </h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.sidebar.wrapTextInToc')"
          :bool="wordWrapInToc"
          :on-change="(value) => onSelectChange('wordWrapInToc', value)"
        />
        <bool
          :description="t('preferences.general.sidebar.showOpenedFiles')"
          :bool="openedFilesInSidebar"
          :on-change="(value) => onSelectChange('openedFilesInSidebar', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.startup.startupFilesFolders') }}</h6>
      </template>
      <template #children>
        <section>
          <el-radio-group v-model="startUpAction" class="startup-action-ctrl">
            <!--
              Hide "lastState" for now (#2064).
            <el-radio class="ag-underdevelop" label="lastState">Restore last editor session</el-radio>
            -->
            <el-radio label="restoreAll">
              {{ t('preferences.general.startup.restoreAll') }}
            </el-radio>
            <el-radio label="openLastFolder">
              {{ t('preferences.general.startup.openLastFolder') }}
            </el-radio>
            <div>
              <el-radio label="folder">
                {{ t('preferences.general.startup.openDefaultDirectory')
                }}<span>: {{ defaultDirectoryToOpen }}</span>
              </el-radio>
              <el-button size="small" @click="selectDefaultDirectoryToOpen">
                {{ t('preferences.general.startup.selectFolder') }}
              </el-button>
            </div>
            <div>
              <el-radio label="blank">
                {{ t('preferences.general.startup.openBlankPage') }}
              </el-radio>
            </div>
          </el-radio-group>
        </section>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.window.title') }}
        </h6>
      </template>
      <template #children>
        <cur-select
          v-if="!isOsx"
          :description="t('preferences.general.window.titleBarStyle.title')"
          :notes="t('preferences.general.window.requiresRestart')"
          :value="titleBarStyle"
          :options="getTitleBarStyleOptions()"
          :on-change="(value) => onSelectChange('titleBarStyle', value)"
        />
        <bool
          :description="t('preferences.general.window.openItemsInNewWindow')"
          :bool="openItemsInNewWindow"
          :on-change="(value) => (openItemsInNewWindow = value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.startup.layoutOptions') }}</h6>
      </template>
      <template #children>
        <section>
          <el-radio-group v-model="restoreLayoutState" class="startup-action-ctrl">
            <el-radio :label="true">
              {{ t('preferences.general.startup.restorePreviousState') }}
            </el-radio>
            <el-radio :label="false">
              {{ t('preferences.general.startup.openBlankState') }}
            </el-radio>
          </el-radio-group>
        </section>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('updates.title') }}</h6>
      </template>
      <template #children>
        <bool
          :description="t('updates.autoDownload')"
          :notes="t('updates.manualInstallNote')"
          :bool="autoDownloadUpdates"
          :on-change="(value) => onSelectChange('autoDownloadUpdates', value)"
        />
        <app-update-control />
      </template>
    </compound>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import CurSelect from '../common/select/index.vue'
import Bool from '../common/bool/index.vue'
import { isOsx } from '@/util'
import AppUpdateControl from '@/components/appUpdate/AppUpdateControl.vue'

import { getTitleBarStyleOptions } from './config'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  autoSave,
  autoDownloadUpdates,
  titleBarStyle,
  defaultDirectoryToOpen,
  wordWrapInToc,
  openedFilesInSidebar
} = storeToRefs(preferenceStore)

const openItemsInNewWindow = computed<boolean>({
  get: () => preferenceStore.openFilesInNewWindow && preferenceStore.openFolderInNewWindow,
  set: (value: boolean) => {
    onSelectChange('openFilesInNewWindow', value)
    onSelectChange('openFolderInNewWindow', value)
  }
})

const startUpAction = computed<string>({
  get: () => preferenceStore.startUpAction,
  set: (value: string) => {
    const type = 'startUpAction'
    preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
  }
})

const restoreLayoutState = computed<boolean>({
  get: () => preferenceStore.restoreLayoutState,
  set: (value: boolean) => {
    const type = 'restoreLayoutState'
    preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
  }
})

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

const selectDefaultDirectoryToOpen = (): void => {
  preferenceStore.SELECT_DEFAULT_DIRECTORY_TO_OPEN()
}
</script>

<style scoped>
.pref-general .startup-action-ctrl div {
  display: flex;
  align-items: center;
}
.pref-general .startup-action-ctrl {
  font-size: 14px;
  user-select: none;
  color: var(--editorColor);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.pref-general .startup-action-ctrl .el-button--small {
  margin-left: 10px;
}

.pref-general .startup-action-ctrl :deep(.el-radio) {
  height: 32px;
  margin: 0;
  line-height: 32px;
}
</style>
