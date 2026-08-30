import { randomUUID } from 'node:crypto'
import type {
  AgentDocumentTransactionBridgeRequest,
  AgentDocumentTransactionBridgeResponse,
  AgentDocumentRendererSnapshot,
  AgentDocumentTransactionRequest,
  AgentDocumentTransactionResult,
  AgentDocumentTurnSnapshot
} from '../../shared/types/agentDocumentTransactions'
import {
  AgentDocumentScopeError,
  hashAgentDocument,
  type AgentDocumentCandidate,
  type AgentDocumentReadCandidate,
  type AgentDocumentSnapshot
} from './AgentDocumentScopeService'

export const AGENT_DOCUMENT_TRANSACTION_REQUEST_CHANNEL =
  'annotamd::ai-workspace::document-transaction-request' as const
export const AGENT_DOCUMENT_TRANSACTION_RESPONSE_CHANNEL =
  'annotamd::ai-workspace::document-transaction-response' as const

const DEFAULT_TIMEOUT_MS = 30_000

export interface AgentDocumentRendererTarget {
  id: number
  isDestroyed: () => boolean
  send: (channel: string, payload: AgentDocumentTransactionBridgeRequest) => void
}

export type ResolveAgentDocumentRendererTarget = (
  windowId: number
) => AgentDocumentRendererTarget | null

interface PendingRequest {
  rendererId: number
  timer: NodeJS.Timeout
  resolve: (result: AgentDocumentTransactionResult) => void
  reject: (error: Error) => void
}

/**
 * Correlates main-process MCP mutations with the Muya transaction controller
 * that lives in the renderer. The renderer never receives the scoped MCP
 * token; it only receives the concrete transaction request for its own active
 * document.
 */
export class AgentDocumentRendererBridge {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly transactionsByRun = new Map<string, AgentDocumentTurnSnapshot>()

  constructor(
    private readonly resolveTarget: ResolveAgentDocumentRendererTarget,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async readSnapshot(candidate: AgentDocumentReadCandidate): Promise<AgentDocumentRendererSnapshot> {
    const result = await this.request(candidate.windowId, {
      action: 'read',
      sessionId: candidate.conversationId,
      turnId: candidate.turnId,
      documentHandleId: candidate.document.handleId,
      documentId: candidate.document.documentId,
      documentUri: candidate.document.uri,
      ...(candidate.document.filePath ? { filePath: candidate.document.filePath } : {})
    })
    if (result.status === 'snapshot') return result.snapshot
    const message = result.status === 'failed'
      ? result.message
      : result.status === 'stale'
        ? `The live editor rejected the Agent document read: ${result.reason}.`
        : 'The live editor did not return the Agent document snapshot.'
    throw new AgentDocumentScopeError('DOCUMENT_REVISION_CONFLICT', message)
  }

  async applyCandidate(candidate: AgentDocumentCandidate): Promise<AgentDocumentSnapshot> {
    const result = await this.request(candidate.windowId, {
      action: 'mutate',
      sessionId: candidate.conversationId,
      turnId: candidate.turnId,
      documentId: candidate.document.documentId,
      documentUri: candidate.document.uri,
      filePath: candidate.document.filePath,
      expectedMarkdown: candidate.document.markdown,
      nextMarkdown: candidate.nextMarkdown
    })

    if (result.status !== 'applied') {
      const message = result.status === 'failed'
        ? result.message
        : result.status === 'stale' || result.status === 'conflicted'
          ? `The live editor rejected the Agent mutation: ${result.reason}.`
          : 'The live editor did not apply the Agent mutation.'
      throw new AgentDocumentScopeError('DOCUMENT_REVISION_CONFLICT', message)
    }

    this.transactionsByRun.set(candidate.runId, result.transaction)
    return {
      ...candidate.document,
      revision: candidate.expectedRevision + (result.changed ? 1 : 0),
      markdown: result.appliedMarkdown,
      contentHash: hashAgentDocument(result.appliedMarkdown),
      dirty: candidate.document.dirty || result.changed
    }
  }

  getRunTransaction(runId: string): AgentDocumentTurnSnapshot | undefined {
    const transaction = this.transactionsByRun.get(runId)
    return transaction
      ? {
          ...transaction,
          diff: { ...transaction.diff, lines: transaction.diff.lines.map(line => ({ ...line })) }
        }
      : undefined
  }

  forgetRun(runId: string): void {
    this.transactionsByRun.delete(runId)
  }

  request(
    windowId: number,
    request: AgentDocumentTransactionRequest
  ): Promise<AgentDocumentTransactionResult> {
    const target = this.resolveTarget(windowId)
    if (!target || target.isDestroyed()) {
      return Promise.reject(new Error('The editor window is no longer available.'))
    }
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('The editor did not respond to the Agent document mutation.'))
      }, this.timeoutMs)
      this.pending.set(requestId, {
        rendererId: target.id,
        timer,
        resolve,
        reject
      })
      target.send(AGENT_DOCUMENT_TRANSACTION_REQUEST_CHANNEL, { requestId, request })
    })
  }

  handleResponse(
    rendererId: number,
    response: AgentDocumentTransactionBridgeResponse
  ): boolean {
    const pending = this.pending.get(response.requestId)
    if (!pending || pending.rendererId !== rendererId) return false
    clearTimeout(pending.timer)
    this.pending.delete(response.requestId)
    pending.resolve(response.result)
    return true
  }

  rejectRenderer(rendererId: number): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.rendererId !== rendererId) continue
      clearTimeout(pending.timer)
      this.pending.delete(requestId)
      pending.reject(new Error('The editor window closed during the Agent document mutation.'))
    }
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('The Agent document bridge was disposed.'))
    }
    this.pending.clear()
    this.transactionsByRun.clear()
  }
}
