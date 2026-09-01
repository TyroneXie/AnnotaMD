import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiWorkspaceEvent } from '@shared/types/aiWorkspace'
import type {
  AiHost,
  AiHostConfig,
  AiHostConnectionResult,
  AiHostEvent,
  AiHostModel,
  AiHostRunRequest
} from 'main_renderer/ai/AiHost'
import { AiStore } from 'main_renderer/ai/AiStore'
import type { AiSecretStore } from 'main_renderer/ai/AiSecretStore'
import { AiWorkspaceService } from 'main_renderer/ai/AiWorkspaceService'

class Secrets implements AiSecretStore {
  private readonly values = new Map<string, string>()
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<void> { this.values.delete(key) }
}

class FakeHost implements AiHost {
  readonly providers = ['openai-compatible', 'codex'] as const
  readonly kind: 'api' | 'cli'
  requests: AiHostRunRequest[] = []
  constructor(kind: 'api' | 'cli') { this.kind = kind }
  async listModels(_config: AiHostConfig): Promise<AiHostModel[]> {
    return [{
      id: 'model-1',
      displayName: 'Model One',
      effortLevels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
    }]
  }
  async testConnection(_config: AiHostConfig): Promise<AiHostConnectionResult> {
    return { success: true, message: 'ok' }
  }
  async run(request: AiHostRunRequest, emit: (event: AiHostEvent) => void): Promise<string> {
    this.requests.push(request)
    emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
    emit({ type: 'text-delta', runId: request.runId, delta: 'Done' })
    emit({ type: 'run-finished', runId: request.runId })
    return 'Done'
  }
  async stop(_runId: string): Promise<boolean> { return true }
  dispose(): void {}
}

