import type {
  AgentDocumentTransactionBridgeRequest,
  AgentDocumentTransactionBridgeResponse,
  AgentDocumentTransactionResult
} from '@shared/types/agentDocumentTransactions'
import { dispatchAgentDocumentTransaction } from '../editorWithTabs/agentDocumentTransaction'

type DispatchTransaction = typeof dispatchAgentDocumentTransaction

export interface AgentDocumentTransactionIpcOptions {
  editorAvailable: () => boolean
  dispatch?: DispatchTransaction
  respond?: (response: AgentDocumentTransactionBridgeResponse) => void
}

const isBridgeRequest = (value: unknown): value is AgentDocumentTransactionBridgeRequest => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AgentDocumentTransactionBridgeRequest>
  return typeof candidate.requestId === 'string' && Boolean(candidate.request) &&
    typeof candidate.request === 'object'
}

const failed = (message: string): AgentDocumentTransactionResult => ({
  status: 'failed',
  message
})

/**
 * Subscribe once at the app shell so a closed tab returns a deterministic
 * no-document result instead of leaving the main process waiting for a Muya
 * component that is no longer mounted.
 */
export const subscribeAgentDocumentTransactionIpc = (
  options: AgentDocumentTransactionIpcOptions
): (() => void) => {
  const dispatch = options.dispatch ?? dispatchAgentDocumentTransaction
  const respond = options.respond ?? ((response) => {
    window.electron.ipcRenderer.send(
      'annotamd::ai-workspace::document-transaction-response',
      response
    )
  })

  return window.electron.ipcRenderer.on(
    'annotamd::ai-workspace::document-transaction-request',
    async(_event, payload) => {
      if (!isBridgeRequest(payload)) return
      let result: AgentDocumentTransactionResult
      if (!options.editorAvailable()) {
        result = { status: 'stale', reason: 'no-active-document' }
      } else {
        try {
          result = await dispatch(payload.request)
        } catch (error) {
          result = failed(error instanceof Error ? error.message : String(error))
        }
      }
      respond({ requestId: payload.requestId, result })
    }
  )
}
