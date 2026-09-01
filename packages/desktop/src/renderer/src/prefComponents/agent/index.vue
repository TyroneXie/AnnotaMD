<template>
  <div class="pref-ai">
    <section class="pref-ai-section">
      <header>
        <h4>{{ t('preferences.theme.title') }}</h4>
      </header>
      <Range
        :description="t('preferences.editor.textEditor.fontSize')"
        :value="agentFontSize"
        :min="10"
        :max="18"
        :step="1"
        :on-change="(value) => onSelectChange('agentFontSize', value)"
      />
    </section>

    <section class="pref-ai-section">
      <header>
        <h4>{{ t('preferences.agent.aiWorkspace.configsTitle') }}</h4>
        <el-button type="primary" :icon="Plus" @click="openConfigDialog">
          {{ t('preferences.agent.aiWorkspace.addConfig') }}
        </el-button>
      </header>

      <div v-if="agentConfigs.length === 0" class="pref-ai-empty">
        <span><Cpu /></span>
        <div>
          <strong>{{ t('preferences.agent.aiWorkspace.noConfigs') }}</strong>
          <small>{{ t('preferences.agent.aiWorkspace.noConfigsDescription') }}</small>
        </div>
      </div>
      <div v-else class="pref-ai-config-list">
        <article
          v-for="config in agentConfigs"
          :key="config.id"
          class="pref-ai-config-card"
          :class="{ 'is-default': config.isDefault }"
        >
          <div class="pref-ai-config-icon">
            <AiProviderLogo :provider="config.provider" :label="providerLabel(config.provider)" />
          </div>
          <div class="pref-ai-config-title">
            <strong>{{ config.name }}</strong>
            <em v-if="config.isDefault">{{ t('preferences.agent.aiWorkspace.default') }}</em>
          </div>
          <div class="pref-ai-config-actions">
            <button v-if="!config.isDefault" type="button" @click="setDefaultConfig(config.id)">
              {{ t('preferences.agent.aiWorkspace.setDefault') }}
            </button>
            <button
              type="button"
              :disabled="configTests[config.id]?.status === 'testing'"
              :data-testid="`ai-config-test-${config.id}`"
              @click="testConfig(config)"
            >
              {{ configTests[config.id]?.status === 'testing'
                ? t('preferences.agent.aiWorkspace.testing')
                : t('preferences.agent.aiWorkspace.test') }}
            </button>
            <button type="button" @click="openEditDialog(config)">
              {{ t('preferences.agent.aiWorkspace.edit') }}
            </button>
            <button type="button" class="is-danger" @click="deleteConfig(config.id)">
              {{ t('preferences.agent.aiWorkspace.delete') }}
            </button>
          </div>
          <small class="pref-ai-config-summary">{{ configSummary(config) }}</small>
          <small
            v-if="configTests[config.id]"
            class="pref-ai-test-result"
            :class="`is-${configTests[config.id]!.status}`"
            role="status"
          >
            {{ configTests[config.id]!.message }}
          </small>
        </article>
      </div>
    </section>

    <AgentIntegrationGuide />

    <el-alert
      v-if="settings.error"
      class="pref-ai-error"
      type="error"
      :closable="false"
      show-icon
      :title="settings.error"
    />

    <el-dialog
      v-model="configDialogVisible"
      class="pref-ai-config-dialog"
      :title="editingConfigId ? t('preferences.agent.aiWorkspace.editConfig') : t('preferences.agent.aiWorkspace.addConfig')"
      width="620px"
      append-to-body
      @closed="clearDetection"
    >
      <el-form label-position="top">
        <el-form-item :label="t('preferences.agent.aiWorkspace.name')">
          <el-input v-model="configDraft.name" :placeholder="t('preferences.agent.aiWorkspace.namePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('preferences.agent.aiWorkspace.provider')">
          <div class="pref-ai-provider-select">
            <AiProviderLogo
              :provider="configDraft.provider"
              :label="providerLabel(configDraft.provider)"
            />
            <el-select
              v-model="configDraft.provider"
              style="width: 100%"
              @change="applyProviderPreset"
            >
              <el-option
                v-for="provider in providerOptions"
                :key="provider.id"
                :label="provider.label"
                :value="provider.id"
              >
                <span class="pref-ai-provider-option">
                  <AiProviderLogo :provider="provider.id" :label="provider.label" />
                  <span>{{ provider.label }}</span>
                </span>
              </el-option>
            </el-select>
          </div>
        </el-form-item>

        <div
          class="pref-ai-cli-detection"
          :class="{
            'is-found': cliDetection?.found,
            'is-missing': cliDetection && !cliDetection.found
          }"
          data-testid="ai-cli-detection"
        >
          <span class="pref-ai-cli-status-dot" aria-hidden="true" />
          <div>
            <strong>{{ cliDetectionTitle }}</strong>
            <p>{{ cliDetectionMessage }}</p>
          </div>
          <el-button
            size="small"
            :icon="Refresh"
            :loading="cliDetecting"
            data-testid="ai-cli-redetect"
            @click="detectSelectedCli"
          >
            {{ t('preferences.agent.aiWorkspace.redetect') }}
          </el-button>
          <el-button
            v-if="cliDetection?.found && !editingConfigId"
            type="primary"
            size="small"
            data-testid="ai-cli-one-click-configure"
            @click="oneClickConfigure"
          >
            {{ t('preferences.agent.aiWorkspace.oneClickConfigure') }}
          </el-button>
        </div>

        <el-form-item :label="t('preferences.agent.aiWorkspace.executablePath')">
          <el-input
            v-model="configDraft.executablePath"
            :placeholder="selectedCliCommand"
            @change="detectSelectedCli"
          />
          <small>{{ t('preferences.agent.aiWorkspace.executablePathHint', { command: selectedCliCommand }) }}</small>
        </el-form-item>

        <el-form-item :label="t('preferences.agent.aiWorkspace.environmentVariables')">
          <div class="pref-ai-environment-list">
            <div v-for="row in configDraft.environmentRows" :key="row.id" class="pref-ai-environment-row">
              <el-input v-model="row.key" :placeholder="t('preferences.agent.aiWorkspace.environmentKey')" />
              <el-input v-model="row.value" :placeholder="t('preferences.agent.aiWorkspace.environmentValue')" />
              <button
                type="button"
                :aria-label="t('preferences.agent.aiWorkspace.removeEnvironment')"
                @click="removeEnvironmentRow(row.id)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </div>
            <el-button size="small" :icon="Plus" @click="addEnvironmentRow">
              {{ t('preferences.agent.aiWorkspace.addEnvironment') }}
            </el-button>
          </div>
        </el-form-item>

        <el-form-item :label="t('preferences.agent.aiWorkspace.defaultModelId')">
          <el-input v-model="configDraft.defaultModelId" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="configDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canSaveConfig" @click="saveConfig">
          {{ t('preferences.agent.aiWorkspace.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Cpu, Delete, Plus, Refresh } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type {
  AiCliDetectionResult,
  AiCliConfigInput,
  AiCliProviderId,
  AiConfigSummary,
  AiProviderId
} from '@shared/types/aiWorkspace'
import {
  AI_CLI_PROVIDER_PRESETS,
  aiProviderOption,
  type AiProviderOption
} from '@shared/types/aiProviderPresets'
import { useAiSettingsStore } from '@/store/aiSettings'
import { usePreferencesStore, type PreferencesState } from '@/store/preferences'
import AiProviderLogo from '@/components/agent/AiProviderLogo.vue'
import Range from '../common/range/index.vue'
import AgentIntegrationGuide from './AgentIntegrationGuide.vue'

interface EnvironmentRow {
  id: number
  key: string
  value: string
}

interface ConfigDraft {
  name: string
  provider: AiCliProviderId
  executablePath: string
  environmentRows: EnvironmentRow[]
  defaultModelId: string
}

interface ConfigTestState {
  status: 'testing' | 'success' | 'failure'
  message: string
}

const { t } = useI18n()
const settings = useAiSettingsStore()
const preferenceStore = usePreferencesStore()
const { agentFontSize } = storeToRefs(preferenceStore)
const configDialogVisible = ref(false)
const editingConfigId = ref('')
const configTests = reactive<Record<string, ConfigTestState>>({})
const cliDetection = ref<AiCliDetectionResult | null>(null)
const cliDetecting = ref(false)
let nextEnvironmentRowId = 1
let detectionRequestId = 0

const configDraft = reactive<ConfigDraft>({
  name: 'Codex CLI',
  provider: 'codex',
  executablePath: '',
  environmentRows: [],
  defaultModelId: ''
})

const providerOptions = computed<AiProviderOption[]>(() => (
  Object.values(AI_CLI_PROVIDER_PRESETS).map(provider => ({
    id: provider.id,
    kind: 'cli',
    label: provider.label,
    iconSlug: provider.iconSlug
  }))
))
const agentConfigs = computed(() => settings.configs.filter(config => config.kind === 'cli'))
const selectedCliPreset = computed(() => AI_CLI_PROVIDER_PRESETS[configDraft.provider])
const selectedCliCommand = computed(() => selectedCliPreset.value?.command ?? '')
const cliEnvironment = computed<Record<string, string>>(() => Object.fromEntries(
  configDraft.environmentRows
    .map(row => [row.key.trim(), row.value] as const)
    .filter(([key]) => key)
))
const canSaveConfig = computed(() => Boolean(configDraft.name.trim()))
const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
const cliDetectionTitle = computed(() => {
  if (cliDetecting.value) return t('preferences.agent.aiWorkspace.detecting')
  if (cliDetection.value?.found) return t('preferences.agent.aiWorkspace.detected')
  return t('preferences.agent.aiWorkspace.notDetected')
})
const cliDetectionMessage = computed(() => {
  if (cliDetecting.value) return t('preferences.agent.aiWorkspace.detectingDescription')
  if (cliDetection.value?.found) {
    return [cliDetection.value.executablePath, cliDetection.value.version].filter(Boolean).join(' · ')
  }
  return cliDetection.value?.message || t('preferences.agent.aiWorkspace.notDetectedDescription', {
    command: selectedCliCommand.value
  })
})

const clearDetection = (): void => {
  detectionRequestId += 1
  cliDetection.value = null
  cliDetecting.value = false
}
const resetConfigDraft = (): void => {
  const preset = AI_CLI_PROVIDER_PRESETS.codex
  Object.assign(configDraft, {
    name: preset.label, provider: preset.id, executablePath: '',
    environmentRows: [], defaultModelId: ''
  })
  clearDetection()
}
const applyProviderPreset = async(): Promise<void> => {
  const preset = AI_CLI_PROVIDER_PRESETS[configDraft.provider]
  configDraft.name = preset.label
  configDraft.executablePath = ''
  configDraft.environmentRows = []
  configDraft.defaultModelId = ''
  clearDetection()
  await detectSelectedCli()
}
const openConfigDialog = (): void => {
  editingConfigId.value = ''
  resetConfigDraft()
  configDialogVisible.value = true
}
const rowsFromEnvironment = (environment?: Record<string, string>): EnvironmentRow[] => (
  Object.entries(environment ?? {}).map(([key, value]) => ({
    id: nextEnvironmentRowId++, key, value
  }))
)
const openEditDialog = (config: AiConfigSummary): void => {
  if (config.kind !== 'cli') return
  editingConfigId.value = config.id
  Object.assign(configDraft, {
    name: config.name,
    provider: config.provider as AiCliProviderId,
    executablePath: config.executablePath ?? '',
    environmentRows: rowsFromEnvironment(config.environment),
    defaultModelId: config.defaultModelId ?? ''
  })
  clearDetection()
  configDialogVisible.value = true
  void detectSelectedCli()
}
const configInput = (): AiCliConfigInput => ({
  kind: 'cli', name: configDraft.name, provider: configDraft.provider,
  executablePath: configDraft.executablePath || undefined,
  environment: cliEnvironment.value,
  defaultModelId: configDraft.defaultModelId || undefined,
  supportsNativeResume: true
})
const saveConfig = async(): Promise<void> => {
  if (!canSaveConfig.value) return
  await settings.saveConfig(configInput(), editingConfigId.value || undefined)
  configDialogVisible.value = false
}
const detectSelectedCli = async(): Promise<void> => {
  const requestId = ++detectionRequestId
  cliDetecting.value = true
  try {
    const result = await settings.detectCli({
      provider: configDraft.provider,
      executablePath: configDraft.executablePath || undefined,
      environment: cliEnvironment.value
    })
    if (requestId === detectionRequestId) cliDetection.value = result
  } catch (error) {
    if (requestId === detectionRequestId) {
      cliDetection.value = {
        found: false,
        provider: configDraft.provider,
        command: selectedCliCommand.value,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  } finally {
    if (requestId === detectionRequestId) cliDetecting.value = false
  }
}
const oneClickConfigure = async(): Promise<void> => {
  if (!cliDetection.value?.found) return
  configDraft.executablePath = cliDetection.value.executablePath ?? ''
  await saveConfig()
}
const addEnvironmentRow = (): void => {
  configDraft.environmentRows.push({ id: nextEnvironmentRowId++, key: '', value: '' })
}
const removeEnvironmentRow = (id: number): void => {
  configDraft.environmentRows = configDraft.environmentRows.filter(row => row.id !== id)
}
const providerLabel = (provider: AiProviderId): string => aiProviderOption(provider).label
const configSummary = (config: AiConfigSummary): string => providerLabel(config.provider)
const setDefaultConfig = async(id: string): Promise<void> => {
  await settings.setDefaultConfig(id)
}
const deleteConfig = async(id: string): Promise<void> => {
  await settings.deleteConfig(id)
}
const testConfig = async(config: AiConfigSummary): Promise<void> => {
  configTests[config.id] = { status: 'testing', message: t('preferences.agent.aiWorkspace.testing') }
  try {
    const result = await settings.testConfig(config.id)
    configTests[config.id] = {
      status: result.ok ? 'success' : 'failure',
      message: result.message || t(result.ok
        ? 'preferences.agent.aiWorkspace.testSuccess'
        : 'preferences.agent.aiWorkspace.testFailure')
    }
  } catch (error) {
    configTests[config.id] = {
      status: 'failure',
      message: error instanceof Error ? error.message : t('preferences.agent.aiWorkspace.testFailure')
    }
  }
}
onMounted(async() => {
  await settings.initialize()
})
</script>

<style scoped>
.pref-ai { display: grid; width: 100%; max-width: 980px; min-width: 0; align-content: start; gap: 28px; color: var(--editorColor); }
.pref-ai-section > header, .pref-ai-config-actions, .pref-ai-config-title { display: flex; align-items: center; }
.pref-ai-section { display: grid; gap: 18px; }
.pref-ai-section > header { min-height: 34px; justify-content: space-between; gap: 18px; }
.pref-ai-section h4 { margin: 0; font-size: 16px; font-weight: 700; }
.pref-ai-section > header :deep(.el-button) { min-height: 32px; padding: 0 14px; border-color: var(--highlightThemeColor); border-radius: 7px; background: var(--highlightThemeColor); color: #fff; box-shadow: none; font-weight: 650; }
.pref-ai-section > header :deep(.el-button:hover), .pref-ai-section > header :deep(.el-button:focus) { border-color: color-mix(in srgb, var(--highlightThemeColor) 88%, #000); background: color-mix(in srgb, var(--highlightThemeColor) 88%, #000); color: #fff; }
.pref-ai-config-list { display: grid; gap: 8px; }
.pref-ai-config-card { display: grid; box-sizing: border-box; min-width: 0; min-height: 58px; grid-template-columns: 28px minmax(0, 1fr) auto; grid-template-areas: "icon title actions" "icon summary result"; align-items: center; column-gap: 10px; row-gap: 2px; padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--editorColor) 18%, transparent); border-radius: 8px; background: var(--editorBgColor); transition: border-color .15s ease, background-color .15s ease; }
.pref-ai-config-card:hover { border-color: var(--editorColor30); }
.pref-ai-config-card.is-default { border-color: var(--highlightThemeColor); background: color-mix(in srgb, var(--highlightThemeColor) 4%, var(--editorBgColor)); box-shadow: inset 0 0 0 1px var(--highlightThemeColor); }
.pref-ai-config-actions { grid-area: actions; justify-content: flex-end; gap: 5px; }
.pref-ai-config-card button { display: inline-flex; min-height: 28px; align-items: center; gap: 4px; padding: 0 8px; color: var(--editorColor); border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.pref-ai-config-card button:hover { background: var(--editorColor08); }
.pref-ai-config-card button:focus-visible { outline: 2px solid var(--highlightThemeColor); outline-offset: 1px; }
.pref-ai-config-card button.is-danger { color: #d94b4b; }
.pref-ai-config-card button:disabled { cursor: progress; opacity: .55; }
.pref-ai-config-icon { display: grid; width: 28px; height: 28px; grid-area: icon; place-items: center; border: 0; border-radius: 7px; background: var(--editorColor04); }
.pref-ai-config-icon :deep(.annotamd-ai-provider-logo) { width: 22px; height: 22px; }
.pref-ai-config-icon :deep(.annotamd-ai-provider-logo img), .pref-ai-config-icon :deep(.annotamd-ai-provider-logo svg) { width: 20px; height: 20px; }
.pref-ai-config-title { min-width: 0; grid-area: title; gap: 7px; }
.pref-ai-config-title strong { overflow: hidden; font-size: 14px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.pref-ai-config-title em { flex: none; padding: 3px 7px; color: #fff; border-radius: 999px; background: var(--highlightThemeColor); font-size: 10px; font-style: normal; font-weight: 650; }
.pref-ai-config-summary { min-width: 0; grid-area: summary; overflow: hidden; color: var(--editorColor60); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.pref-ai-test-result { max-width: min(360px, 38vw); grid-area: result; overflow: hidden; font-size: 12px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.pref-ai-test-result.is-testing { color: var(--editorColor50); }
.pref-ai-test-result.is-success { color: #20a162; }
.pref-ai-test-result.is-failure { color: #e05252; }
.pref-ai-empty { display: flex; align-items: center; gap: 11px; padding: 18px; color: var(--editorColor50); border: 1px dashed var(--editorColor30); border-radius: 8px; background: var(--editorColor02); }
.pref-ai-empty > span { display: grid; width: 32px; height: 32px; flex: none; place-items: center; color: var(--editorColor50); border-radius: 8px; background: var(--editorColor06); }
.pref-ai-empty > div { display: grid; gap: 3px; }
.pref-ai-empty strong { color: var(--editorColor70); font-size: 11px; }
.pref-ai-empty small { color: var(--editorColor50); font-size: 10px; }
.pref-ai-provider-select { position: relative; width: 100%; }
.pref-ai-provider-select > :deep(.annotamd-ai-provider-logo) { position: absolute; z-index: 2; top: 50%; left: 11px; pointer-events: none; transform: translateY(-50%); }
.pref-ai-provider-select :deep(.el-select__wrapper) { padding-left: 36px; }
.pref-ai-provider-option { display: inline-flex; align-items: center; gap: 9px; }
.pref-ai-cli-detection { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto auto; align-items: center; gap: 8px; margin-bottom: 16px; padding: 11px 12px; color: var(--editorColor70); border: 1px solid var(--editorColor10); border-radius: 8px; background: var(--editorColor04); }
.pref-ai-cli-detection.is-found { color: #16794a; border-color: color-mix(in srgb, #20a162 35%, var(--editorColor10)); background: color-mix(in srgb, #20a162 8%, var(--editorBgColor)); }
.pref-ai-cli-detection.is-missing { color: #a15c13; border-color: color-mix(in srgb, #d68a27 32%, var(--editorColor10)); background: color-mix(in srgb, #d68a27 7%, var(--editorBgColor)); }
.pref-ai-cli-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--editorColor30); }
.pref-ai-cli-detection.is-found .pref-ai-cli-status-dot { background: #20a162; }
.pref-ai-cli-detection.is-missing .pref-ai-cli-status-dot { background: #d68a27; }
.pref-ai-cli-detection > div { min-width: 0; }
.pref-ai-cli-detection strong { font-size: 12px; }
.pref-ai-cli-detection p { margin: 3px 0 0; overflow: hidden; font-size: 10px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.pref-ai-environment-list { display: grid; width: 100%; gap: 7px; }
.pref-ai-environment-row { display: grid; grid-template-columns: minmax(120px, .8fr) minmax(160px, 1.2fr) 28px; gap: 7px; }
.pref-ai-environment-row button { display: grid; width: 28px; height: 28px; padding: 0; place-items: center; color: var(--editorColor50); border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.pref-ai-environment-row button:hover { color: #e05252; background: var(--editorColor06); }
:deep(.el-form-item small) { display: block; margin-top: 4px; color: var(--editorColor50); font-size: 10px; }
:global(.pref-ai-config-dialog .el-dialog__header) { padding: 22px 24px 10px; }
:global(.pref-ai-config-dialog .el-dialog__body) { padding: 12px 24px 18px; }
:global(.pref-ai-config-dialog .el-dialog__footer) { padding: 10px 24px 22px; border-top: 1px solid var(--editorColor10); }
:global(.pref-ai-config-dialog .el-button--primary) { border-color: var(--highlightThemeColor); background: var(--highlightThemeColor); color: #fff; }
:global(.pref-ai-config-dialog .el-button--primary:hover), :global(.pref-ai-config-dialog .el-button--primary:focus) { border-color: color-mix(in srgb, var(--highlightThemeColor) 88%, #000); background: color-mix(in srgb, var(--highlightThemeColor) 88%, #000); color: #fff; }
</style>
