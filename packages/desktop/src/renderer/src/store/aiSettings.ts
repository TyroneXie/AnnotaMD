import { defineStore } from 'pinia'
import type {
  AiApiProviderId,
  AiCliDetectionRequest,
  AiCliDetectionResult,
  AiCliProviderId,
  AiConfigInput,
  AiConfigSummary,
  AiConnectionTestResult,
  AiEffortSelection,
  AiModelInfo,
  AiPermissionMode,
  AiWorkspacePreferences,
  AiWorkspaceMode
} from '@shared/types/aiWorkspace'
import { AI_MAX_API_RETRIES_DEFAULT } from '@shared/types/aiWorkspace'

const PREFERENCE_KEY = 'annotamd.ai.ui-preferences.v1'
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const modelRequests = new Map<string, Promise<AiModelInfo[]>>()

interface AiModeSelection {
  configId?: string
  modelId?: string
  effort: AiEffortSelection
  permissionMode: AiPermissionMode
}

interface AiUiPreferences {
  selections: Record<AiWorkspaceMode, AiModeSelection>
}

const defaultPreferences = (): AiUiPreferences => ({
  selections: {
    ask: { effort: { kind: 'provider-default' }, permissionMode: 'request' },
    agent: { effort: { kind: 'provider-default' }, permissionMode: 'request' }
  }
})

const loadPreferences = (): AiUiPreferences => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFERENCE_KEY) ?? 'null')
    const defaults = defaultPreferences()
    return {
      selections: {
        ask: { ...defaults.selections.ask, ...saved?.selections?.ask },
        agent: { ...defaults.selections.agent, ...saved?.selections?.agent }
      }
    }
  } catch {
    return defaultPreferences()
  }
}

const configInputFromSummary = (config: AiConfigSummary): AiConfigInput => (
  config.kind === 'api'
    ? {
        kind: 'api',
        name: config.name,
        provider: config.provider as AiApiProviderId,
        baseUrl: config.baseUrl ?? '',
        apiKey: undefined,
        defaultModelId: config.defaultModelId,
        apiStyle: config.apiStyle,
        authMethod: config.authMethod
      }
    : {
        kind: 'cli',
        name: config.name,
        provider: config.provider as AiCliProviderId,
        executablePath: config.executablePath,
        environment: config.environment,
        defaultModelId: config.defaultModelId,
        supportsNativeResume: config.supportsNativeResume
      }
)

