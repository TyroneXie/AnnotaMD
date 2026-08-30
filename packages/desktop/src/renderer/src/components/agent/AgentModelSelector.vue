<template>
  <el-popover
    :visible="visible"
    placement="top-end"
    :width="280"
    trigger="click"
    @update:visible="emit('update:visible', $event)"
    @show="loadModels"
  >
    <template #reference>
      <button type="button" class="annotamd-agent-model-trigger" data-testid="ai-model-selector">
        <AiProviderLogo
          v-if="selectedConfig"
          :provider="selectedConfig.provider"
          :label="providerLabel(selectedConfig.provider)"
        />
        <el-icon v-else><Setting /></el-icon>
        <span class="annotamd-agent-model-label">{{ triggerLabel }}</span>
        <el-icon><ArrowDown /></el-icon>
      </button>
    </template>
    <div class="annotamd-agent-model-menu">
      <header>
        <strong>{{ t('annotamd.agentWorkspace.model') }}</strong>
        <small>{{ t('annotamd.agentWorkspace.modelDescription') }}</small>
      </header>
      <div v-if="configs.length === 0" class="annotamd-agent-model-empty">
        <p>{{ t('annotamd.agentWorkspace.configureAgent') }}</p>
        <button type="button" data-testid="ai-model-open-settings" @click="openSettings">
          {{ t('annotamd.agentWorkspace.openSettings') }}
        </button>
      </div>
      <div v-else class="annotamd-agent-provider-list">
        <button
          v-for="config in configs"
          :key="config.id"
          type="button"
          :class="{ 'is-active': config.id === selection.configId }"
          :aria-pressed="config.id === selection.configId"
          @click="selectConfig(config.id)"
        >
          <AiProviderLogo :provider="config.provider" :label="providerLabel(config.provider)" />
          <span class="annotamd-agent-model-config-copy">
            <b>{{ config.name }}</b><small>{{ providerLabel(config.provider) }}</small>
          </span>
          <el-icon v-if="config.id === selection.configId"><Check /></el-icon>
        </button>
      </div>
      <div v-if="selectedConfig" class="annotamd-agent-model-options">
        <label>
          <span>{{ t('annotamd.agentWorkspace.modelId') }}</span>
          <el-select
            ref="modelSelect"
            :model-value="selection.modelId || selectedConfig.defaultModelId || runtimeModel"
            size="small"
            :teleported="false"
            filterable
            allow-create
            default-first-option
            :placeholder="runtimeModel || t('annotamd.agentWorkspace.modelId')"
            @change="selectModel"
          >
            <el-option v-for="model in models" :key="model.id" :value="model.id" :label="model.name || model.id" />
          </el-select>
          <small v-if="loadingModels">{{ t('annotamd.agentWorkspace.loadingModels') }}</small>
          <small v-else-if="modelError" class="is-error">{{ modelError }}</small>
        </label>
        <label>
          <span>{{ t('annotamd.agentWorkspace.effort') }}</span>
          <el-select
            ref="effortSelect"
            :model-value="effortId"
            size="small"
            :teleported="false"
            @change="selectEffort"
          >
            <el-option value="provider-default" :label="t('annotamd.agentWorkspace.effortDefault')" />
            <el-option
              v-for="level in effortLevels"
              :key="level"
              :value="level"
              :label="effortLabel(level)"
            />
          </el-select>
        </label>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, Check, Setting } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { AiModelInfo, AiProviderId } from '@shared/types/aiWorkspace'
import { aiProviderOption } from '@shared/types/aiProviderPresets'
import { useAiSettingsStore } from '@/store/aiSettings'
import AiProviderLogo from './AiProviderLogo.vue'

const props = defineProps<{ runtimeModel?: string; visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [visible: boolean] }>()
const { t } = useI18n()
const settings = useAiSettingsStore()
const models = ref<AiModelInfo[]>([])
const modelSelect = ref<{ blur: () => void } | null>(null)
const effortSelect = ref<{ blur: () => void } | null>(null)
const loadingModels = ref(false)
const modelError = ref('')
const configs = computed(() => settings.configsForMode('agent'))
const selection = computed(() => settings.selections.agent)
const selectedConfig = computed(() => settings.selectedConfig('agent'))
const selectedModelId = computed(() => (
  selection.value.modelId || selectedConfig.value?.defaultModelId || props.runtimeModel || ''
))
const selectedModel = computed(() => {
  const modelId = selectedModelId.value === 'default' && props.runtimeModel
    ? props.runtimeModel
    : selectedModelId.value
  return models.value.find(model => model.id === modelId)
})
const effortLevels = computed(() => Array.from(new Set(selectedModel.value?.effortLevels ?? [])))
const triggerLabel = computed(() => (
  selectedModelId.value ||
  selectedConfig.value?.name || t('annotamd.agentWorkspace.selectModel')
))
const effortId = computed(() => (
  selection.value.effort.kind === 'preset'
    ? selection.value.effort.id
    : 'provider-default'
))
const providerLabel = (provider: AiProviderId): string => aiProviderOption(provider).label
const effortLabel = (level: string): string => {
  const normalized = level.trim().toLocaleLowerCase()
  const known: Record<string, string> = {
    none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High',
    xhigh: 'Xhigh', max: 'Max', ultra: 'Ultra', off: 'Off'
  }
  return known[normalized] ?? normalized.replace(/(^|[-_\s]+)(\w)/g, (_match, _separator, char) => (
    String(char).toLocaleUpperCase()
  ))
}
const resetUnsupportedEffort = (): void => {
  if (selection.value.effort.kind !== 'preset') return
  if (effortLevels.value.includes(selection.value.effort.id)) return
  settings.selectEffort('agent', { kind: 'provider-default' })
}
const selectEffort = (value: string): void => {
  settings.selectEffort('agent', value === 'provider-default'
    ? { kind: 'provider-default' }
    : { kind: 'preset', id: value })
  window.setTimeout(() => effortSelect.value?.blur(), 0)
}
const selectModel = (value: unknown): void => {
  settings.selectModel('agent', typeof value === 'string' ? value : undefined)
  resetUnsupportedEffort()
  window.setTimeout(() => modelSelect.value?.blur(), 0)
}
const loadModels = async(): Promise<void> => {
  if (!selectedConfig.value) return
  const configId = selectedConfig.value.id
  const cached = settings.cachedModels(configId)
  models.value = cached
  loadingModels.value = cached.length === 0
  modelError.value = ''
  try {
    models.value = await settings.listModels(configId)
    resetUnsupportedEffort()
  } catch (error) {
    if (models.value.length === 0) models.value = []
    modelError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingModels.value = false
  }
}
const selectConfig = (id: string): void => {
  settings.selectConfig('agent', id)
  settings.selectEffort('agent', { kind: 'provider-default' })
  void loadModels()
}
const openSettings = (): void => {
  window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent')
}
</script>

