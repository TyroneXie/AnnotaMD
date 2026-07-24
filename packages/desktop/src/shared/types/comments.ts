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
  /** Kept only until the last open tab for this document is closed. */
  temporaryDetached?: boolean
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

export interface AnnotaMDCommentIndexItem {
  commentId: string
  scope: AnnotaMDCommentScope
  quotePreview: string
  anchor?: AnnotaMDCommentAnchor
  focus?: AnnotaMDCommentAnchor
  isCrossBlock?: boolean
  messageCount: number
  lastAuthor: AnnotaMDCommentAuthor
  lastMessageAt: number
  lastMessagePreview: string
}

export interface AnnotaMDCommentIndex {
  filePath: string
  revision: number
  commentCount: number
  localEndingCommentCount: number
  comments: AnnotaMDCommentIndexItem[]
}

export interface AnnotaMDCommentDetails {
  filePath?: string
  revision?: number
  comments: AnnotaMDCommentRecord[]
  missingCommentIds: string[]
}

export interface AnnotaMDCommentDocumentRef {
  documentId: string
  filePath: string
  revision: number
}

export interface AnnotaMDCommentThread {
  document: AnnotaMDCommentDocumentRef
  comment: AnnotaMDCommentRecord
}

export interface AnnotaMDCommentReplyResult {
  filePath: string
  revision: number
  commentId: string
  reply: AnnotaMDCommentReplyRecord
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
