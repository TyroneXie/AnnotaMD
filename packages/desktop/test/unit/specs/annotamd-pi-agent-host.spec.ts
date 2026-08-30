// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  PiAgentHost,
  type PiAgentDocumentScopes
} from '../../../src/main/ai/PiAgentHost'
import { AiRunStoppedError, type AiHostEvent, type AiHostRunRequest } from '../../../src/main/ai/AiHost'
import { hashAgentDocument } from '../../../src/main/agentDocumentBridge/AgentDocumentScopeService'
import {
  decodePiBridgeEnvelope,
  encodePiBridgeEnvelope,
  type PiRpcProcessOptions
} from '../../../src/main/piWorkspace/PiRpcProcessManager'

type RuntimeMessageListener = (message: unknown) => void
type RuntimeExitListener = (error: Error) => void

class FakePiRuntime {
  currentState = {
    model: { provider: 'test', id: 'model' },
    isStreaming: false,
    sessionId: 'session-1'
  }

  readonly prompts: string[] = []
  readonly responses: Array<{ requestId: string; response: { value: string } | { cancelled: true } }> = []
  abortCalls = 0
  disposeCalls = 0
  private readonly messageListeners = new Set<RuntimeMessageListener>()
  private readonly exitListeners = new Set<RuntimeExitListener>()

  async start(): Promise<{ readiness: { status: 'ready'; model: string } }> {
    return { readiness: { status: 'ready', model: 'test/model' } }
  }

  async getAvailableModels(): Promise<Array<{ provider: string; id: string; name?: string }>> {
    return [
      { provider: 'test', id: 'model', name: 'Test model' },
      { provider: 'test', id: 'second' }
    ]
  }

  async getAvailableThinkingLevels(): Promise<string[]> {
    return ['off', 'high', 'xhigh']
  }

  async prompt(message: string): Promise<void> {
    this.prompts.push(message)
  }

  async abort(): Promise<void> {
    this.abortCalls += 1
  }

  respondToExtension(
    requestId: string,
    response: { value: string } | { cancelled: true }
  ): void {
    this.responses.push({ requestId, response })
  }

  onMessage(listener: RuntimeMessageListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onExit(listener: RuntimeExitListener): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) listener(message)
  }

  emitExit(error: Error): void {
    for (const listener of this.exitListeners) listener(error)
  }

  dispose(): void {
    this.disposeCalls += 1
  }
}

const documentPath = '/workspace/document.md'
const initialMarkdown = '# Before\n\nBody'
const proposedMarkdown = '# After\n\nBody'

const snapshot = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  handleId: 'handle-1',
  documentId: 'document-1',
  uri: `file://${documentPath}`,
  filePath: documentPath,
  revision: 3,
  contentHash: hashAgentDocument(initialMarkdown),
  dirty: true,
  markdown: initialMarkdown,
  ...overrides
})

const runRequest = (overrides: Partial<AiHostRunRequest> = {}): AiHostRunRequest => ({
  runId: 'run-1',
  conversationId: 'conversation-1',
  config: {
    id: 'pi-config',
    provider: 'pi',
    model: 'test/model',
    reasoningEffort: 'high'
  },
  messages: [{ role: 'user', content: 'Update the heading.' }],
  mode: 'agent',
  permissionMode: 'full-access',
  workspacePath: '/workspace',
  mcp: {
    command: 'unused-for-pi',
    args: [],
    env: { ANNOTAMD_AGENT_SCOPE_TOKEN: 'scope-token' }
  },
  ...overrides
})

const createHarness = (document = snapshot()): {
  host: PiAgentHost
  scopes: PiAgentDocumentScopes
  runtimes: FakePiRuntime[]
  runtimeOptions: PiRpcProcessOptions[]
} => {
  const runtimes: FakePiRuntime[] = []
  const runtimeOptions: PiRpcProcessOptions[] = []
  const scopes: PiAgentDocumentScopes = {
    readDocument: vi.fn(async() => document),
    editDocument: vi.fn(async() => ({
      ...document,
      revision: 4,
      contentHash: hashAgentDocument(proposedMarkdown)
    })),
    replaceDocument: vi.fn(async() => ({
      ...document,
      revision: 4,
      contentHash: hashAgentDocument(proposedMarkdown)
    }))
  }
  const host = new PiAgentHost({
    documentScopes: scopes,
    adapterPath: '/app/resources/pi-adapter/adapter.mjs',
    inspectPi: async() => ({
      status: 'ready',
      executablePath: '/opt/bin/pi',
      version: '0.84.3'
    }),
    createEnvironment: async() => ({
      PATH: '/opt/bin',
      ANNOTAMD_AGENT_SCOPE_TOKEN: 'must-not-leak'
    }),
    createRuntime: (options) => {
      runtimeOptions.push(options)
      const runtime = new FakePiRuntime()
      runtimes.push(runtime)
      return runtime
    }
  })
  return { host, scopes, runtimes, runtimeOptions }
}