<style scoped>
.annotamd-agent-model-trigger { display: inline-flex; min-width: 0; max-width: 180px; height: 25px; align-items: center; gap: 5px; padding: 0 8px; color: var(--annotamd-muted); border: 1px solid var(--annotamd-border); border-radius: 6px; background: var(--annotamd-surface); font-size: 11px; cursor: pointer; }
.annotamd-agent-model-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-model-trigger :deep(svg) { width: 13px; height: 13px; }
.annotamd-agent-model-menu { display: grid; min-width: 0; }
.annotamd-agent-model-menu > header { display: grid; gap: 2px; padding: 1px 2px 10px; border-bottom: 1px solid var(--annotamd-border-soft); }
.annotamd-agent-model-menu > header strong { color: var(--annotamd-text); font-size: 13px; line-height: 1.35; }
.annotamd-agent-model-menu > header small { color: var(--annotamd-muted); font-size: 10px; line-height: 1.45; }
.annotamd-agent-model-empty { display: grid; justify-items: center; gap: 8px; padding: 12px 0 2px; }
.annotamd-agent-model-empty p { margin: 0; color: var(--annotamd-muted); font-size: 11px; text-align: center; }
.annotamd-agent-model-empty button { min-height: 28px; padding: 0 10px; color: #fff; border: 0; border-radius: 6px; background: var(--annotamd-blue); font-size: 11px; cursor: pointer; }
.annotamd-agent-provider-list { display: grid; gap: 5px; padding: 9px 0; }
.annotamd-agent-provider-list > button { display: grid; min-height: 48px; grid-template-columns: 30px minmax(0, 1fr) 18px; align-items: center; gap: 9px; padding: 6px 9px; color: var(--annotamd-text); border: 1px solid var(--annotamd-border); border-radius: 8px; background: var(--annotamd-surface); text-align: left; cursor: pointer; transition: background-color .15s ease, border-color .15s ease; }
.annotamd-agent-provider-list > button:hover { border-color: color-mix(in srgb, var(--annotamd-green) 18%, var(--annotamd-border)); background: var(--annotamd-fill-soft); }
.annotamd-agent-provider-list > button.is-active { border-color: color-mix(in srgb, var(--annotamd-green) 28%, var(--annotamd-border)); background: color-mix(in srgb, var(--annotamd-green) 8%, var(--annotamd-surface)); }
.annotamd-agent-provider-list > button > :deep(.annotamd-ai-provider-logo) { width: 26px; height: 26px; }
.annotamd-agent-provider-list > button > svg { width: 15px; height: 15px; color: var(--annotamd-green); }
.annotamd-agent-model-config-copy { display: grid; min-width: 0; flex: 1; }
.annotamd-agent-model-config-copy b { overflow: hidden; font-size: 12px; font-weight: 600; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-model-config-copy small { overflow: hidden; color: var(--annotamd-muted); font-size: 10px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-model-options { display: grid; gap: 10px; padding-top: 10px; border-top: 1px solid var(--annotamd-border-soft); }
.annotamd-agent-model-menu small, .annotamd-agent-model-menu label > span { color: var(--annotamd-muted); font-size: 10px; }
.annotamd-agent-model-menu small.is-error { color: #ef4444; }
.annotamd-agent-model-menu label { display: grid; gap: 5px; }
.annotamd-agent-model-menu label > span { font-weight: 500; }
.annotamd-agent-model-menu label :deep(.el-select__wrapper) { min-height: 32px; border-radius: 7px; box-shadow: 0 0 0 1px var(--annotamd-border) inset; }
.annotamd-agent-model-menu label :deep(.el-select__wrapper.is-focused) { box-shadow: 0 0 0 1px var(--annotamd-green) inset; }
.annotamd-agent-model-trigger:focus-visible, .annotamd-agent-model-menu button:focus-visible { outline: 2px solid var(--annotamd-green); outline-offset: 1px; }
</style>
