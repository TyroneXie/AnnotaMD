import { describe, expect, it } from 'vitest'
import type {
  AiApiConfigInput,
  AiCliConfigInput,
  AiConfigSummary,
  AiConversation,
  AiTemplate,
  AiWorkspaceEvent,
  AiRetryRequest,
  AiSendRequest,
  AiStopRequest
} from '../../../src/shared/types/aiWorkspace'
import {
  AI_API_PROVIDER_PRESETS,
  AI_CLI_PROVIDER_PRESETS,
  supportsNativeApprovalBridge
} from '../../../src/shared/types/aiProviderPresets'

const eventType = (event: AiWorkspaceEvent): string => event.type

describe('provider-neutral AI workspace contract', () => {
  it('separates API model configuration from CLI Agent configuration', () => {
    const api = {
      name: 'General Q&A',
      kind: 'api',
      provider: 'openai-compatible',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'not-a-real-key',
      defaultModelId: 'model-1',
      apiStyle: 'chat-completions',
      authMethod: 'bearer'
    } satisfies AiApiConfigInput
    const cli = {
      name: 'Pi Agent',
      kind: 'cli',
      provider: 'pi',
      executablePath: '/usr/local/bin/pi',
      supportsNativeResume: true
    } satisfies AiCliConfigInput
    const summary = {
      id: 'api-1',
      name: api.name,
      kind: api.kind,
      provider: api.provider,
      isDefault: true,
      enabled: true,
      baseUrl: api.baseUrl,
      apiKeyConfigured: true,
      defaultModelId: api.defaultModelId
    } satisfies AiConfigSummary

    expect(api.kind).toBe('api')
    expect(cli.kind).toBe('cli')
    expect(cli.supportsNativeResume).toBe(true)
    expect(summary.apiKeyConfigured).toBe(true)
  })

  it('keeps the DBX Ask provider presets and the legacy AnnotaMD alias', () => {
    expect(Object.keys(AI_API_PROVIDER_PRESETS)).toEqual(expect.arrayContaining([
      'claude',
      'openai',
      'gemini',
      'deepseek',
      'qwen',
      'minimax',
      'ollama',
      'anthropic-compatible',
      'openai-compatible',
      'custom',
      'anthropic-messages'
    ]))
    expect(AI_API_PROVIDER_PRESETS.gemini.apiStyle).toBe('gemini-generate-content')
    expect(AI_API_PROVIDER_PRESETS.ollama.requiresApiKey).toBe(false)
    expect(AI_API_PROVIDER_PRESETS['anthropic-messages'].apiStyle).toBe('anthropic-messages')
  })

  it('offers request approval for every built-in CLI provider', () => {
    expect(Object.keys(AI_CLI_PROVIDER_PRESETS)).toHaveLength(8)
    expect(Object.keys(AI_CLI_PROVIDER_PRESETS).every(provider => (
      supportsNativeApprovalBridge(provider as keyof typeof AI_CLI_PROVIDER_PRESETS)
    ))).toBe(true)
  })

  it('keeps conversation model, effort, templates, and native session metadata together', () => {
    const conversation = {
      id: 'conversation-1',
      title: 'Review the current document',
      mode: 'agent',
      configId: 'cli-1',
      modelId: 'provider/model',
      effort: { kind: 'preset', id: 'high' },
      templateIds: ['template-1'],
      nativeSessionId: 'session-1',
      nativeSessionFile: '/sessions/session-1.jsonl',
      status: 'idle',
      createdAt: 1,
      updatedAt: 2
    } satisfies AiConversation
    const template = {
      id: 'template-1',
      name: 'Technical review',
      content: 'Focus on correctness.',
      createdAt: 1,
      updatedAt: 1
    } satisfies AiTemplate

    expect(conversation.templateIds).toEqual([template.id])
    expect(conversation.nativeSessionFile).toContain('session-1')
  })

  it('defines send, stop, and retry payloads without provider-specific fields', () => {
    const send = {
      text: 'Summarize this document.',
      selection: {
        mode: 'ask',
        configId: 'api-1',
        modelId: 'model-1',
        effort: { kind: 'provider-default' },
        templateIds: ['template-1']
      },
      workspacePath: '/workspace',
      documentId: 'document-1',
      filePath: '/workspace/note.md',
      markdown: '# Note'
    } satisfies AiSendRequest
    const stop = { conversationId: 'conversation-1', turnId: 'turn-1' } satisfies AiStopRequest
    const retry = { conversationId: 'conversation-1', messageId: 'message-1' } satisfies AiRetryRequest

    expect(send.selection.mode).toBe('ask')
    expect(stop.turnId).toBe('turn-1')
    expect(retry.messageId).toBe('message-1')
  })

  it('uses one discriminated event stream for messages, tools, errors, and snapshots', () => {
    const events: AiWorkspaceEvent[] = [
      {
        type: 'message-delta',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        messageId: 'message-1',
        role: 'assistant',
        delta: 'Partial'
      },
      {
        type: 'tool',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        tool: {
          id: 'tool-1',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          name: 'edit',
          state: 'succeeded'
        }
      },
      {
        type: 'change-set',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        changeSet: {
          id: 'change-set-1',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          filePath: '/workspace/note.md',
          originalContent: '# Before',
          appliedContent: '# After',
          status: 'applied-unreviewed',
          additions: 1,
          deletions: 1,
          createdAt: 1
        }
      },
      {
        type: 'turn-error',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: 'Stopped',
        retryable: true
      }
    ]

    expect(events.map(eventType)).toEqual([
      'message-delta',
      'tool',
      'change-set',
      'turn-error'
    ])
  })
})
