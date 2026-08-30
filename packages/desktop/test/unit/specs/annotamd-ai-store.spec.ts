import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AiStore } from 'main_renderer/ai/AiStore'
import type { AiSecretStore } from 'main_renderer/ai/AiSecretStore'

class MemorySecrets implements AiSecretStore {
  readonly values = new Map<string, string>()
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<void> { this.values.delete(key) }
}

const directories: string[] = []
const temporaryDatabase = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'annotamd-ai-store-'))
  directories.push(directory)
  return join(directory, 'ai.sqlite')
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('AnnotaMD AI SQLite store', () => {
  it('keeps API keys outside SQLite and never returns them in summaries', async() => {
    const databasePath = temporaryDatabase()
    const secrets = new MemorySecrets()
    const store = new AiStore({ databasePath, secrets, createId: () => 'config-1', now: () => 10 })

    const summary = await store.saveConfig({
      input: {
        name: 'OpenAI',
        kind: 'api',
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        apiKey: 'top-secret-value',
        defaultModelId: 'model-1',
        apiStyle: 'responses',
        authMethod: 'bearer'
      }
    })

    expect(summary).toMatchObject({ id: 'config-1', apiKeyConfigured: true })
    expect(summary).not.toHaveProperty('apiKey')
    expect(await store.getRuntimeConfig('config-1')).toMatchObject({
      secret: 'top-secret-value',
      apiStyle: 'responses',
      authMethod: 'bearer'
    })
    store.close()
    expect(readFileSync(databasePath).includes(Buffer.from('top-secret-value'))).toBe(false)
  })

  it('persists conversations, messages, templates and reviewable change sets', async() => {
    const store = new AiStore({
      databasePath: temporaryDatabase(),
      secrets: new MemorySecrets(),
      createId: (() => {
        let id = 0
        return () => `id-${++id}`
      })(),
      now: () => 20
    })
    await store.saveConfig({
      input: {
        name: 'Codex',
        kind: 'cli',
        provider: 'codex',
        executablePath: '/usr/local/bin/codex'
      }
    })
    const conversation = store.createConversation({ title: 'Hello', mode: 'agent' })
    store.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: 'Change this',
      status: 'complete'
    })
    const template = store.saveTemplate({ name: 'Review', content: 'Be concise.' })
    store.saveChangeSet({
      id: 'change-1',
      conversationId: conversation.id,
      turnId: 'turn-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      originalContent: 'old',
      appliedContent: 'new',
      status: 'applied-unreviewed',
      additions: 1,
      deletions: 1,
      createdAt: 20
    })

    expect(store.listMessages(conversation.id)).toMatchObject([{ content: 'Change this' }])
    expect(store.listTemplates()).toMatchObject([{ id: template.id, name: 'Review' }])
    expect(store.listChangeSets(conversation.id)).toMatchObject([{
      id: 'change-1',
      documentUri: 'untitled://doc-1',
      status: 'applied-unreviewed'
    }])
    expect(store.updateChangeSetStatus('change-1', 'kept').status).toBe('kept')
    store.close()
  })

  it('recovers persisted running turns as failed without discarding partial output', () => {
    const databasePath = temporaryDatabase()
    const secrets = new MemorySecrets()
    const firstStore = new AiStore({ databasePath, secrets, now: () => 30 })
    const conversation = firstStore.createConversation({ title: 'Interrupted', mode: 'ask' })
    firstStore.updateConversationStatus(conversation.id, 'running')
    firstStore.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Partial response',
      status: 'streaming'
    })
    firstStore.close()

    const recoveredStore = new AiStore({ databasePath, secrets, now: () => 40 })

    expect(recoveredStore.getConversation(conversation.id)?.status).toBe('failed')
    expect(recoveredStore.listMessages(conversation.id)).toMatchObject([{
      content: 'Partial response',
      status: 'failed'
    }])
    recoveredStore.close()
  })

  it('rejects renderer-controlled relative CLI commands', async() => {
    const store = new AiStore({
      databasePath: temporaryDatabase(),
      secrets: new MemorySecrets()
    })
    await expect(store.saveConfig({
      input: {
        name: 'Unsafe',
        kind: 'cli',
        provider: 'codex',
        executablePath: './wrapper.sh'
      }
    })).rejects.toThrow('absolute path')
    store.close()
  })

  it('accepts the DBX CLI provider set and persists scoped environment variables', async() => {
    const store = new AiStore({
      databasePath: temporaryDatabase(),
      secrets: new MemorySecrets(),
      createId: (() => {
        let id = 0
        return () => `cli-${++id}`
      })()
    })
    for (const provider of ['cursor-cli', 'grok-cli', 'codebuddy-cli', 'qoder-cli'] as const) {
      await expect(store.saveConfig({
        input: {
          name: provider,
          kind: 'cli',
          provider,
          environment: { HTTPS_PROXY: 'http://127.0.0.1:7890' }
        }
      })).resolves.toMatchObject({ provider, kind: 'cli' })
    }
    expect(await store.listConfigSummaries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: 'cursor-cli',
        environment: { HTTPS_PROXY: 'http://127.0.0.1:7890' }
      })
    ]))
    await expect(store.saveConfig({
      input: {
        name: 'Invalid environment',
        kind: 'cli',
        provider: 'codex',
        environment: { 'BAD-KEY': 'value' }
      }
    })).rejects.toThrow('Invalid CLI environment variable name')
    store.close()
  })

  it('persists the DBX API retry preference with a strict backend range', () => {
    const store = new AiStore({
      databasePath: temporaryDatabase(),
      secrets: new MemorySecrets()
    })
    expect(store.getPreferences()).toEqual({ maxApiRetries: 2 })
    expect(store.savePreferences({ maxApiRetries: 7 })).toEqual({ maxApiRetries: 7 })
    expect(store.getPreferences()).toEqual({ maxApiRetries: 7 })
    expect(() => store.savePreferences({ maxApiRetries: 11 })).toThrow('0 to 10')
    store.close()
  })

  it('accepts DBX API providers that do not require a key', async() => {
    const store = new AiStore({
      databasePath: temporaryDatabase(),
      secrets: new MemorySecrets(),
      createId: () => 'ollama'
    })
    await expect(store.saveConfig({
      input: {
        name: 'Ollama',
        kind: 'api',
        provider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        defaultModelId: 'llama3.1',
        apiStyle: 'chat-completions',
        authMethod: 'bearer'
      }
    })).resolves.toMatchObject({ provider: 'ollama', apiKeyConfigured: false })
    store.close()
  })

  it('keeps independent default configurations for Ask and Agent', async() => {
    const store = new AiStore({
      databasePath: temporaryDatabase(),
      secrets: new MemorySecrets(),
      createId: (() => {
        let id = 0
        return () => `config-${++id}`
      })()
    })
    const api = await store.saveConfig({
      input: {
        name: 'Ask API',
        kind: 'api',
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        apiKey: 'secret'
      }
    })
    const codex = await store.saveConfig({
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    const claude = await store.saveConfig({
      input: { name: 'Claude Code', kind: 'cli', provider: 'claude-code' },
      isDefault: true
    })

    expect(api.isDefault).toBe(true)
    expect(codex.isDefault).toBe(true)
    expect(claude.isDefault).toBe(true)
    expect(await store.listConfigSummaries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: api.id, kind: 'api', isDefault: true }),
      expect.objectContaining({ id: codex.id, kind: 'cli', isDefault: false }),
      expect.objectContaining({ id: claude.id, kind: 'cli', isDefault: true })
    ]))

    await store.deleteConfig(claude.id)
    expect(await store.getRuntimeConfigForKind('api')).toMatchObject({ id: api.id, isDefault: true })
    expect(await store.getRuntimeConfigForKind('cli')).toMatchObject({ id: codex.id, isDefault: true })
    store.close()
  })
})
