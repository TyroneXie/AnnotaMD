import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentDocumentTransactionBridgeRequest,
  AgentDocumentTransactionResult
} from '../../../src/shared/types/agentDocumentTransactions'
import { subscribeAgentDocumentTransactionIpc } from '@/components/agent/agentDocumentTransactionIpc'

const request: AgentDocumentTransactionBridgeRequest = {
  requestId: 'request-1',
  request: {
    action: 'begin',
    sessionId: 'conversation-1',
    turnId: 'turn-1',
    documentId: 'document-1',
    documentUri: 'annotamd://document/document-1',
    expectedMarkdown: 'before\n'
  }
}

type TransactionListener = (event: unknown, payload: unknown) => Promise<void>

const installIpc = () => {
  let listener: TransactionListener | undefined
  const stop = vi.fn()
  const on = vi.fn((_channel: string, callback: TransactionListener) => {
    listener = callback
    return stop
  })
  const send = vi.fn()
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { ipcRenderer: { on, send } }
  })
  return {
    on,
    send,
    stop,
    getListener: () => {
      if (!listener) throw new Error('Expected transaction listener')
      return listener
    }
  }
}

describe('Agent document transaction renderer IPC', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns a deterministic stale result when no Muya document is active', async() => {
    const ipc = installIpc()
    const dispatch = vi.fn()
    const unsubscribe = subscribeAgentDocumentTransactionIpc({
      editorAvailable: () => false,
      dispatch
    })

    expect(ipc.on).toHaveBeenCalledWith(
      'annotamd::ai-workspace::document-transaction-request',
      expect.any(Function)
    )
    await ipc.getListener()(null, request)

    expect(dispatch).not.toHaveBeenCalled()
    expect(ipc.send).toHaveBeenCalledWith(
      'annotamd::ai-workspace::document-transaction-response',
      {
        requestId: request.requestId,
        result: { status: 'stale', reason: 'no-active-document' }
      }
    )
    unsubscribe()
    expect(ipc.stop).toHaveBeenCalledOnce()
  })

  it('dispatches a valid bridge request and sends the exact transaction result', async() => {
    const ipc = installIpc()
    const result: AgentDocumentTransactionResult = {
      status: 'started',
      transaction: {
        sessionId: 'conversation-1',
        turnId: 'turn-1',
        documentId: 'document-1',
        documentUri: 'annotamd://document/document-1',
        beforeMarkdown: 'before\n',
        finalMarkdown: 'before\n',
        mutationCount: 0,
        diff: { additions: 0, deletions: 0, lines: [] },
        status: 'active'
      }
    }
    const dispatch = vi.fn(async() => result)
    subscribeAgentDocumentTransactionIpc({
      editorAvailable: () => true,
      dispatch
    })

    await ipc.getListener()(null, request)

    expect(dispatch).toHaveBeenCalledWith(request.request)
    expect(ipc.send).toHaveBeenCalledWith(
      'annotamd::ai-workspace::document-transaction-response',
      { requestId: request.requestId, result }
    )
  })

  it('ignores malformed envelopes and converts dispatcher failures into failed results', async() => {
    const ipc = installIpc()
    const dispatch = vi.fn(async() => {
      throw new Error('Muya transaction failed')
    })
    subscribeAgentDocumentTransactionIpc({
      editorAvailable: () => true,
      dispatch
    })
    const listener = ipc.getListener()

    await listener(null, { requestId: 42, request: null })
    expect(dispatch).not.toHaveBeenCalled()
    expect(ipc.send).not.toHaveBeenCalled()

    await listener(null, request)
    expect(ipc.send).toHaveBeenCalledWith(
      'annotamd::ai-workspace::document-transaction-response',
      {
        requestId: request.requestId,
        result: { status: 'failed', message: 'Muya transaction failed' }
      }
    )
  })
})
