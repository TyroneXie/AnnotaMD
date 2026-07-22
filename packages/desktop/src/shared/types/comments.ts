export type AnnotaMDCommentScope = 'selection' | 'document'
export type AnnotaMDCommentAuthor = 'user' | 'agent'

export interface AnnotaMDCommentAnchor {
  key: string
  path?: Array<string | number>
  offset: number
}

export interface AnnotaMDCommentReplyRecord {
  id: string
  body: string
  author: AnnotaMDCommentAuthor
  createdAt: number
}

export interface AnnotaMDCommentRecord {
  id: string
  filePath: string
  scope: AnnotaMDCommentScope
  quote: string
  exactQuote?: string
  body: string
  resolved: boolean
  /** @deprecated All comments are available when the global AnnotaMD MCP service is enabled. */
  agentReadable?: boolean
  createdAt: number
  updatedAt: number
  replies: AnnotaMDCommentReplyRecord[]
  anchor?: AnnotaMDCommentAnchor
  focus?: AnnotaMDCommentAnchor
  isCrossBlock?: boolean
}

export interface AnnotaMDCommentDocument {
  documentId: string
  filePath: string
  revision: number
  comments: AnnotaMDCommentRecord[]
}

export interface AnnotaMDCommentReplaceRequest {
  filePath: string
  markdown: string
  expectedRevision: number
  comments: AnnotaMDCommentRecord[]
}

export interface AnnotaMDLegacyCommentMigration {
  filePath: string
  markdown: string
  comments: AnnotaMDCommentRecord[]
}

export interface AnnotaMDCommentMigrationResult {
  migrated: number
  skipped: number
}

export interface AnnotaMDCommentInboxItem {
  documentId: string
  filePath: string
  revision: number
  localEndingCount: number
  unresolvedCount: number
  updatedAt: number
}

export interface AnnotaMDCommentThread {
  document: AnnotaMDCommentDocument
  comment: AnnotaMDCommentRecord
}

export interface AnnotaMDAgentEditRequest {
  requestId: string
  commentId: string
  filePath: string
  replacement: string
  summary?: string
  expectedRevision: number
}

export interface AnnotaMDAgentEditResult {
  requestId: string
  success: boolean
  error?: string
}

export interface AnnotaMDMcpClientStatus {
  name: string
  version?: string
  lastSeenAt: number
  connected: boolean
}

export interface AnnotaMDMcpStatus {
  enabled: boolean
  running: boolean
  clients: AnnotaMDMcpClientStatus[]
}
