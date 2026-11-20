<template>
  <el-popover
    :visible="visible"
    placement="top-end"
    :width="280"
    trigger="click"
    popper-class="annotamd-agent-model-popover"
    @update:visible="emit('update:visible', $event)"
    @show="loadModels"
  >
    <template #reference>
      <button
        type="button"
        class="annotamd-agent-model-trigger"
        data-testid="ai-model-selector"
        :title="triggerTitle"
        :aria-label="triggerTitle"
      >
        <AiProviderLogo
          v-if="selectedConfig"
          :provider="selectedConfig.provider"
          :label="providerLabel(selectedConfig.provider)"
          :class="{ 'is-pi': selectedConfig.provider === 'pi' }"
        />
        <el-icon v-else><Setting /></el-icon>
        <span class="annotamd-agent-model-label">{{ triggerLabel }}</span>
        <el-icon aria-hidden="true"><ArrowDown /></el-icon>
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
      <div v-if="selectedConfig" class="annotamd-agent-model-options">
        <label>
          <span>{{ t('annotamd.agentWorkspace.modelId') }}</span>
          <el-select
            ref="modelSelect"
            :model-value="selection.modelId || selectedConfig.defaultModelId || 'default'"
            size="small"
            filterable
            :teleported="false"
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
import { computed, ref, watch } from 'vue'
import { ArrowDown, Setting } from '@element-plus/icons-vue'
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
let loadVersion = 0
const configs = computed(() => settings.configsForMode('agent'))
const selection = computed(() => settings.selections.agent)
const selectedConfig = computed(() => settings.selectedConfig('agent'))
const selectedModelId = computed(() => (
  settings.selectedAgentModel || props.runtimeModel || ''
))
const selectedModel = computed(() => {
  return models.value.find(model => model.id === selectedModelId.value)
})
const effortLevels = computed(() => Array.from(new Set(selectedModel.value?.effortLevels ?? [])))
const triggerTitle = computed(() => (
  selectedModelId.value ||
  selectedConfig.value?.name || t('annotamd.agentWorkspace.selectModel')
))
const triggerLabel = computed(() => (
  selectedConfig.value?.provider === 'pi' && selectedModelId.value
    ? selectedModelId.value.slice(selectedModelId.value.indexOf('/') + 1)
    : triggerTitle.value
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
  const version = ++loadVersion
  const configId = selectedConfig.value?.id
  const cached = configId ? settings.cachedModels(configId) : []
  models.value = cached
  modelError.value = ''
  loadingModels.value = Boolean(configId && cached.length === 0)
  if (!configId) return
  try {
    const available = await settings.listModels(configId)
    if (version !== loadVersion) return
    models.value = available
    resetUnsupportedEffort()
  } catch (error) {
    if (version === loadVersion) modelError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (version === loadVersion) loadingModels.value = false
  }
}
watch(() => settings.agentReadiness, () => {
  if (props.visible) void loadModels()
})
const openSettings = (): void => {
  window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent')
}
</script>

<style scoped>
.annotamd-agent-model-trigger { display: inline-flex; min-width: 0; height: 28px; align-items: center; gap: 5px; padding: 0 7px; color: var(--annotamd-text); border: 1px solid transparent; border-radius: 7px; background: var(--annotamd-fill-soft); font-size: 11px; font-weight: 550; cursor: pointer; }
.annotamd-agent-model-trigger:hover, .annotamd-agent-model-trigger[aria-expanded="true"] { border-color: var(--annotamd-border); }
.annotamd-agent-model-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-model-trigger > .el-icon { flex: none; }
.annotamd-agent-model-trigger :deep(svg) { width: 13px; height: 13px; }
:global(body.dark .annotamd-agent-model-trigger .is-pi img) { filter: invert(1); }
.annotamd-agent-model-menu { display: grid; min-width: 0; }
.annotamd-agent-model-menu > header { display: grid; gap: 2px; padding: 1px 2px 10px; border-bottom: 1px solid var(--annotamd-border-soft); }
.annotamd-agent-model-menu > header strong { color: var(--annotamd-text); font-size: 13px; line-height: 1.35; }
.annotamd-agent-model-menu > header small { color: var(--annotamd-muted); font-size: 10px; line-height: 1.45; }
.annotamd-agent-model-empty { display: grid; justify-items: center; gap: 8px; padding: 12px 0 2px; }
.annotamd-agent-model-empty p { margin: 0; color: var(--annotamd-muted); font-size: 11px; text-align: center; }
.annotamd-agent-model-empty button { min-height: 28px; padding: 0 10px; color: #fff; border: 0; border-radius: 6px; background: var(--annotamd-blue); font-size: 11px; cursor: pointer; }
.annotamd-agent-model-options { display: grid; gap: 10px; padding-top: 10px; border-top: 1px solid var(--annotamd-border-soft); }
.annotamd-agent-model-menu small, .annotamd-agent-model-menu label > span { color: var(--annotamd-muted); font-size: 10px; }
.annotamd-agent-model-menu small.is-error { color: #ef4444; }
.annotamd-agent-model-menu label { display: grid; gap: 5px; }
.annotamd-agent-model-menu label > span { font-weight: 500; }
.annotamd-agent-model-menu label :deep(.el-select__wrapper) { min-height: 32px; border-radius: 7px; box-shadow: 0 0 0 1px var(--annotamd-border) inset; }
.annotamd-agent-model-menu label :deep(.el-select__wrapper.is-focused) { box-shadow: 0 0 0 1px var(--annotamd-green) inset; }
.annotamd-agent-model-trigger:focus-visible, .annotamd-agent-model-menu button:focus-visible { outline: 2px solid var(--annotamd-agent-accent); outline-offset: 1px; }
</style>