const directories: string[] = []
const setup = (options: { now?: () => number; agentWorkspacePath?: string } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'annotamd-ai-service-'))
  directories.push(directory)
  const apiHost = new FakeHost('api')
  const cliHost = new FakeHost('cli')
  const events: AiWorkspaceEvent[] = []
  const scopes = {
    issued: [] as Array<Record<string, unknown>>,
    revoked: [] as string[],
    issueScope(input: Record<string, unknown>) {
      this.issued.push(input)
      return 'scope-1'
    },
    revokeScope(token: string) { this.revoked.push(token) },
    revokeRun: vi.fn()
  }
  const transaction = {
    sessionId: 'conversation',
    turnId: 'turn',
    documentId: 'doc-1',
    documentUri: 'untitled://doc-1',
    beforeMarkdown: 'old',
    finalMarkdown: 'new',
    mutationCount: 1,
    diff: { additions: 1, deletions: 1, lines: [] },
    status: 'active' as const
  }
  const transactions = {
    getRunTransaction: vi.fn((runId: string) => (
      cliHost.requests.some(request => request.runId === runId)
        ? { ...transaction, turnId: runId }
        : undefined
    )),
    forgetRun: vi.fn(),
    request: vi.fn()
  }
  const service = new AiWorkspaceService({
    store: new AiStore({ databasePath: join(directory, 'ai.sqlite'), secrets: new Secrets() }),
    apiHost,
    cliHost,
    piHost: cliHost,
    documentScopes: scopes,
    createMcpLaunchSpec: token => ({
      command: '/annotamd', args: ['/mcp'], env: { ANNOTAMD_AGENT_SCOPE_TOKEN: token }
    }),
    prepareAgentRun: async() => {},
    documentTransactions: transactions,
    ...(options.now ? { now: options.now } : {}),
    ...(options.agentWorkspacePath ? { agentWorkspacePath: options.agentWorkspacePath } : {})
  })
  const owner = {
    id: 5,
    send: (_channel: 'annotamd::ai::event', event: AiWorkspaceEvent) => events.push(event)
  }
  return { service, apiHost, cliHost, events, scopes, transactions, owner }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('AnnotaMD AI workspace service', () => {
  it('renames a conversation and emits the persisted update', async() => {
    const { service, events, owner } = setup()
    const conversation = service.createConversation(owner, {
      title: 'Old title', mode: 'agent', templateIds: []
    })

    const renamed = service.renameConversation(owner, conversation.id, '  New   title  ')

    expect(renamed.title).toBe('New title')
    expect(service.listConversations(owner).find(item => item.id === conversation.id)?.title)
      .toBe('New title')
    expect(events).toContainEqual({ type: 'conversation-updated', conversation: renamed })
    service.dispose()
  })

  it('preserves each model\'s provider-reported effort levels for the sidebar', async() => {
    const { service, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })

    await expect(service.listModels(owner, config.id)).resolves.toEqual([{
      id: 'model-1',
      name: 'Model One',
      provider: 'codex',
      effortLevels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
    }])
    service.dispose()
  })

  it('passes validated turn-only attachments to the CLI host', async() => {
    const { service, cliHost, owner } = setup()
    await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' },
      isDefault: true
    })

    await service.sendAndWait(owner, {
      text: 'Review these references',
      selection: { mode: 'agent', templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 1,
      attachments: [{
        kind: 'text',
        name: 'notes.md',
        content: '# Notes'
      }, {
        kind: 'image',
        name: 'diagram.png',
        mediaType: 'image/png',
        data: Buffer.from('image').toString('base64'),
        sizeBytes: 5
      }]
    })

    expect(cliHost.requests[0]?.attachments).toMatchObject([
      { kind: 'text', name: 'notes.md', content: '# Notes' },
      { kind: 'image', name: 'diagram.png', sizeBytes: 5 }
    ])
    service.dispose()
  })

  it('runs native CLIs from the fixed AnnotaMD project while preserving active workspace access', async() => {
    const { service, cliHost, owner } = setup({ agentWorkspacePath: '/annotamd/agent-workspace' })
    await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' },
      isDefault: true
    })

    await service.sendAndWait(owner, {
      text: 'Review this project',
      selection: { mode: 'agent', templateIds: [] },
      workspacePath: '/workspace/project'
    })

    expect(cliHost.requests[0]).toMatchObject({
      workspacePath: '/annotamd/agent-workspace',
      additionalWorkspacePaths: ['/workspace/project'],
      workspaceProject: {
        name: 'AnnotaMD',
        idempotencyKey: 'annotamd-agent-workspace-v1'
      }
    })
    service.dispose()
  })

  it('lets comment turns await the same streamed Host completion used by the sidebar', async() => {
    const { service, cliHost, owner } = setup()
    const started: Array<{ conversationId: string; turnId: string }> = []
    await service.saveConfig(owner, {
      input: { name: 'Default Agent', kind: 'cli', provider: 'codex' },
      isDefault: true
    })
    const completion = await service.sendAndWait(owner, {
      text: 'Comment task',
      selection: { mode: 'agent', templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 1
    }, 19, turn => started.push(turn))

    expect(cliHost.requests).toHaveLength(1)
    expect(started).toHaveLength(1)
    expect(started[0]?.turnId).toBe(cliHost.requests[0]?.runId)
    expect(completion).toMatchObject({
      status: 'completed',
      assistantMessage: { content: 'Done', status: 'complete' }
    })
    service.dispose()
  })

  it('streams Ask through an API config and persists the conversation', async() => {
    const { service, apiHost, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: {
        name: 'Ask API',
        kind: 'api',
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        apiKey: 'secret',
        defaultModelId: 'model-1'
      }
    })
    const result = await service.send(owner, {
      text: 'Hello',
      selection: { mode: 'ask', configId: config.id, templateIds: [] },
      workspacePath: ''
    }, 9)
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })
    expect(apiHost.requests).toHaveLength(1)
    expect((await service.getSnapshot(owner)).messages.at(-1)).toMatchObject({
      id: result.assistantMessageId,
      content: 'Done',
      status: 'complete'
    })
    service.dispose()
  })

  it('persists assistant text after tool activity as a separate message segment', async() => {
    const { service, cliHost, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    vi.spyOn(cliHost, 'run').mockImplementation(async(request, emit) => {
      cliHost.requests.push(request)
      emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
      emit({ type: 'text-delta', runId: request.runId, delta: 'I will inspect the document.' })
      emit({
        type: 'tool-started',
        runId: request.runId,
        toolCallId: 'tool-1',
        toolName: 'readDocument'
      })
      emit({
        type: 'tool-finished',
        runId: request.runId,
        toolCallId: 'tool-1',
        toolName: 'readDocument',
        output: 'Document read',
        isError: false
      })
      emit({ type: 'text-delta', runId: request.runId, delta: 'The review is complete.' })
      emit({ type: 'run-finished', runId: request.runId })
      return 'The review is complete.'
    })

    const result = await service.send(owner, {
      text: 'Review the document',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace'
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    const messages = (await service.getSnapshot(owner)).messages.filter(message => (
      message.toolName !== 'annotamd:run-summary'
    ))
    expect(messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'Review the document'],
      ['assistant', 'I will inspect the document.'],
      ['tool', 'Document read'],
      ['assistant', 'The review is complete.']
    ])
    expect(messages[1]?.id).toBe(result.assistantMessageId)
    service.dispose()
  })

  it('persists provider reasoning and run duration as process metadata', async() => {
    let now = 1_000
    const { service, cliHost, events, owner } = setup({ now: () => now })
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    vi.spyOn(cliHost, 'run').mockImplementation(async(request, emit) => {
      cliHost.requests.push(request)
      emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
      emit({ type: 'reasoning-delta', runId: request.runId, delta: 'Checking the document structure.' })
      emit({ type: 'text-delta', runId: request.runId, delta: 'I will inspect the document.' })
      emit({
        type: 'tool-started', runId: request.runId, toolCallId: 'tool-1', toolName: 'readDocument'
      })
      emit({
        type: 'tool-finished', runId: request.runId, toolCallId: 'tool-1',
        toolName: 'readDocument', output: 'Document read', isError: false
      })
      emit({ type: 'text-delta', runId: request.runId, delta: 'The review is complete.' })
      now = 3_500
      emit({ type: 'run-finished', runId: request.runId })
      return 'The review is complete.'
    })

    await service.send(owner, {
      text: 'Review the document',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace'
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    const messages = (await service.getSnapshot(owner)).messages
    expect(messages.map(message => [message.role, message.toolName, message.content])).toEqual([
      ['user', undefined, 'Review the document'],
      ['system', 'annotamd:run-summary', JSON.stringify({ durationMs: 2_500 })],
      ['system', 'annotamd:reasoning', 'Checking the document structure.'],
      ['assistant', undefined, 'I will inspect the document.'],
      ['tool', 'readDocument', 'Document read'],
      ['assistant', undefined, 'The review is complete.']
    ])
    expect(events).toContainEqual(expect.objectContaining({
      type: 'message-delta',
      role: 'system',
      toolName: 'annotamd:reasoning',
      delta: 'Checking the document structure.'
    }))
    service.dispose()
  })

  it('persists the run failure reason in process metadata', async() => {
    let now = 1_000
    const { service, cliHost, owner } = setup({ now: () => now })
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    vi.spyOn(cliHost, 'run').mockImplementation(async(request) => {
      cliHost.requests.push(request)
      now = 2_500
      throw new Error('CLI process exited with code 1')
    })

    await service.send(owner, {
      text: 'Review the document',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace'
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    const summary = (await service.getSnapshot(owner)).messages.find(message => (
      message.toolName === 'annotamd:run-summary'
    ))
    expect(summary).toMatchObject({ status: 'failed' })
    expect(JSON.parse(summary?.content ?? '{}')).toEqual({
      durationMs: 1_500,
      error: 'CLI process exited with code 1'
    })
    service.dispose()
  })

  it('continues a matching conversation and forks when its workspace identity changes', async() => {
    const { service, apiHost, events, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: {
        name: 'Ask API',
        kind: 'api',
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        apiKey: 'secret',
        defaultModelId: 'model-1'
      }
    })
    const first = await service.send(owner, {
      text: 'First',
      selection: { mode: 'ask', configId: config.id, templateIds: ['template-1'] },
      workspacePath: '/workspace/one'
    })
    await vi.waitFor(() => expect(apiHost.requests).toHaveLength(1))
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    const continued = await service.send(owner, {
      conversationId: first.conversationId,
      text: 'Second',
      selection: { mode: 'ask', configId: config.id, templateIds: ['template-1'] },
      workspacePath: '/workspace/one'
    })
    await vi.waitFor(() => expect(apiHost.requests).toHaveLength(2))
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    const forked = await service.send(owner, {
      conversationId: first.conversationId,
      text: 'Third',
      selection: { mode: 'ask', configId: config.id, templateIds: ['template-1'] },
      workspacePath: '/workspace/two'
    })
    await vi.waitFor(() => expect(apiHost.requests).toHaveLength(3))

    expect(continued.conversationId).toBe(first.conversationId)
    expect(forked.conversationId).not.toBe(first.conversationId)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'conversation-selected',
        conversationId: forked.conversationId
      })
    ]))
    expect(service.listConversations(owner)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: first.conversationId,
        provider: 'openai-compatible',
        modelId: 'model-1',
        templateIds: ['template-1'],
        workspacePath: '/workspace/one'
      }),
      expect.objectContaining({
        id: forked.conversationId,
        workspacePath: '/workspace/two'
      })
    ]))
    service.dispose()
  })

  it('titles a manually-created empty conversation from its first user message', async() => {
    const { service, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: {
        name: 'Ask API',
        kind: 'api',
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        apiKey: 'secret'
      }
    })
    const conversation = service.createConversation(owner, {
      title: 'New conversation',
      mode: 'ask',
      configId: config.id,
      templateIds: []
    })

    await service.send(owner, {
      conversationId: conversation.id,
      text: 'First prompt becomes the title\nMore detail',
      selection: { mode: 'ask', configId: config.id, templateIds: [] },
      workspacePath: ''
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    expect(service.listConversations(owner)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: conversation.id,
        title: 'First prompt becomes the title'
      })
    ]))
    service.dispose()
  })

  it('scopes Agent MCP access, persists a real change set and revokes the token', async() => {
    const { service, cliHost, scopes, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    const result = await service.send(owner, {
      text: 'Edit it',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 3,
      documentDirty: true,
      selectionText: 'selected passage'
    }, 19)
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })
    expect(scopes.issued[0]).toMatchObject({
      windowId: 19,
      conversationId: result.conversationId,
      selectionText: 'selected passage'
    })
    expect(cliHost.requests[0].mcp?.env?.ANNOTAMD_AGENT_SCOPE_TOKEN).toBe('scope-1')
    expect((await service.getSnapshot(owner)).changeSets).toMatchObject([{
      turnId: result.turnId,
      status: 'applied-unreviewed',
      originalContent: 'old',
      appliedContent: 'new'
    }])
    expect(scopes.revoked).toContain('scope-1')
    service.dispose()
  })

  it('surfaces a native CLI approval and returns the user decision to the same run', async() => {
    const { service, cliHost, events, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    let resume: (() => void) | undefined
    vi.spyOn(cliHost, 'run').mockImplementation(async(request, emit) => {
      cliHost.requests.push(request)
      emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
      emit({
        type: 'approval-requested',
        runId: request.runId,
        approvalId: `${request.runId}:approval-1`,
        provider: 'codex',
        kind: 'command',
        title: 'Codex requests permission to run a command',
        command: 'npm test',
        options: ['allow-once', 'allow-session', 'deny']
      })
      await new Promise<void>(resolve => { resume = resolve })
      emit({ type: 'text-delta', runId: request.runId, delta: 'Done' })
      emit({ type: 'run-finished', runId: request.runId })
      return 'Done'
    })
    cliHost.resolveApproval = vi.fn(async() => {
      resume?.()
      return true
    })

    const result = await service.send(owner, {
      text: 'Run the checks',
      selection: {
        mode: 'agent',
        configId: config.id,
        permissionMode: 'request',
        templateIds: []
      },
      workspacePath: '/workspace'
    })
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({
        type: 'approval-requested',
        approval: expect.objectContaining({
          runId: result.turnId,
          command: 'npm test'
        })
      }))
    })

    await expect(service.resolveApproval(owner, {
      conversationId: result.conversationId,
      runId: result.turnId,
      approvalId: `${result.turnId}:approval-1`,
      decision: 'allow-session'
    })).resolves.toBe(true)
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })
    expect(cliHost.resolveApproval).toHaveBeenCalledWith(
      result.turnId,
      `${result.turnId}:approval-1`,
      'allow-session'
    )
    expect(events).toContainEqual({
      type: 'approval-resolved',
      conversationId: result.conversationId,
      turnId: result.turnId,
      approvalId: `${result.turnId}:approval-1`,
      decision: 'allow-session'
    })
    service.dispose()
  })

  it('collects a native CLI file write into the current-document Diff checkpoint', async() => {
    const { service, cliHost, transactions, owner } = setup()
    const filePath = join(directories.at(-1)!, 'note.md')
    writeFileSync(filePath, 'before\n', 'utf8')
    transactions.getRunTransaction.mockReturnValue(undefined)
    transactions.request.mockImplementation(async(_windowId, request) => {
      const transaction = {
        sessionId: request.sessionId,
        turnId: request.turnId,
        documentId: 'doc-1',
        documentUri: `file://${filePath}`,
        filePath,
        beforeMarkdown: 'before\n',
        finalMarkdown: request.action === 'mutate' ? request.nextMarkdown : 'before\n',
        mutationCount: request.action === 'mutate' ? 1 : 0,
        diff: { additions: request.action === 'mutate' ? 1 : 0, deletions: request.action === 'mutate' ? 1 : 0, lines: [] },
        status: 'active' as const
      }
      if (request.action === 'begin') return { status: 'started' as const, transaction }
      if (request.action === 'mutate') {
        return {
          status: 'applied' as const,
          transaction,
          appliedMarkdown: request.nextMarkdown,
          changed: false
        }
      }
      throw new Error(`Unexpected transaction action: ${request.action}`)
    })
    vi.spyOn(cliHost, 'run').mockImplementation(async(request, emit) => {
      cliHost.requests.push(request)
      emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
      writeFileSync(filePath, 'after\n', 'utf8')
      emit({ type: 'run-finished', runId: request.runId })
      return 'Changed the document.'
    })
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })

    const result = await service.send(owner, {
      text: 'Edit it',
      selection: {
        mode: 'agent', configId: config.id, permissionMode: 'request', templateIds: []
      },
      workspacePath: join(directories.at(-1)!),
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: `file://${filePath}`,
      filePath,
      markdown: 'before\n',
      documentRevision: 1,
      documentDirty: false
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    expect(transactions.request).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({
      action: 'mutate',
      turnId: result.turnId,
      expectedMarkdown: 'before\n',
      nextMarkdown: 'after\n'
    }))
    expect(service.listChangeSets(owner, result.conversationId)).toEqual([
      expect.objectContaining({
        originalContent: 'before\n',
        appliedContent: 'after\n',
        status: 'applied-unreviewed'
      })
    ])
    service.dispose()
  })

  it('uses the live Muya checkpoint when the sidebar document snapshot is stale', async() => {
    const { service, scopes, transactions, owner } = setup()
    const filePath = join(directories.at(-1)!, 'live.md')
    writeFileSync(filePath, 'live\n', 'utf8')
    transactions.getRunTransaction.mockReturnValue(undefined)
    transactions.request.mockImplementation(async(_windowId, request) => {
      const transaction = {
        sessionId: request.sessionId,
        turnId: request.turnId,
        documentId: 'doc-1',
        documentUri: `file://${filePath}`,
        filePath,
        beforeMarkdown: 'live\n',
        finalMarkdown: 'live\n',
        mutationCount: 0,
        diff: { additions: 0, deletions: 0, lines: [] },
        status: request.action === 'keep' ? 'kept' as const : 'active' as const
      }
      if (request.action === 'begin') return { status: 'started' as const, transaction }
      if (request.action === 'keep') return { status: 'kept' as const, transaction, changed: false as const }
      throw new Error(`Unexpected transaction action: ${request.action}`)
    })
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })

    await service.sendAndWait(owner, {
      text: 'Summarize it',
      selection: {
        mode: 'agent', configId: config.id, permissionMode: 'request', templateIds: []
      },
      workspacePath: join(directories.at(-1)!),
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: `file://${filePath}`,
      filePath,
      markdown: 'stale\n',
      documentRevision: 1,
      documentDirty: false
    })

    expect(transactions.request).toHaveBeenCalledWith(expect.any(Number), expect.not.objectContaining({
      action: 'begin',
      expectedMarkdown: expect.anything()
    }))
    expect(scopes.issued).toContainEqual(expect.objectContaining({
      document: expect.objectContaining({
        markdown: 'live\n'
      })
    }))
    service.dispose()
  })

  it('rejects an editor that becomes dirty while the Agent checkpoint is being captured', async() => {
    const { service, transactions, owner } = setup()
    const filePath = join(directories.at(-1)!, 'dirty-during-send.md')
    writeFileSync(filePath, 'before\n', 'utf8')
    transactions.request.mockImplementation(async(_windowId, request) => {
      const transaction = {
        sessionId: request.sessionId,
        turnId: request.turnId,
        documentId: 'doc-1',
        documentUri: `file://${filePath}`,
        filePath,
        beforeMarkdown: 'typed but unsaved\n',
        finalMarkdown: 'typed but unsaved\n',
        mutationCount: 0,
        diff: { additions: 0, deletions: 0, lines: [] },
        status: request.action === 'keep' ? 'kept' as const : 'active' as const
      }
      if (request.action === 'begin') {
        return { status: 'started' as const, transaction, documentDirty: true }
      }
      if (request.action === 'keep') return { status: 'kept' as const, transaction, changed: false as const }
      throw new Error(`Unexpected transaction action: ${request.action}`)
    })
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })

    await expect(service.send(owner, {
      text: 'Edit it',
      selection: {
        mode: 'agent', configId: config.id, permissionMode: 'request', templateIds: []
      },
      workspacePath: join(directories.at(-1)!),
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: `file://${filePath}`,
      filePath,
      markdown: 'before\n',
      documentRevision: 1,
      documentDirty: false
    })).rejects.toThrow('Save the current document')
    expect(transactions.request).toHaveBeenLastCalledWith(expect.any(Number), expect.objectContaining({
      action: 'keep'
    }))
    service.dispose()
  })

  it('closes an unchanged native CLI document checkpoint without creating a Diff', async() => {
    const { service, transactions, owner } = setup()
    const filePath = join(directories.at(-1)!, 'unchanged.md')
    writeFileSync(filePath, 'same\n', 'utf8')
    transactions.getRunTransaction.mockReturnValue(undefined)
    transactions.request.mockImplementation(async(_windowId, request) => {
      const transaction = {
        sessionId: request.sessionId,
        turnId: request.turnId,
        documentId: 'doc-1',
        documentUri: `file://${filePath}`,
        filePath,
        beforeMarkdown: 'same\n',
        finalMarkdown: 'same\n',
        mutationCount: 0,
        diff: { additions: 0, deletions: 0, lines: [] },
        status: request.action === 'keep' ? 'kept' as const : 'active' as const
      }
      if (request.action === 'begin') return { status: 'started' as const, transaction }
      if (request.action === 'keep') return { status: 'kept' as const, transaction, changed: false as const }
      throw new Error(`Unexpected transaction action: ${request.action}`)
    })
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })

    const result = await service.send(owner, {
      text: 'Read only',
      selection: {
        mode: 'agent', configId: config.id, permissionMode: 'request', templateIds: []
      },
      workspacePath: join(directories.at(-1)!),
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: `file://${filePath}`,
      filePath,
      markdown: 'same\n',
      documentRevision: 1,
      documentDirty: false
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    expect(transactions.request).toHaveBeenCalledWith(expect.any(Number), {
      action: 'keep',
      sessionId: result.conversationId,
      turnId: result.turnId
    })
    expect(service.listChangeSets(owner, result.conversationId)).toEqual([])
    service.dispose()
  })

  it('keeps the Ask/API and Agent/CLI boundary strict', async() => {
    const { service, owner } = setup()
    const api = await service.saveConfig(owner, {
      input: {
        name: 'API', kind: 'api', provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1', apiKey: 'secret'
      }
    })
    const cli = await service.saveConfig(owner, {
      input: { name: 'CLI', kind: 'cli', provider: 'codex' }
    })
    await expect(service.send(owner, {
      text: 'No', selection: { mode: 'ask', configId: cli.id, templateIds: [] }, workspacePath: ''
    })).rejects.toThrow('Ask mode requires an API')
    await expect(service.send(owner, {
      text: 'No', selection: { mode: 'agent', configId: api.id, templateIds: [] }, workspacePath: ''
    })).rejects.toThrow('Agent mode requires a local CLI')
    service.dispose()
  })

  it('selects a mode-compatible config when the global default has the other kind', async() => {
    const { service, apiHost, cliHost, owner } = setup()
    await service.saveConfig(owner, {
      input: {
        name: 'Default API', kind: 'api', provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1', apiKey: 'secret'
      },
      isDefault: true
    })
    await service.saveConfig(owner, {
      input: { name: 'Agent CLI', kind: 'cli', provider: 'codex' },
      isDefault: false
    })
    await service.send(owner, {
      text: 'Ask', selection: { mode: 'ask', templateIds: [] }, workspacePath: ''
    })
    await vi.waitFor(() => expect(apiHost.requests).toHaveLength(1))
    await service.send(owner, {
      text: 'Edit',
      selection: { mode: 'agent', templateIds: [] },
      workspacePath: '',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 1
    })
    await vi.waitFor(() => expect(cliHost.requests).toHaveLength(1))
    service.dispose()
  })

  it('does not delete the only rollback record for an unreviewed Agent change', async() => {
    const { service, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    const result = await service.send(owner, {
      text: 'Edit',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 1
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    await expect(service.deleteConversation(owner, result.conversationId)).rejects.toThrow(
      'Keep or roll back'
    )
    expect(service.listConversations(owner)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.conversationId })
    ]))
    service.dispose()
  })

  it('passes the persisted transaction checkpoint when resolving after renderer restart', async() => {
    const { service, owner, transactions } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    const result = await service.send(owner, {
      text: 'Edit',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 1
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })
    const [changeSet] = service.listChangeSets(owner, result.conversationId)
    if (!changeSet?.transaction) throw new Error('Expected persisted transaction')
    transactions.request.mockResolvedValue({
      status: 'kept',
      transaction: { ...changeSet.transaction, status: 'kept' },
      changed: false
    })

    await service.resolveChangeSet(owner, {
      changeSetId: changeSet.id,
      action: 'keep'
    }, 19)

    expect(transactions.request).toHaveBeenCalledWith(19, {
      action: 'keep',
      sessionId: result.conversationId,
      turnId: result.turnId,
      transaction: changeSet.transaction
    })
    service.dispose()
  })

  it('requires the pending document change to be resolved before another Agent turn', async() => {
    const { service, owner } = setup()
    const config = await service.saveConfig(owner, {
      input: { name: 'Codex', kind: 'cli', provider: 'codex' }
    })
    await service.send(owner, {
      text: 'First edit',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'old',
      documentRevision: 1
    })
    await vi.waitFor(async() => {
      expect((await service.getSnapshot(owner)).running).toBe(false)
    })

    await expect(service.send(owner, {
      text: 'Second edit',
      selection: { mode: 'agent', configId: config.id, templateIds: [] },
      workspacePath: '/workspace',
      documentHandleId: 'handle-1',
      documentId: 'doc-1',
      documentUri: 'untitled://doc-1',
      markdown: 'new',
      documentRevision: 2
    })).rejects.toThrow('Keep or roll back the pending Agent document changes')
    service.dispose()
  })
})
