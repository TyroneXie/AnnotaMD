export interface AgentDocumentTarget {
  documentId: string
  documentUri: string
  filePath?: string
}

export interface AgentDocumentTurnRoute {
  sessionId: string
  turnId: string
}

export interface AgentDocumentRendererSnapshot extends AgentDocumentTarget {
  documentHandleId: string
  markdown: string
}

export type AgentDocumentLineDiffKind = 'context' | 'addition' | 'deletion'

export interface AgentDocumentLineDiff {
  kind: AgentDocumentLineDiffKind
  text: string
  beforeLine?: number
  afterLine?: number
}

export interface AgentDocumentDiff {
  additions: number
  deletions: number
  lines: AgentDocumentLineDiff[]
}

export type AgentDocumentTurnStatus = 'active' | 'kept' | 'rolled-back'

export interface AgentDocumentTurnSnapshot extends AgentDocumentTurnRoute, AgentDocumentTarget {
  beforeMarkdown: string
  finalMarkdown: string
  mutationCount: number
  diff: AgentDocumentDiff
  status: AgentDocumentTurnStatus
}

export interface BeginAgentDocumentTurnRequest extends AgentDocumentTurnRoute, AgentDocumentTarget {
  action: 'begin'
  /** Omit when the renderer should atomically capture the current Muya document as the checkpoint. */
  expectedMarkdown?: string
}

export interface ApplyAgentDocumentMutationRequest extends AgentDocumentTurnRoute, AgentDocumentTarget {
  action: 'mutate'
  expectedMarkdown: string
  nextMarkdown: string
  /** Native CLI file writes may use valid, non-canonical Markdown syntax. */
  canonicalizeCandidate?: boolean
}

export interface ReadAgentDocumentSnapshotRequest extends AgentDocumentTurnRoute, AgentDocumentTarget {
  action: 'read'
  documentHandleId: string
}

export interface KeepAgentDocumentTurnRequest extends AgentDocumentTurnRoute {
  action: 'keep'
  /** Persisted checkpoint used to restore review state after a renderer restart. */
  transaction?: AgentDocumentTurnSnapshot
}

export interface RollbackAgentDocumentTurnRequest extends AgentDocumentTurnRoute {
  action: 'rollback'
  /** Persisted checkpoint used to restore review state after a renderer restart. */
  transaction?: AgentDocumentTurnSnapshot
}

export interface GetAgentDocumentTurnRequest extends AgentDocumentTurnRoute {
  action: 'get'
}

export type AgentDocumentTransactionRequest =
  | BeginAgentDocumentTurnRequest
  | ApplyAgentDocumentMutationRequest
  | ReadAgentDocumentSnapshotRequest
  | KeepAgentDocumentTurnRequest
  | RollbackAgentDocumentTurnRequest
  | GetAgentDocumentTurnRequest

export type AgentDocumentTransactionStaleReason =
  | 'no-active-document'
  | 'document-handle-mismatch'
  | 'document-id-mismatch'
  | 'document-uri-mismatch'
  | 'file-path-mismatch'
  | 'document-content-changed'
  | 'candidate-not-canonical'
  | 'document-turn-busy'
  | 'turn-not-active'
  | 'checkpoint-mismatch'

export type AgentDocumentRollbackConflictReason =
  | 'agent-user-edits-overlap'
  | 'rollback-content-mismatch'
  | 'rollback-not-canonical'

export type AgentDocumentTransactionResult =
  | { status: 'snapshot'; snapshot: AgentDocumentRendererSnapshot }
  | { status: 'started'; transaction: AgentDocumentTurnSnapshot; documentDirty?: boolean }
  | {
    status: 'applied'
    transaction: AgentDocumentTurnSnapshot
    appliedMarkdown: string
    changed: boolean
  }
  | { status: 'kept'; transaction: AgentDocumentTurnSnapshot; changed: false }
  | {
    status: 'rolled-back'
    transaction: AgentDocumentTurnSnapshot
    appliedMarkdown: string
    changed: boolean
    preservedUserChanges: boolean
  }
  | { status: 'found'; transaction: AgentDocumentTurnSnapshot }
  | { status: 'missing'; reason: 'turn-not-found' }
  | { status: 'stale'; reason: AgentDocumentTransactionStaleReason }
  | { status: 'conflicted'; reason: AgentDocumentRollbackConflictReason }
  | { status: 'failed'; message: string }

/** Main -> renderer request used to apply an MCP document mutation in Muya. */
export interface AgentDocumentTransactionBridgeRequest {
  requestId: string
  request: AgentDocumentTransactionRequest
}

/** Renderer -> main response for the matching transaction request. */
export interface AgentDocumentTransactionBridgeResponse {
  requestId: string
  result: AgentDocumentTransactionResult
}
