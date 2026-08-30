// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentDocumentTransactionBridgeRequest,
  AgentDocumentTransactionRequest,
  AgentDocumentTurnSnapshot
} from '../../../src/shared/types/agentDocumentTransactions'
import {
  AGENT_DOCUMENT_TRANSACTION_REQUEST_CHANNEL,
  AgentDocumentRendererBridge,
  type AgentDocumentRendererTarget
} from '../../../src/main/agentDocumentBridge/AgentDocumentRendererBridge'
import {
  hashAgentDocument,
  type AgentDocumentCandidate
} from '../../../src/main/agentDocumentBridge/AgentDocumentScopeService'

const beforeMarkdown = 'before\n'
const finalMarkdown = 'after\n'

const transaction: AgentDocumentTurnSnapshot = {
  sessionId: 'conversation-1',
  turnId: 'turn-1',
  documentId: 'document-1',
  documentUri: 'annotamd://document/document-1',
  beforeMarkdown,
  finalMarkdown,
  mutationCount: 1,
  diff: {
    additions: 1,
    deletions: 1,
    lines: [
      { kind: 'deletion', text: beforeMarkdown, beforeLine: 1 },
      { kind: 'addition', text: finalMarkdown, afterLine: 1 }
    ]
  },
  status: 'active'
}

const appliedResult = {
  status: 'applied' as const,
  transaction,
  appliedMarkdown: finalMarkdown,
  changed: true
}

const candidate: AgentDocumentCandidate = {
  windowId: 42,
  scopeToken: 'scope-1',
  conversationId: 'conversation-1',
  runId: 'run-1',
  turnId: 'turn-1',
  document: {
    handleId: 'handle-1',
    documentId: 'document-1',
    uri: 'annotamd://document/document-1',
    revision: 3,
    markdown: beforeMarkdown,
    contentHash: hashAgentDocument(beforeMarkdown),
    dirty: false
  },
  expectedRevision: 3,
  expectedHash: hashAgentDocument(beforeMarkdown),
  nextMarkdown: finalMarkdown,
  operation: 'edit'
}

const beginRequest: AgentDocumentTransactionRequest = {
  action: 'begin',
  sessionId: 'conversation-1',
  turnId: 'turn-1',
  documentId: 'document-1',
  documentUri: 'annotamd://document/document-1',
  expectedMarkdown: beforeMarkdown
}

const createTarget = (id = 7, destroyed = false) => {
  const send = vi.fn<(channel: string, payload: AgentDocumentTransactionBridgeRequest) => void>()
  const target: AgentDocumentRendererTarget = {
    id,
    isDestroyed: vi.fn(() => destroyed),
    send
  }
  return { target, send }
}

