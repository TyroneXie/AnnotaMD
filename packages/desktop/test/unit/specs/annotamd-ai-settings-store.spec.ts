import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AiConfigSummary } from '@shared/types/aiWorkspace'
import { useAgentConversationsStore } from '@/store/agentConversations'
import { useAiSettingsStore } from '@/store/aiSettings'

const apiConfig = (overrides: Partial<AiConfigSummary> = {}): AiConfigSummary => ({
  id: 'api-1',
  name: 'Ask API',
  kind: 'api',
  provider: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  apiKeyConfigured: true,
  enabled: true,
  isDefault: true,
  ...overrides
})

const cliConfig = (overrides: Partial<AiConfigSummary> = {}): AiConfigSummary => ({
  id: 'cli-1',
  name: 'Codex',
  kind: 'cli',
  provider: 'codex',
  enabled: true,
  isDefault: true,
  ...overrides
})

const installIpc = (invoke: ReturnType<typeof vi.fn>): void => {
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { ipcRenderer: { invoke } }
  })
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('AnnotaMD AI renderer settings', () => {
  it('lets the main store assign the first default independently for each config kind', async() => {
    const savedCli = cliConfig()
    const invoke = vi.fn().mockResolvedValue(savedCli)
    installIpc(invoke)
    const store = useAiSettingsStore()
    store.configs = [apiConfig()]

    const input = { name: 'Codex', kind: 'cli' as const, provider: 'codex' as const }
    await store.saveConfig(input)

    expect(invoke).toHaveBeenCalledWith('annotamd::ai::configs:save', {
      input,
      enabled: true
    })
    expect(store.configs.find(config => config.id === savedCli.id)?.isDefault).toBe(true)
  })

  it('persists a mode-specific default without sending an API key back through the renderer', async() => {
    const selected = apiConfig({ id: 'api-2', name: 'Second API', isDefault: true })
    const invoke = vi.fn().mockResolvedValue(selected)
    installIpc(invoke)
    const store = useAiSettingsStore()
    store.configs = [apiConfig(), { ...selected, isDefault: false }]

    await store.setDefaultConfig(selected.id)

    expect(invoke).toHaveBeenCalledWith('annotamd::ai::configs:save', {
      id: selected.id,
      input: {
        kind: 'api',
        name: selected.name,
        provider: selected.provider,
        baseUrl: selected.baseUrl,
        apiKey: undefined,
        defaultModelId: undefined
      },
      enabled: true,
      isDefault: true
    })
    expect(store.configs.find(config => config.id === 'api-1')?.isDefault).toBe(false)
    expect(store.configs.find(config => config.id === selected.id)?.isDefault).toBe(true)
    expect(store.selections.ask.configId).toBe(selected.id)
  })

  it('offers model management per provider independently of the persisted default', () => {
    const source = readFileSync(resolve(
      __dirname,
      '../../../src/renderer/src/prefComponents/agent/index.vue'
    ), 'utf8')

    expect(source).toContain('v-for="provider in providers"')
    expect(source).toContain('v-if="provider.id === settings.defaultProviderId"')
    expect(source).toContain('@click="manageModels(provider)"')
    expect(source).toContain('provider.id === managedProviderId.value')
    expect(source).toContain('@click="fetchModels(activeProvider)"')
  })

  it('offers every CLI provider from the current DBX migration baseline', () => {
    const source = readFileSync(resolve(
      __dirname,
      '../../../src/shared/types/aiProviderPresets.ts'
    ), 'utf8')

    for (const provider of [
      'codex',
      'claude-code',
      'opencode',
      'pi',
      'cursor-cli',
      'grok-cli',
      'codebuddy-cli',
      'qoder-cli'
    ]) {
      expect(source).toContain(`'${provider}'`)
    }
  })

  it('keeps Ask and API controls out of the Agent settings page', () => {
    const settingsSource = readFileSync(resolve(
      __dirname,
      '../../../src/renderer/src/prefComponents/agent/index.vue'
    ), 'utf8')
    expect(settingsSource).toContain('annotamd::pi::provider:save')
    expect(settingsSource).not.toContain('AI_MAX_API_RETRIES_MIN')
    expect(settingsSource).not.toContain('saveMaxApiRetries')
    expect(settingsSource).not.toContain("settings.setDefaultMode('ask')")
    expect(settingsSource).not.toContain('AgentTemplateSelector')
    expect(settingsSource).not.toContain('detect-cli')
  })

  it('deduplicates model discovery and serves the cached list on later opens', async() => {
    const models = [{ id: 'model-quick', effortLevels: ['low', 'high'] }]
    const invoke = vi.fn().mockResolvedValue(models)
    installIpc(invoke)
    const store = useAiSettingsStore()

    const [first, second] = await Promise.all([
      store.listModels('cli-cache-test'),
      store.listModels('cli-cache-test')
    ])
    const cached = await store.listModels('cli-cache-test')

    expect(first).toEqual(models)
    expect(second).toEqual(models)
    expect(cached).toEqual(models)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(store.cachedModels('cli-cache-test')).toEqual(models)
  })

  it('exposes configured Pi models during pending discovery and then replaces them with capabilities', async() => {
    let release!: (models: Array<{ id: string; name: string; effortLevels: string[] }>) => void
    installIpc(vi.fn(() => new Promise(resolve => { release = resolve })))
    const store = useAiSettingsStore()
    store.configs = [cliConfig({ id: 'pi-cold-models', provider: 'pi' })]
    store.agentReadiness = { status: 'ready', modelIds: ['deepseek/flash', 'custom/org/pro'] }
    const request = store.listModels('pi-cold-models')
    expect(store.cachedModels('pi-cold-models')).toEqual([
      { id: 'deepseek/flash', name: 'flash' }, { id: 'custom/org/pro', name: 'org/pro' }
    ])
    const models = [{ id: 'deepseek/flash', name: 'Flash', effortLevels: ['off', 'high'] }]
    release(models)
    await request
    expect(store.cachedModels('pi-cold-models')).toEqual(models)
    expect(store.cachedModels('other-config')).toEqual([])
    store.modelsByConfig['pi-cold-models'] = []
    expect(store.cachedModels('pi-cold-models')).toEqual([])
  })

  it('saves the main-owned API retry preference', async() => {
    const invoke = vi.fn().mockResolvedValue({ maxApiRetries: 4 })
    installIpc(invoke)
    const store = useAiSettingsStore()

    await expect(store.saveWorkspacePreferences({ maxApiRetries: 4 })).resolves.toEqual({
      maxApiRetries: 4
    })
    expect(invoke).toHaveBeenCalledWith('annotamd::ai::preferences:save', {
      maxApiRetries: 4
    })
    expect(store.maxApiRetries).toBe(4)
  })

  it('surfaces a rejected conversation deletion in the existing sidebar error banner', async() => {
    const invoke = vi.fn().mockRejectedValue(new Error('Review or roll back changes first'))
    installIpc(invoke)
    const store = useAgentConversationsStore()
    store.items = [{
      id: 'conversation-1',
      title: 'Draft',
      mode: 'agent',
      permissionMode: 'request' as const,
      templateIds: [],
      status: 'idle',
      createdAt: 1,
      updatedAt: 1
    }]
    store.activeId = 'conversation-1'

    await store.delete('conversation-1')

    expect(store.error).toBe('Review or roll back changes first')
    expect(store.items).toHaveLength(1)
    expect(store.activeId).toBe('conversation-1')
  })

  it('renames a conversation through the shared store and updates its history row', async() => {
    const renamed = {
      id: 'conversation-rename',
      title: '新的名称',
      mode: 'agent' as const,
      permissionMode: 'request' as const,
      configId: 'cli-1',
      templateIds: [],
      status: 'idle' as const,
      createdAt: 1,
      updatedAt: 2
    }
    const invoke = vi.fn().mockResolvedValue(renamed)
    installIpc(invoke)
    const store = useAgentConversationsStore()
    store.items = [{ ...renamed, title: '旧名称', updatedAt: 1 }]

    await store.rename(renamed.id, '  新的名称  ')

    expect(invoke).toHaveBeenCalledWith('annotamd::ai::conversations:rename', {
      conversationId: renamed.id,
      title: '新的名称'
    })
    expect(store.items[0]?.title).toBe('新的名称')
  })

  it('keeps a previous turn running in the background when a new conversation is created', async() => {
    const created = {
      id: 'conversation-2',
      title: 'New conversation',
      mode: 'ask' as const,
      permissionMode: 'request' as const,
      templateIds: [],
      status: 'idle' as const,
      createdAt: 2,
      updatedAt: 2
    }
    const invoke = vi.fn().mockResolvedValue(created)
    installIpc(invoke)
    const store = useAgentConversationsStore()
    store.items = [{
      id: 'conversation-1',
      title: 'Background run',
      mode: 'ask',
      permissionMode: 'request' as const,
      templateIds: [],
      status: 'running',
      createdAt: 1,
      updatedAt: 1
    }]
    store.activeId = 'conversation-1'
    store.running = true
    store.activeTurnId = 'turn-1'

    await store.create({ mode: 'ask', permissionMode: 'request' as const })

    expect(store.activeId).toBe('conversation-2')
    expect(store.running).toBe(false)
    expect(store.activeTurnId).toBe('')
    expect(store.items.find(item => item.id === 'conversation-1')?.status).toBe('running')
  })

  it('stops a background conversation without reusing the active turn id', async() => {
    const invoke = vi.fn().mockResolvedValue(true)
    installIpc(invoke)
    const store = useAgentConversationsStore()
    store.items = [{
      id: 'conversation-1',
      title: 'Background run',
      mode: 'agent',
      permissionMode: 'request' as const,
      templateIds: [],
      status: 'running',
      createdAt: 1,
      updatedAt: 1
    }]
    store.activeId = 'conversation-2'
    store.activeTurnId = 'turn-2'

    await store.stopConversation('conversation-1')

    expect(invoke).toHaveBeenCalledWith('annotamd::ai::stop', {
      conversationId: 'conversation-1'
    })
  })

  it('clears a stale turn id when selecting a running conversation and stops by conversation', async() => {
    const invoke = vi.fn().mockResolvedValue({ messages: [], changeSets: [] })
    installIpc(invoke)
    const store = useAgentConversationsStore()
    store.items = [{
      id: 'conversation-1',
      title: 'Running conversation',
      mode: 'agent',
      permissionMode: 'request' as const,
      templateIds: [],
      status: 'running',
      createdAt: 1,
      updatedAt: 1
    }]
    store.activeId = 'conversation-2'
    store.activeTurnId = 'stale-turn'

    await store.select('conversation-1')
    await store.stopConversation('conversation-1')

    expect(store.running).toBe(true)
    expect(store.activeTurnId).toBe('')
    expect(invoke).toHaveBeenLastCalledWith('annotamd::ai::stop', {
      conversationId: 'conversation-1'
    })
  })

  it('force-refreshes an already active conversation so a new comment Diff is visible', async() => {
    const invoke = vi.fn().mockResolvedValue({
      messages: [],
      changeSets: [{
        id: 'change-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        documentId: 'document-1',
        documentUri: 'file:///documents/test.md',
        originalContent: 'before',
        appliedContent: 'after',
        status: 'applied-unreviewed',
        additions: 1,
        deletions: 1,
        createdAt: 1
      }]
    })
    installIpc(invoke)
    const conversations = useAgentConversationsStore()
    conversations.items = [{
      id: 'conversation-1',
      title: 'Comment edit',
      mode: 'agent',
      permissionMode: 'request' as const,
      templateIds: [],
      status: 'completed',
      createdAt: 1,
      updatedAt: 1
    }]
    conversations.activeId = 'conversation-1'

    await conversations.select('conversation-1', true)

    expect(invoke).toHaveBeenCalledWith(
      'annotamd::ai::conversations:select',
      'conversation-1'
    )
    expect(conversations.changeSets).toHaveLength(1)
  })
})
