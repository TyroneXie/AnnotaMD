<template>
  <div class="pref-ai">
    <header class="pref-ai-heading">
      <h2 class="pref-ai-title">{{ t('preferences.agent.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="openAdd">
        {{ t('preferences.agent.provider.addProvider') }}
      </el-button>
    </header>
    <section class="pref-ai-section">
      <header class="pref-ai-section-label">
        <h4>{{ t('preferences.agent.provider.title') }}</h4>
      </header>

      <div v-if="providers.length === 0" class="pref-ai-empty">
        {{ t('preferences.agent.provider.noProviders') }}
      </div>
      <div v-else class="pref-ai-providers">
        <article
          v-for="provider in providers"
          :key="provider.id"
          class="pref-ai-provider"
          :class="{ 'is-default': provider.id === settings.defaultProviderId }"
        >
          <AiProviderLogo :provider="iconFor(provider)" :label="provider.name" />
          <div class="pref-ai-provider-text">
            <strong>
              {{ provider.name }}
              <em v-if="provider.id === settings.defaultProviderId">
                {{ t('preferences.agent.provider.defaultBadge') }}
              </em>
            </strong>
            <small>
              {{ kindLabel(provider.kind) }} ·
              {{ hasKey(provider.id)
                ? t('preferences.agent.provider.keySaved')
                : t('preferences.agent.provider.keyMissing') }}
            </small>
            <small class="pref-ai-endpoint" :title="provider.baseUrl">{{ provider.baseUrl }}</small>
          </div>
          <div class="pref-ai-provider-actions">
            <button
              type="button"
              :aria-pressed="provider.id === activeProvider?.id"
              @click="manageModels(provider)"
            >
              {{ t('preferences.agent.provider.manageModels') }}
            </button>
            <button type="button" @click="openEdit(provider)">
              {{ t('preferences.agent.provider.edit') }}
            </button>
            <el-dropdown trigger="click" placement="bottom-end" popper-class="pref-pi-menu">
              <button
                type="button"
                class="pref-ai-icon-button"
                :aria-label="t('preferences.agent.provider.providerActions', { name: provider.name })"
              >
                <el-icon><MoreFilled /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="provider.enabled && provider.id !== settings.defaultProviderId"
                    @click="setDefaultProvider(provider)"
                  >
                    {{ t('preferences.agent.provider.setDefault') }}
                  </el-dropdown-item>
                  <el-dropdown-item class="pref-pi-delete" @click="removeProvider(provider)">
                    {{ t('preferences.agent.provider.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-switch
              :aria-label="provider.name"
              :model-value="provider.enabled"
              @change="(value: unknown) => toggleProvider(provider, Boolean(value))"
            />
          </div>
        </article>
      </div>
    </section>

    <section v-if="activeProvider" ref="modelSection" class="pref-ai-section">
      <header>
        <div class="pref-ai-model-heading">
          <h4>{{ t('preferences.agent.provider.modelsTitle') }}</h4>
          <p class="pref-ai-summary">
            {{ t('preferences.agent.provider.modelsSummary', {
              name: activeProvider.name,
              total: activeProvider.models.length,
              enabled: activeModels.length
            }) }}
          </p>
        </div>
        <el-button
          :icon="Refresh"
          :loading="fetchingModels"
          @click="fetchModels(activeProvider)"
        >
          {{ t('preferences.agent.provider.fetchModels') }}
        </el-button>
      </header>

      <div class="pref-ai-models">
        <div v-if="activeProvider.models.length === 0" class="pref-ai-empty">
          {{ t('preferences.agent.provider.noModels') }}
        </div>
        <template v-else>
          <div
            v-for="model in activeProvider.models"
            :key="model.id"
            class="pref-ai-model"
          >
            <div class="pref-ai-model-name">
              <span class="pref-ai-model-id" :title="model.id">{{ model.id }}</span>
              <span
                v-if="model.id === activeProvider.defaultModel"
                class="pref-ai-model-default"
              >
                {{ t('preferences.agent.provider.defaultBadge') }}
              </span>
            </div>
            <div class="pref-ai-model-actions">
              <button
                v-if="model.enabled && model.id !== activeProvider.defaultModel"
                type="button"
                @click="setDefaultModel(activeProvider, model.id)"
              >
                {{ t('preferences.agent.provider.setDefault') }}
              </button>
              <button
                type="button"
                class="pref-ai-icon-button is-danger"
                :aria-label="t('preferences.agent.provider.delete')"
                :title="t('preferences.agent.provider.delete')"
                @click="removeModel(activeProvider, model.id)"
              >
                <el-icon><Delete /></el-icon>
              </button>
              <el-switch
                :aria-label="model.id"
                :model-value="model.enabled"
                @change="(value: unknown) => toggleModel(activeProvider!, model, Boolean(value))"
              />
            </div>
          </div>
        </template>

        <div class="pref-ai-model-add">
          <el-input
            v-model="newModelId"
            :aria-label="t('preferences.agent.provider.modelName')"
            :placeholder="t('preferences.agent.provider.modelName')"
            @keydown.enter="addModel(activeProvider)"
          />
          <el-button :icon="Plus" :disabled="!newModelId.trim()" @click="addModel(activeProvider)">
            {{ t('preferences.agent.provider.addModel') }}
          </el-button>
        </div>
      </div>
    </section>

    <span v-if="status" class="pref-ai-status" :class="`is-${statusKind}`" role="status">
      {{ status }}
    </span>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId
        ? t('preferences.agent.provider.editProvider')
        : t('preferences.agent.provider.addProvider')"
      class="pref-pi-provider-dialog"
      width="min(584px, calc(100vw - 32px))"
      top="16px"
      append-to-body
    >
      <el-form class="pref-ai-form" label-position="top">
        <el-form-item :label="t('preferences.agent.provider.preset')">
          <el-select v-model="draftPreset" popper-class="pref-pi-menu" @change="applyPreset">
            <el-option
              v-for="option in presetOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            >
              <span class="pref-provider-option">
                <AiProviderLogo :provider="option.iconProvider" :label="option.label" />
                <span>{{ option.label }}</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('preferences.agent.provider.name')" required>
          <el-input v-model="draft.name" :placeholder="t('preferences.agent.provider.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('preferences.agent.provider.interfaceType')">
          <el-radio-group v-model="draft.kind">
            <el-radio value="openai">{{ t('preferences.agent.provider.openaiCompatible') }}</el-radio>
            <el-radio value="anthropic">Anthropic</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="draft.kind === 'openai'"
          :label="t('preferences.agent.provider.requestFormat')"
        >
          <el-radio-group v-model="draft.apiFormat">
            <el-radio value="chat">Chat Completions</el-radio>
            <el-radio value="responses">Responses</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-else :label="t('preferences.agent.provider.authStyle')">
          <el-radio-group v-model="draft.authStyle">
            <el-radio value="api-key">x-api-key</el-radio>
            <el-radio value="bearer">Bearer</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item class="pref-ai-form-wide" :label="t('preferences.agent.provider.baseUrl')" required>
          <el-input v-model="draft.baseUrl" :placeholder="baseUrlPlaceholder" />
        </el-form-item>
        <el-form-item class="pref-ai-form-wide" :label="t('preferences.agent.provider.modelsUrl')">
          <el-input
            v-model="draft.modelsUrl"
            :placeholder="t('preferences.agent.provider.modelsUrlPlaceholder')"
          />
        </el-form-item>
        <el-form-item class="pref-ai-form-wide" :label="t('preferences.agent.provider.apiKey')">
          <el-input
            v-model="draft.apiKey"
            type="password"
            show-password
            :placeholder="editingHasKey
              ? t('preferences.agent.provider.apiKeyKeep')
              : t('preferences.agent.provider.apiKeyPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <p v-if="dialogError" class="pref-ai-dialog-error" role="alert">{{ dialogError }}</p>
        <el-button @click="dialogVisible = false">
          {{ t('preferences.agent.provider.cancel') }}
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveProvider">
          {{ t('preferences.agent.provider.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { Delete, MoreFilled, Plus, Refresh } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type {
  PiApiFormat,
  PiAuthStyle,
  PiModelEntry,
  PiProviderEntry,
  PiProviderKind,
  PiProviderSaveRequest,
  PiSettingsState
} from '@shared/types/piProvider'
import {
  matchPiProviderPreset,
  PI_CUSTOM_PRESET_ID,
  PI_PROVIDER_PRESETS
} from '@shared/types/piProviderPresets'
import AiProviderLogo from '@/components/agent/AiProviderLogo.vue'

interface ProviderDraft extends PiProviderSaveRequest {
  apiKey: string
}

const { t } = useI18n()

const settings = ref<PiSettingsState>({ providers: [], keyedProviderIds: [] })
const dialogVisible = ref(false)
const dialogError = ref('')
const editingId = ref('')
const editingHasKey = ref(false)
const draftPreset = ref(PI_CUSTOM_PRESET_ID)
const saving = ref(false)
const fetchingModels = ref(false)
const newModelId = ref('')
const status = ref('')
const statusKind = ref<'success' | 'failure'>('success')
const managedProviderId = ref('')
const modelSection = ref<HTMLElement | null>(null)

const draft = reactive<ProviderDraft>({
  name: '',
  kind: 'openai' as PiProviderKind,
  baseUrl: '',
  modelsUrl: '',
  apiFormat: 'chat' as PiApiFormat,
  authStyle: 'api-key' as PiAuthStyle,
  apiKey: ''
})

const providers = computed(() => settings.value.providers)
const activeProvider = computed<PiProviderEntry | undefined>(() => (
  providers.value.find(provider => provider.id === managedProviderId.value)
    ?? providers.value.find(provider => provider.id === settings.value.defaultProviderId)
    ?? providers.value.find(provider => provider.enabled)
    ?? providers.value[0]
))
const activeModels = computed(() => (
  activeProvider.value?.models.filter(model => model.enabled) ?? []
))
const presetOptions = computed(() => [
  {
    value: PI_CUSTOM_PRESET_ID,
    label: t('preferences.agent.provider.custom'),
    iconProvider: PI_CUSTOM_PRESET_ID
  },
  ...PI_PROVIDER_PRESETS.map(preset => ({
    value: preset.id,
    label: preset.label,
    iconProvider: preset.iconProvider ?? preset.id
  }))
])
const baseUrlPlaceholder = computed(() => (
  draft.kind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'
))

const iconFor = (provider: PiProviderEntry): string => {
  const preset = matchPiProviderPreset(provider.kind, provider.baseUrl)
    ?? PI_PROVIDER_PRESETS.find(item => item.id === provider.id)
  return preset?.iconProvider ?? preset?.id ?? provider.id
}
const kindLabel = (kind: PiProviderKind): string => (
  kind === 'anthropic' ? 'Anthropic' : t('preferences.agent.provider.openaiCompatible')
)
const hasKey = (providerId: string): boolean => settings.value.keyedProviderIds.includes(providerId)
const applyState = (next: PiSettingsState): void => {
  settings.value = next
  if (!next.providers.some(provider => provider.id === managedProviderId.value)) {
    managedProviderId.value = ''
    newModelId.value = ''
  }
}

const manageModels = async(provider: PiProviderEntry): Promise<void> => {
  if (activeProvider.value?.id !== provider.id) newModelId.value = ''
  managedProviderId.value = provider.id
  status.value = ''
  await nextTick()
  modelSection.value?.scrollIntoView({ block: 'nearest' })
}

const run = async(action: () => Promise<void>, success?: string): Promise<void> => {
  status.value = ''
  try {
    await action()
    if (success) {
      statusKind.value = 'success'
      status.value = success
    }
  } catch (error) {
    statusKind.value = 'failure'
    status.value = error instanceof Error ? error.message : String(error)
  }
}

const openAdd = (): void => {
  dialogError.value = ''
  editingId.value = ''
  editingHasKey.value = false
  draftPreset.value = PI_CUSTOM_PRESET_ID
  Object.assign(draft, {
    name: '',
    kind: 'openai',
    baseUrl: '',
    modelsUrl: '',
    apiFormat: 'chat',
    authStyle: 'api-key',
    apiKey: ''
  })
  dialogVisible.value = true
}

const openEdit = (provider: PiProviderEntry): void => {
  dialogError.value = ''
  editingId.value = provider.id
  editingHasKey.value = hasKey(provider.id)
  draftPreset.value = PI_PROVIDER_PRESETS.some(preset => preset.id === provider.id)
    ? provider.id
    : PI_CUSTOM_PRESET_ID
  Object.assign(draft, {
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    modelsUrl: provider.modelsUrl ?? '',
    apiFormat: provider.apiFormat ?? 'chat',
    authStyle: provider.authStyle ?? 'api-key',
    apiKey: ''
  })
  dialogVisible.value = true
}

const applyPreset = (value: string): void => {
  const preset = PI_PROVIDER_PRESETS.find(item => item.id === value)
  if (!preset) return
  draft.name = preset.label
  draft.kind = preset.kind
  draft.baseUrl = preset.baseUrl
}

const saveProvider = async(): Promise<void> => {
  if (!draft.name.trim() || !draft.baseUrl.trim()) {
    dialogError.value = t('preferences.agent.provider.missingFields')
    return
  }
  dialogError.value = ''
  saving.value = true
  try {
    const next = await window.electron.ipcRenderer.invoke('annotamd::pi::provider:save', {
      ...(editingId.value ? { id: editingId.value } : {}),
      name: draft.name,
      kind: draft.kind,
      baseUrl: draft.baseUrl,
      modelsUrl: draft.modelsUrl,
      apiFormat: draft.apiFormat,
      authStyle: draft.authStyle,
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {})
    })
    const added = next.providers.find(provider => !providers.value.some(item => item.id === provider.id))
    applyState(next)
    if (added) {
      managedProviderId.value = added.id
      newModelId.value = ''
    }
    dialogVisible.value = false
    statusKind.value = 'success'
    status.value = t('preferences.agent.provider.saved')
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

const toggleProvider = async(provider: PiProviderEntry, enabled: boolean): Promise<void> => {
  await run(async() => {
    applyState(await window.electron.ipcRenderer.invoke('annotamd::pi::provider:save', {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      modelsUrl: provider.modelsUrl,
      apiFormat: provider.apiFormat,
      authStyle: provider.authStyle,
      enabled
    }))
  })
}

const setDefaultProvider = async(provider: PiProviderEntry): Promise<void> => {
  await run(async() => {
    applyState(await window.electron.ipcRenderer.invoke('annotamd::pi::provider:save', {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      modelsUrl: provider.modelsUrl,
      apiFormat: provider.apiFormat,
      authStyle: provider.authStyle,
      enabled: provider.enabled,
      makeDefault: true
    }))
  })
}

const removeProvider = async(provider: PiProviderEntry): Promise<void> => {
  await run(async() => {
    applyState(await window.electron.ipcRenderer.invoke('annotamd::pi::provider:delete', provider.id))
  })
}

const updateModels = async(
  provider: PiProviderEntry,
  models: PiModelEntry[],
  defaultModel?: string
): Promise<void> => {
  // Vue keeps these values in reactive proxies, which Electron cannot clone
  // when crossing the IPC boundary; send plain records instead.
  const plainModels = models.map(model => ({
    id: String(model.id),
    enabled: model.enabled !== false
  }))
  applyState(await window.electron.ipcRenderer.invoke('annotamd::pi::models:update', {
    providerId: provider.id,
    models: plainModels,
    ...(defaultModel ? { defaultModel } : {})
  }))
}

const toggleModel = async(
  provider: PiProviderEntry,
  model: PiModelEntry,
  enabled: boolean
): Promise<void> => {
  await run(async() => {
    await updateModels(provider, provider.models.map(item => (
      item.id === model.id ? { ...item, enabled } : item
    )))
  })
}

const setDefaultModel = async(provider: PiProviderEntry, modelId: string): Promise<void> => {
  await run(async() => {
    await updateModels(provider, provider.models, modelId)
  })
}

const removeModel = async(provider: PiProviderEntry, modelId: string): Promise<void> => {
  await run(async() => {
    await updateModels(provider, provider.models.filter(item => item.id !== modelId))
  })
}

const addModel = async(provider: PiProviderEntry): Promise<void> => {
  const id = newModelId.value.trim()
  if (!id) return
  await run(async() => {
    await updateModels(provider, [...provider.models, { id, enabled: true }])
    newModelId.value = ''
  })
}

const fetchModels = async(provider: PiProviderEntry): Promise<void> => {
  fetchingModels.value = true
  await run(async() => {
    const ids = await window.electron.ipcRenderer.invoke('annotamd::pi::provider:models', {
      providerId: provider.id
    })
    const existing = new Map(provider.models.map(model => [
      model.id,
      { id: model.id, enabled: model.enabled !== false }
    ]))
    const models: PiModelEntry[] = ids.map(id => existing.get(id) ?? { id, enabled: true })
    const missing = provider.models.filter(model => !ids.includes(model.id))
    await updateModels(provider, [...models, ...missing], provider.defaultModel ?? ids[0])
    statusKind.value = 'success'
    status.value = t('preferences.agent.provider.modelsLoaded', { count: ids.length })
  })
  fetchingModels.value = false
}

onMounted(async() => {
  await run(async() => {
    applyState(await window.electron.ipcRenderer.invoke('annotamd::pi::settings:get'))
  })
})
</script>

<style scoped>
.pref-ai,
:global(.pref-pi-provider-dialog),
:global(.pref-pi-menu) {
  --pi-text: var(--editorColor);
  --pi-muted: color-mix(in srgb, var(--pi-text) 78%, var(--editorBgColor));
  --pi-border: color-mix(in srgb, var(--pi-text) 17%, var(--editorBgColor));
  --pi-divider: color-mix(in srgb, var(--pi-text) 12%, var(--editorBgColor));
  --pi-surface: color-mix(in srgb, var(--pi-text) 3%, var(--editorBgColor));
  --pi-control: color-mix(in srgb, var(--pi-text) 5%, var(--editorBgColor));
  --pi-hover: color-mix(in srgb, var(--pi-text) 9%, var(--editorBgColor));
  --pi-accent: var(--highlightThemeColor);
  --pi-primary: color-mix(in srgb, var(--pi-accent) 72%, #000);
  --pi-primary-label: #fff;
}

:global(body.dark .pref-ai),
:global(body.dark .pref-pi-provider-dialog) {
  --pi-primary: var(--pi-accent);
  --pi-primary-label: var(--editorBgColor);
}

.pref-ai {
  display: grid;
  grid-template-columns: minmax(0, 760px);
  justify-content: center;
  align-content: start;
  gap: 20px;
  color: var(--pi-text);
  container-type: inline-size;
  scrollbar-width: thin;
  scrollbar-color: var(--pi-border) transparent;
}

.pref-ai .pref-ai-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.pref-ai-section {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.pref-ai-heading, .pref-ai-section > header {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pref-ai-section > .pref-ai-section-label {
  min-height: auto;
}

.pref-ai-section h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.pref-ai-model-heading {
  min-width: 0;
}

.pref-ai-summary {
  margin: 2px 0 0;
  color: var(--pi-muted);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.pref-ai-providers, .pref-ai-models, .pref-ai-section > .pref-ai-empty {
  border: 1px solid var(--pi-border);
  border-radius: 10px;
  background: var(--pi-surface);
}

.pref-ai-providers > * + *,
.pref-ai-models > * + * {
  border-top: 1px solid var(--pi-divider);
}

.pref-ai-provider, .pref-ai-model, .pref-ai-model-add, .pref-ai-empty {
  box-sizing: border-box;
  min-width: 0;
  padding: 10px 14px;
}

.pref-ai-provider {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding-block: 8px;
}

.pref-ai-provider :deep(.annotamd-ai-provider-logo) {
  width: 30px;
  height: 30px;
  border: 1px solid var(--pi-divider);
  border-radius: 7px;
  background: var(--editorBgColor);
  box-sizing: border-box;
}

.pref-ai :deep(.annotamd-ai-provider-logo img.is-dark-inverted),
:global(.pref-pi-menu .annotamd-ai-provider-logo img.is-dark-inverted) {
  filter: none;
}

:global(body.dark .pref-ai .annotamd-ai-provider-logo img.is-dark-inverted),
:global(body.dark .pref-pi-menu .annotamd-ai-provider-logo img.is-dark-inverted) {
  filter: invert(1);
}

.pref-ai-provider-text {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.pref-ai-provider-text strong, .pref-ai-model-name {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 7px;
  row-gap: 3px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.pref-ai-provider-text em, .pref-ai-model-default {
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--pi-hover);
  color: var(--pi-muted);
  font-size: 10px;
  font-style: normal;
  font-weight: 650;
  white-space: nowrap;
}

.pref-ai-provider-text small, .pref-ai-empty {
  color: var(--pi-muted);
  font-size: 12px;
  line-height: 1.35;
}

.pref-ai-provider-text small {
  font-size: 11px;
  line-height: 1.3;
}

.pref-ai-provider-text .pref-ai-endpoint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}

.pref-ai-provider-actions, .pref-ai-model-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pref-ai-provider-actions button, .pref-ai-model-actions button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pi-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
}

.pref-ai-provider-actions button:hover,
.pref-ai-provider-actions button[aria-pressed="true"],
.pref-ai-model-actions button:hover {
  background: var(--pi-hover);
  color: var(--pi-text);
}

.pref-ai :deep(button:focus-visible) {
  outline: 2px solid var(--pi-accent);
  outline-offset: 1px;
}

.pref-ai-provider-actions .pref-ai-icon-button, .pref-ai-model-actions .pref-ai-icon-button {
  width: 28px;
  padding: 0;
  font-size: 15px;
}

.pref-ai-model-actions button.is-danger:hover {
  color: var(--el-color-danger);
}

.pref-ai-model {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-block: 7px;
}

.pref-ai-model-id {
  min-width: 0;
  font-weight: 550;
}

.pref-ai-model-add {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-ai-model-add :deep(.el-input) {
  min-width: 0;
}

.pref-ai-model-add :deep(.el-button) {
  flex: none;
}

.pref-ai :deep(.el-switch) {
  margin-inline-start: 5px;
  --el-switch-border-color: transparent;
  --el-switch-off-color: color-mix(in srgb, var(--pi-text) 23%, var(--editorBgColor));
  --el-switch-on-color: color-mix(in srgb, var(--pi-accent) 82%, var(--editorBgColor));
}

.pref-ai :deep(.el-switch__core) {
  min-width: 34px;
  height: 20px;
  border: 0;
}

.pref-ai :deep(.el-switch__action) {
  left: 2px;
  width: 16px;
  height: 16px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
}

.pref-ai :deep(.el-switch.is-checked .el-switch__action) {
  left: calc(100% - 18px);
}

.pref-ai :deep(.el-button),
:global(.pref-pi-provider-dialog .el-button) {
  --buttonBgColor: var(--pi-control);
  --buttonBgColorHover: var(--pi-hover);
  --buttonBgColorActive: var(--pi-hover);
  --buttonFontColor: var(--pi-text);
  --buttonFontColorHover: var(--pi-text);
  --buttonFontColorActive: var(--pi-text);
  --buttonBorder: 1px solid var(--pi-border);
  --buttonBorderHover: var(--buttonBorder);
  --buttonBorderActive: var(--buttonBorder);
  --buttonFocusBorder: var(--buttonBorder);

  height: 32px;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  box-shadow: none;
}

.pref-ai :deep(.el-button--primary),
:global(.pref-pi-provider-dialog .el-button--primary) {
  --buttonPrimaryBgColor: var(--pi-primary);
  --buttonPrimaryBgColorHover: color-mix(in srgb, var(--pi-primary) 92%, var(--editorBgColor));
  --buttonPrimaryBgColorActive: var(--buttonPrimaryBgColorHover);
  --buttonPrimaryFontColor: var(--pi-primary-label);
  --buttonPrimaryFontColorHover: var(--pi-primary-label);
  --buttonPrimaryFontColorActive: var(--pi-primary-label);
  --buttonPrimaryBorder: 1px solid transparent;
  --buttonPrimaryBorderHover: var(--buttonPrimaryBorder);
  --buttonPrimaryBorderActive: var(--buttonPrimaryBorder);
  --buttonPrimaryFocusBorder: var(--buttonPrimaryBorder);
  --buttonPrimaryFocusShadow: none;
}

:global(.pref-pi-provider-dialog .el-button:focus-visible) {
  outline: 2px solid var(--pi-accent);
  outline-offset: 1px;
}

.pref-ai :deep(.el-input__wrapper),
.pref-ai-form :deep(.el-input__wrapper),
.pref-ai-form :deep(.el-select__wrapper) {
  min-height: 32px;
  border-radius: 7px;
  background: var(--pi-control);
  box-shadow: 0 0 0 1px var(--pi-border) inset;
}

.pref-ai :deep(.el-input__inner),
.pref-ai-form :deep(.el-input__inner) {
  border: 0;
  background: transparent;
  color: var(--pi-text);
}

.pref-ai :deep(.el-input__wrapper.is-focus),
.pref-ai-form :deep(.el-input__wrapper.is-focus),
.pref-ai-form :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--pi-accent) inset;
}

.pref-ai-status {
  color: var(--pi-muted);
  font-size: 12px;
}

.pref-ai-status.is-failure, .pref-ai-dialog-error {
  color: var(--el-color-danger);
}

:global(.pref-pi-provider-dialog) {
  --el-dialog-padding-primary: 18px;

  display: flex;
  max-height: calc(100vh - 32px);
  flex-direction: column;
  padding-block: 15px 0;
  border-color: var(--pi-border);
  border-radius: 12px;
  background: var(--editorBgColor);
  box-shadow: 0 12px 36px rgb(0 0 0 / 18%);
  color: var(--pi-text);
}

:global(.pref-pi-provider-dialog .el-dialog__header) {
  flex: none;
  margin: 0;
  padding: 0 32px 12px 0;
}

:global(.pref-pi-provider-dialog .el-dialog__title) {
  color: var(--pi-text);
  font-size: 17px;
  font-weight: 650;
  line-height: 24px;
}

:global(.pref-pi-provider-dialog .el-dialog__headerbtn) {
  top: -4px;
  right: -5px;
  width: 32px;
  height: 32px;
}

:global(.pref-pi-provider-dialog .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
  padding: 1px 1px 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--pi-border) transparent;
}

:global(.pref-pi-provider-dialog .el-dialog__footer) {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--pi-divider);
}

:global(.pref-pi-provider-dialog .el-dialog__footer .el-button) {
  flex: none;
  margin: 0;
}

:global(.pref-pi-provider-dialog .el-dialog__footer .el-button:first-of-type) {
  margin-inline-start: auto;
}

.pref-ai-dialog-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
}

.pref-ai-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}

.pref-ai-form-wide {
  grid-column: 1 / -1;
}

.pref-ai-form :deep(.el-form-item) {
  min-width: 0;
  margin: 0;
}

.pref-ai-form :deep(.el-form-item__label) {
  margin-bottom: 5px;
  color: var(--pi-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.pref-ai-form :deep(.el-form-item__content) {
  min-height: 32px;
}

.pref-ai-form :deep(.el-select) {
  width: 100%;
}

.pref-ai-form :deep(.el-radio-group) {
  gap: 4px 12px;
}

.pref-ai-form :deep(.el-radio) {
  height: 28px;
  margin: 0;
  color: var(--pi-muted);
}

.pref-ai-form :deep(.el-radio__label) {
  padding-inline-start: 5px;
  font-size: 12px;
}

:global(.pref-pi-menu) {
  --el-bg-color-overlay: var(--editorBgColor);
  --el-border-color-light: var(--pi-border);
  --el-fill-color-light: var(--pi-hover);
  --el-text-color-regular: var(--pi-text);
  --el-text-color-primary: var(--pi-text);
}

:global(.pref-pi-menu .pref-pi-delete) {
  color: var(--el-color-danger);
}

.pref-provider-option {
  display: flex;
  height: 100%;
  align-items: center;
  gap: 8px;
}

@container (max-width: 390px) {
  .pref-ai-provider {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .pref-ai-provider-actions {
    grid-column: 2;
    justify-content: flex-end;
  }
}

@media (max-width: 540px) {
  .pref-ai-form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