const sentRequest = (
  send: ReturnType<typeof createTarget>['send']
): AgentDocumentTransactionBridgeRequest => {
  expect(send).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledWith(
    AGENT_DOCUMENT_TRANSACTION_REQUEST_CHANNEL,
    expect.objectContaining({ request: expect.any(Object) })
  )
  return send.mock.calls[0]![1]
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AgentDocumentRendererBridge', () => {
  it('accepts a response only from the renderer that received the request', async() => {
    const { target, send } = createTarget()
    const bridge = new AgentDocumentRendererBridge(() => target)
    const pending = bridge.request(42, beginRequest)
    const envelope = sentRequest(send)

    expect(bridge.handleResponse(999, {
      requestId: envelope.requestId,
      result: appliedResult
    })).toBe(false)
    expect(bridge.handleResponse(target.id, {
      requestId: envelope.requestId,
      result: appliedResult
    })).toBe(true)
    await expect(pending).resolves.toBe(appliedResult)
    expect(bridge.handleResponse(target.id, {
      requestId: envelope.requestId,
      result: appliedResult
    })).toBe(false)

    bridge.dispose()
  })

  it('sends a mutation immediately, returns the live snapshot, and caches a defensive transaction copy', async() => {
    const { target, send } = createTarget()
    const bridge = new AgentDocumentRendererBridge((windowId) => (
      windowId === candidate.windowId ? target : null
    ))

    const pending = bridge.applyCandidate(candidate)
    const envelope = sentRequest(send)
    expect(envelope.request).toMatchObject({
      action: 'mutate',
      sessionId: candidate.conversationId,
      turnId: candidate.turnId,
      documentId: candidate.document.documentId,
      documentUri: candidate.document.uri,
      expectedMarkdown: beforeMarkdown,
      nextMarkdown: finalMarkdown
    })

    bridge.handleResponse(target.id, {
      requestId: envelope.requestId,
      result: appliedResult
    })
    await expect(pending).resolves.toEqual({
      ...candidate.document,
      revision: 4,
      markdown: finalMarkdown,
      contentHash: hashAgentDocument(finalMarkdown),
      dirty: true
    })

    const firstRead = bridge.getRunTransaction(candidate.runId)
    expect(firstRead).toEqual(transaction)
    firstRead!.diff.lines[0]!.text = 'mutated test copy'
    expect(bridge.getRunTransaction(candidate.runId)).toEqual(transaction)

    bridge.forgetRun(candidate.runId)
    expect(bridge.getRunTransaction(candidate.runId)).toBeUndefined()
    bridge.dispose()
  })

  it('reads a fresh renderer snapshot for the exact scoped document handle', async() => {
    const { target, send } = createTarget()
    const bridge = new AgentDocumentRendererBridge(() => target)
    const pending = bridge.readSnapshot({
      windowId: candidate.windowId,
      scopeToken: candidate.scopeToken,
      conversationId: candidate.conversationId,
      runId: candidate.runId,
      turnId: candidate.turnId,
      document: candidate.document
    })
    const envelope = sentRequest(send)

    expect(envelope.request).toEqual({
      action: 'read',
      sessionId: candidate.conversationId,
      turnId: candidate.turnId,
      documentHandleId: candidate.document.handleId,
      documentId: candidate.document.documentId,
      documentUri: candidate.document.uri
    })
    const snapshot = {
      documentHandleId: candidate.document.handleId,
      documentId: candidate.document.documentId,
      documentUri: candidate.document.uri,
      markdown: 'fresh renderer content\n'
    }
    bridge.handleResponse(target.id, {
      requestId: envelope.requestId,
      result: { status: 'snapshot', snapshot }
    })

    await expect(pending).resolves.toEqual(snapshot)
    bridge.dispose()
  })

  it('rejects unavailable renderers and pending work when the owning renderer disappears', async() => {
    const unavailable = new AgentDocumentRendererBridge(() => null)
    await expect(unavailable.request(42, beginRequest)).rejects.toThrow(
      'The editor window is no longer available.'
    )

    const destroyed = createTarget(7, true)
    const destroyedBridge = new AgentDocumentRendererBridge(() => destroyed.target)
    await expect(destroyedBridge.request(42, beginRequest)).rejects.toThrow(
      'The editor window is no longer available.'
    )
    expect(destroyed.send).not.toHaveBeenCalled()

    const { target, send } = createTarget()
    const bridge = new AgentDocumentRendererBridge(() => target)
    const pending = bridge.request(42, beginRequest)
    const envelope = sentRequest(send)
    bridge.rejectRenderer(target.id + 1)
    bridge.rejectRenderer(target.id)

    await expect(pending).rejects.toThrow(
      'The editor window closed during the Agent document mutation.'
    )
    expect(bridge.handleResponse(target.id, {
      requestId: envelope.requestId,
      result: appliedResult
    })).toBe(false)
    bridge.dispose()
  })

  it('times out once, clears the pending request, and rejects a late response', async() => {
    vi.useFakeTimers()
    const { target, send } = createTarget()
    const bridge = new AgentDocumentRendererBridge(() => target, 1_000)
    const pending = bridge.request(42, beginRequest)
    const rejection = expect(pending).rejects.toThrow(
      'The editor did not respond to the Agent document mutation.'
    )
    const envelope = sentRequest(send)

    await vi.advanceTimersByTimeAsync(1_000)
    await rejection
    expect(bridge.handleResponse(target.id, {
      requestId: envelope.requestId,
      result: appliedResult
    })).toBe(false)

    bridge.dispose()
  })
})