const extensionRequest = (id: string, envelope: Record<string, unknown>): Record<string, unknown> => ({
  type: 'extension_ui_request',
  id,
  method: 'input',
  title: 'annotamd.bridge.v1',
  placeholder: encodePiBridgeEnvelope(envelope)
})

const decodedResponse = (runtime: FakePiRuntime, index: number): unknown => {
  const response = runtime.responses[index]?.response
  if (!response || !('value' in response)) throw new Error(`Missing bridge response ${index}`)
  return decodePiBridgeEnvelope(response.value)
}

describe('PiAgentHost', () => {
  it('discovers Pi models without leaking the document scope token to the child', async() => {
    const { host, runtimes, runtimeOptions } = createHarness()

    await expect(host.listModels({ id: 'pi', provider: 'pi' })).resolves.toEqual([
      { id: 'default', displayName: 'Pi default (test/model)', effortLevels: ['off', 'high', 'xhigh'] },
      { id: 'test/model', displayName: 'Test model', effortLevels: ['off', 'high', 'xhigh'] },
      { id: 'test/second', displayName: 'test/second', effortLevels: ['off', 'high', 'xhigh'] }
    ])
    expect(runtimeOptions[0]).toMatchObject({ noSession: true })
    expect(runtimeOptions[0]?.environment).not.toHaveProperty('ANNOTAMD_AGENT_SCOPE_TOKEN')
    expect(runtimes[0]?.disposeCalls).toBe(1)
  })

  it('routes read/edit through the live Muya scope and accepts the applied proposal immediately', async() => {
    const { host, scopes, runtimes, runtimeOptions } = createHarness()
    const events: AiHostEvent[] = []
    const result = host.run(runRequest(), event => events.push(event))
    await vi.waitFor(() => expect(runtimes).toHaveLength(1))
    const runtime = runtimes[0]!
    await vi.waitFor(() => expect(runtime.prompts).toHaveLength(1))

    expect(runtimeOptions[0]).toMatchObject({
      model: 'test/model',
      thinkingLevel: 'high',
      noSession: true
    })
    expect(runtime.prompts[0]).toContain('Do not use shell, grep, find, ls, or direct filesystem writes.')
    runtime.emitMessage(extensionRequest('snapshot-1', {
      v: 1,
      kind: 'snapshot',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'edit',
      path: 'document.md'
    }))
    await vi.waitFor(() => expect(runtime.responses).toHaveLength(1))
    expect(decodedResponse(runtime, 0)).toEqual({
      v: 1,
      kind: 'snapshot',
      handled: true,
      documentHandleId: 'handle-1',
      documentId: 'document-1',
      filePath: documentPath,
      content: initialMarkdown,
      contentHash: hashAgentDocument(initialMarkdown)
    })

    runtime.emitMessage(extensionRequest('proposal-1', {
      v: 1,
      kind: 'proposal',
      proposalId: 'proposal-1',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'edit',
      path: 'document.md',
      documentHandleId: 'handle-1',
      documentId: 'document-1',
      filePath: documentPath,
      baseHash: hashAgentDocument(initialMarkdown),
      originalContent: initialMarkdown,
      proposedContent: proposedMarkdown,
      proposedHash: hashAgentDocument(proposedMarkdown)
    }))
    await vi.waitFor(() => expect(runtime.responses).toHaveLength(2))
    expect(scopes.editDocument).toHaveBeenCalledWith('scope-token', {
      handleId: 'handle-1',
      expectedRevision: 3,
      expectedHash: hashAgentDocument(initialMarkdown),
      edits: [{ oldText: initialMarkdown, newText: proposedMarkdown }]
    })
    expect(decodedResponse(runtime, 1)).toEqual({
      v: 1,
      kind: 'decision',
      proposalId: 'proposal-1',
      decision: 'accepted',
      appliedHash: hashAgentDocument(proposedMarkdown)
    })

    runtime.emitMessage({
      type: 'message_update',
      message: { role: 'assistant' },
      assistantMessageEvent: { type: 'thinking_delta', delta: 'Checking. ' }
    })
    runtime.emitMessage({
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'edit',
      args: { path: 'document.md' }
    })
    runtime.emitMessage({
      type: 'tool_execution_end',
      toolCallId: 'tool-1',
      toolName: 'edit',
      result: { content: [{ type: 'text', text: 'Done' }] },
      isError: false
    })
    runtime.emitMessage({
      type: 'message_update',
      message: { role: 'assistant' },
      assistantMessageEvent: { type: 'text_delta', delta: 'Updated.' }
    })
    runtime.emitMessage({
      type: 'message_end',
      message: { role: 'assistant', usage: { input: 12, outputTokens: 4 } }
    })
    runtime.emitMessage({ type: 'agent_settled' })

    await expect(result).resolves.toBe('Updated.')
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'run-started' }),
      expect.objectContaining({ type: 'reasoning-delta', delta: 'Checking. ' }),
      expect.objectContaining({ type: 'tool-started', toolCallId: 'tool-1' }),
      expect.objectContaining({ type: 'tool-finished', toolCallId: 'tool-1', isError: false }),
      expect.objectContaining({ type: 'text-delta', delta: 'Updated.' }),
      expect.objectContaining({ type: 'run-finished', inputTokens: 12, outputTokens: 4 })
    ]))
  })

  it('routes write proposals to replaceDocument', async() => {
    const { host, scopes, runtimes } = createHarness()
    const result = host.run(runRequest(), () => {})
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))
    const runtime = runtimes[0]!

    runtime.emitMessage(extensionRequest('proposal-write', {
      v: 1,
      kind: 'proposal',
      proposalId: 'proposal-write',
      sessionId: 'session-1',
      toolCallId: 'tool-write',
      toolName: 'write',
      path: 'document.md',
      documentHandleId: 'handle-1',
      documentId: 'document-1',
      filePath: documentPath,
      baseHash: hashAgentDocument(initialMarkdown),
      originalContent: initialMarkdown,
      proposedContent: proposedMarkdown,
      proposedHash: hashAgentDocument(proposedMarkdown)
    }))
    await vi.waitFor(() => expect(scopes.replaceDocument).toHaveBeenCalledTimes(1))
    expect(scopes.replaceDocument).toHaveBeenCalledWith('scope-token', {
      handleId: 'handle-1',
      expectedRevision: 3,
      expectedHash: hashAgentDocument(initialMarkdown),
      markdown: proposedMarkdown
    })
    runtime.emitMessage({ type: 'agent_settled' })
    await expect(result).resolves.toBe('')
  })

  it('pauses Pi document changes until the user approves them', async() => {
    const { host, scopes, runtimes } = createHarness()
    const events: AiHostEvent[] = []
    const result = host.run(runRequest({ permissionMode: 'request' }), event => events.push(event))
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))
    const runtime = runtimes[0]!

    runtime.emitMessage(extensionRequest('proposal-approval', {
      v: 1,
      kind: 'proposal',
      proposalId: 'proposal-approval',
      sessionId: 'session-1',
      toolCallId: 'tool-edit',
      toolName: 'edit',
      path: 'document.md',
      documentHandleId: 'handle-1',
      documentId: 'document-1',
      filePath: documentPath,
      baseHash: hashAgentDocument(initialMarkdown),
      originalContent: initialMarkdown,
      proposedContent: proposedMarkdown,
      proposedHash: hashAgentDocument(proposedMarkdown)
    }))

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'approval-requested',
      approvalId: 'run-1:pi:proposal-approval',
      provider: 'pi',
      kind: 'edit',
      options: ['allow-once', 'deny']
    })))
    expect(scopes.editDocument).not.toHaveBeenCalled()
    await expect(host.resolveApproval('run-1', 'run-1:pi:proposal-approval', 'allow-once')).resolves.toBe(true)
    await vi.waitFor(() => expect(scopes.editDocument).toHaveBeenCalledTimes(1))
    expect(decodedResponse(runtime, 0)).toMatchObject({
      kind: 'decision',
      proposalId: 'proposal-approval',
      decision: 'accepted'
    })

    runtime.emitMessage({ type: 'agent_settled' })
    await expect(result).resolves.toBe('')
  })

  it('returns a rejected Pi decision without mutating the document', async() => {
    const { host, scopes, runtimes } = createHarness()
    const events: AiHostEvent[] = []
    const result = host.run(runRequest({ permissionMode: 'request' }), event => events.push(event))
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))
    const runtime = runtimes[0]!

    runtime.emitMessage(extensionRequest('proposal-denied', {
      v: 1,
      kind: 'proposal',
      proposalId: 'proposal-denied',
      sessionId: 'session-1',
      toolCallId: 'tool-edit',
      toolName: 'edit',
      path: 'document.md',
      documentHandleId: 'handle-1',
      documentId: 'document-1',
      filePath: documentPath,
      baseHash: hashAgentDocument(initialMarkdown),
      originalContent: initialMarkdown,
      proposedContent: proposedMarkdown,
      proposedHash: hashAgentDocument(proposedMarkdown)
    }))

    await vi.waitFor(() => expect(events.some(event => event.type === 'approval-requested')).toBe(true))
    await expect(host.resolveApproval('run-1', 'run-1:pi:proposal-denied', 'deny')).resolves.toBe(true)
    await vi.waitFor(() => expect(runtime.responses).toHaveLength(1))
    expect(scopes.editDocument).not.toHaveBeenCalled()
    expect(decodedResponse(runtime, 0)).toEqual({
      v: 1,
      kind: 'decision',
      proposalId: 'proposal-denied',
      decision: 'rejected'
    })

    runtime.emitMessage({ type: 'agent_settled' })
    await expect(result).resolves.toBe('')
  })

  it('pauses Pi bash tool calls and forwards the user decision to the adapter', async() => {
    const { host, runtimes } = createHarness()
    const events: AiHostEvent[] = []
    const result = host.run(runRequest({ permissionMode: 'request' }), event => events.push(event))
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))
    const runtime = runtimes[0]!

    runtime.emitMessage(extensionRequest('approval-bash', {
      v: 1,
      kind: 'approval',
      sessionId: 'session-1',
      toolCallId: 'tool-bash',
      toolName: 'bash',
      input: { command: 'npm test' }
    }))

    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'approval-requested',
      approvalId: 'run-1:pi-tool:tool-bash',
      provider: 'pi',
      kind: 'bash',
      command: 'npm test'
    })))
    await expect(host.resolveApproval('run-1', 'run-1:pi-tool:tool-bash', 'deny')).resolves.toBe(true)
    await vi.waitFor(() => expect(runtime.responses).toHaveLength(1))
    expect(decodedResponse(runtime, 0)).toEqual({
      v: 1,
      kind: 'approval-decision',
      decision: 'rejected'
    })

    runtime.emitMessage({ type: 'agent_settled' })
    await expect(result).resolves.toBe('')
  })

  it('fails clearly when Pi adapter v1 cannot address an unsaved virtual document', async() => {
    const unsaved = snapshot({ uri: 'annotamd://untitled/1', filePath: undefined })
    const { host, runtimes } = createHarness(unsaved)
    const result = host.run(runRequest(), () => {})
    const rejection = expect(result).rejects.toThrow(
      'Save the current document before using Pi read, edit, or write tools.'
    )
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))
    const runtime = runtimes[0]!

    runtime.emitMessage(extensionRequest('snapshot-unsaved', {
      v: 1,
      kind: 'snapshot',
      sessionId: 'session-1',
      toolCallId: 'tool-1',
      toolName: 'read',
      path: 'document.md'
    }))
    await vi.waitFor(() => expect(runtime.responses).toHaveLength(1))
    expect(runtime.responses[0]).toEqual({
      requestId: 'snapshot-unsaved',
      response: { cancelled: true }
    })
    await rejection
  })

  it('aborts and reports stopped runs', async() => {
    const { host, runtimes } = createHarness()
    const events: AiHostEvent[] = []
    const result = host.run(runRequest(), event => events.push(event))
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))

    await expect(host.stop('run-1')).resolves.toBe(true)
    await expect(result).rejects.toBeInstanceOf(AiRunStoppedError)
    expect(runtimes[0]?.abortCalls).toBe(1)
    expect(events).toContainEqual({ type: 'run-stopped', runId: 'run-1' })
  })

  it('maps Pi process failures to run-error and requires the scoped MCP token', async() => {
    const { host, runtimes } = createHarness()
    const events: AiHostEvent[] = []
    const result = host.run(runRequest(), event => events.push(event))
    await vi.waitFor(() => expect(runtimes[0]?.prompts).toHaveLength(1))
    runtimes[0]!.emitExit(new Error('Pi exited unexpectedly'))

    await expect(result).rejects.toThrow('Pi exited unexpectedly')
    expect(events).toContainEqual({
      type: 'run-error',
      runId: 'run-1',
      code: 'PI_AGENT_ERROR',
      message: 'Pi exited unexpectedly'
    })

    await expect(host.run(runRequest({ mcp: undefined }), () => {})).rejects.toThrow(
      'Pi Agent requires an AnnotaMD document scope token.'
    )
    expect(runtimes).toHaveLength(1)
  })
})