export const useAiSettingsStore = defineStore('aiSettings', {
  state: () => ({
    configs: [] as AiConfigSummary[],
    ...loadPreferences(),
    initialized: false,
    loading: false,
    error: '',
    maxApiRetries: AI_MAX_API_RETRIES_DEFAULT,
    workspacePreferencesLoaded: false,
    modelsByConfig: {} as Record<string, AiModelInfo[]>,
    modelsLoadedAt: {} as Record<string, number>,
    modelsLoading: {} as Record<string, boolean>
  }),

  getters: {
    configsForMode: (state) => (mode: AiWorkspaceMode): AiConfigSummary[] => (
      state.configs.filter(config => config.enabled && (
        mode === 'ask' ? config.kind === 'api' : config.kind === 'cli'
      ))
    ),
    selectedConfig: (state) => (mode: AiWorkspaceMode): AiConfigSummary | undefined => (
      state.configs.find(config => config.id === state.selections[mode].configId)
    )
  },

  actions: {
    persistPreferences(): void {
      window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify({
        selections: this.selections
      }))
    },

    reconcileSelections(): void {
      for (const mode of ['ask', 'agent'] as const) {
        const available = this.configsForMode(mode)
        if (!available.some(config => config.id === this.selections[mode].configId)) {
          const preferred = available.find(config => config.isDefault) ?? available[0]
          this.selections[mode].configId = preferred?.id
          this.selections[mode].modelId = preferred?.defaultModelId
        }
      }
      this.persistPreferences()
    },

    async initialize(force = false): Promise<void> {
      if (this.loading || (this.initialized && !force)) return
      this.loading = true
      this.error = ''
      try {
        const [configs, preferences] = await Promise.all([
          window.electron.ipcRenderer.invoke('annotamd::ai::configs:list'),
          window.electron.ipcRenderer.invoke('annotamd::ai::preferences:get')
        ])
        this.configs = configs
        this.maxApiRetries = preferences.maxApiRetries
        this.workspacePreferencesLoaded = true
        this.reconcileSelections()
        this.initialized = true
        const selectedAgentId = this.selections.agent.configId
        if (selectedAgentId) void this.listModels(selectedAgentId).catch(() => undefined)
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      } finally {
        this.loading = false
      }
    },

    selectConfig(mode: AiWorkspaceMode, configId?: string): void {
      const config = this.configs.find(item => item.id === configId)
      this.selections[mode] = {
        ...this.selections[mode],
        configId: config?.id,
        modelId: config?.defaultModelId
      }
      this.persistPreferences()
      if (mode === 'agent') window.dispatchEvent(new Event('annotamd:ai-selection-changed'))
    },

    selectModel(mode: AiWorkspaceMode, modelId?: string): void {
      this.selections[mode].modelId = modelId?.trim() || undefined
      this.persistPreferences()
    },

    selectEffort(mode: AiWorkspaceMode, effort: AiEffortSelection): void {
      this.selections[mode].effort = effort
      this.persistPreferences()
    },

    selectPermissionMode(mode: AiWorkspaceMode, permissionMode: AiPermissionMode): void {
      this.selections[mode].permissionMode = permissionMode
      this.persistPreferences()
    },

    async saveConfig(input: AiConfigInput, id?: string): Promise<AiConfigSummary> {
      this.error = ''
      try {
        const previous = id ? this.configs.find(config => config.id === id) : undefined
        const saved = await window.electron.ipcRenderer.invoke('annotamd::ai::configs:save', {
          ...(id ? { id } : {}),
          input,
          enabled: previous?.enabled ?? true
        })
        if (saved.isDefault) {
          this.configs = this.configs.map(config => (
            config.kind === saved.kind ? { ...config, isDefault: false } : config
          ))
        }
        const index = this.configs.findIndex(config => config.id === saved.id)
        if (index === -1) this.configs.push(saved)
        else this.configs.splice(index, 1, saved)
        const mode: AiWorkspaceMode = saved.kind === 'api' ? 'ask' : 'agent'
        if (!this.selections[mode].configId) this.selectConfig(mode, saved.id)
        delete this.modelsByConfig[saved.id]
        delete this.modelsLoadedAt[saved.id]
        return saved
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      }
    },

    async deleteConfig(id: string): Promise<void> {
      this.error = ''
      try {
        if (!await window.electron.ipcRenderer.invoke('annotamd::ai::configs:delete', id)) return
        this.configs = this.configs.filter(config => config.id !== id)
        delete this.modelsByConfig[id]
        delete this.modelsLoadedAt[id]
        delete this.modelsLoading[id]
        this.reconcileSelections()
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      }
    },

    async setDefaultConfig(id: string): Promise<AiConfigSummary | undefined> {
      const target = this.configs.find(config => config.id === id)
      if (!target) return undefined
      this.error = ''
      try {
        const saved = await window.electron.ipcRenderer.invoke('annotamd::ai::configs:save', {
          id: target.id,
          input: configInputFromSummary(target),
          enabled: target.enabled,
          isDefault: true
        })
        this.configs = this.configs.map(config => (
          config.kind === saved.kind
            ? (config.id === saved.id ? saved : { ...config, isDefault: false })
            : config
        ))
        this.selectConfig(target.kind === 'api' ? 'ask' : 'agent', id)
        return saved
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        return undefined
      }
    },

    async testConfig(id: string): Promise<AiConnectionTestResult> {
      return window.electron.ipcRenderer.invoke('annotamd::ai::configs:test', id)
    },

    cachedModels(id: string): AiModelInfo[] {
      return this.modelsByConfig[id] ?? []
    },

    async listModels(id: string, force = false): Promise<AiModelInfo[]> {
      const cached = this.modelsByConfig[id]
      const loadedAt = this.modelsLoadedAt[id] ?? 0
      if (!force && cached && Date.now() - loadedAt < MODEL_CACHE_TTL_MS) return cached
      const pending = modelRequests.get(id)
      if (pending) return pending
      this.modelsLoading[id] = true
      const request = window.electron.ipcRenderer
        .invoke('annotamd::ai::configs:models', id)
        .then((models: AiModelInfo[]) => {
          this.modelsByConfig[id] = models
          this.modelsLoadedAt[id] = Date.now()
          return models
        })
        .finally(() => {
          delete this.modelsLoading[id]
          if (modelRequests.get(id) === request) modelRequests.delete(id)
        })
      modelRequests.set(id, request)
      return request
    },

    async detectCli(request: AiCliDetectionRequest): Promise<AiCliDetectionResult> {
      return window.electron.ipcRenderer.invoke('annotamd::ai::configs:detect-cli', request)
    },

    async saveWorkspacePreferences(
      preferences: AiWorkspacePreferences
    ): Promise<AiWorkspacePreferences> {
      this.error = ''
      try {
        const saved = await window.electron.ipcRenderer.invoke(
          'annotamd::ai::preferences:save',
          preferences
        )
        this.maxApiRetries = saved.maxApiRetries
        this.workspacePreferencesLoaded = true
        return saved
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      }
    }
  }
})
