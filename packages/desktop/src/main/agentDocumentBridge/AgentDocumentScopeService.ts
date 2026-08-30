import { createHash, randomBytes } from 'node:crypto'
import type { AgentDocumentRendererSnapshot } from '../../shared/types/agentDocumentTransactions'
import type { AnnotaMDAgentDocumentGateway } from '../comments/AgentBridgeServer'

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
const MAX_EDITS = 100

export interface AgentDocumentSnapshot {
  handleId: string
  documentId: string
  uri: string
  filePath?: string
  workspacePath?: string
  revision: number
  markdown: string
  contentHash: string
  dirty: boolean
}

export interface AgentDocumentScopeInput {
  windowId: number
  conversationId: string
  runId: string
  turnId: string
  document?: AgentDocumentSnapshot
  selectionText?: string
}

export interface AgentDocumentCandidate {
  windowId: number
  scopeToken: string
  conversationId: string
  runId: string
  turnId: string
  document: AgentDocumentSnapshot
  expectedRevision: number
  expectedHash: string
  nextMarkdown: string
  operation: 'edit' | 'replace'
}

export type ApplyAgentDocumentCandidate = (
  candidate: AgentDocumentCandidate
) => Promise<AgentDocumentSnapshot>

export interface AgentDocumentReadCandidate {
  windowId: number
  scopeToken: string
  conversationId: string
  runId: string
  turnId: string
  document: AgentDocumentSnapshot
}

export type ReadAgentDocumentSnapshot = (
  candidate: AgentDocumentReadCandidate
) => Promise<AgentDocumentRendererSnapshot>

interface AgentDocumentScope extends AgentDocumentScopeInput {
  token: string
  createdAt: number
}

interface TextEditInput {
  oldText: string
  newText: string
  occurrence?: number
}

interface EditRange extends TextEditInput {
  start: number
  end: number
}

export class AgentDocumentScopeError extends Error {
  constructor(
    readonly code:
      | 'SCOPE_NOT_FOUND'
      | 'DOCUMENT_NOT_AVAILABLE'
      | 'DOCUMENT_BUSY'
      | 'DOCUMENT_REVISION_CONFLICT'
      | 'INVALID_EDIT'
      | 'EDIT_TARGET_NOT_FOUND'
      | 'EDIT_TARGET_AMBIGUOUS'
      | 'EDIT_TARGET_OVERLAP'
      | 'DOCUMENT_TOO_LARGE',
    message: string
  ) {
    super(message)
    this.name = 'AgentDocumentScopeError'
  }
}

export const hashAgentDocument = (markdown: string): string => (
  createHash('sha256').update(markdown, 'utf8').digest('hex')
)

const assertSnapshot = (document: AgentDocumentSnapshot): void => {
  if (Buffer.byteLength(document.markdown, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new AgentDocumentScopeError('DOCUMENT_TOO_LARGE', 'The active document is too large for an Agent turn.')
  }
  if (document.contentHash !== hashAgentDocument(document.markdown)) {
    throw new AgentDocumentScopeError('DOCUMENT_REVISION_CONFLICT', 'The document hash does not match its live content.')
  }
}

const stringValue = (params: Record<string, unknown>, key: string): string => {
  const value = params[key]
  if (typeof value !== 'string' || !value) {
    throw new AgentDocumentScopeError('INVALID_EDIT', `Missing parameter: ${key}`)
  }
  return value
}

const revisionValue = (params: Record<string, unknown>): number => {
  const value = params.expectedRevision
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new AgentDocumentScopeError('INVALID_EDIT', 'expectedRevision must be a non-negative integer.')
  }
  return value
}

const parseEdits = (params: Record<string, unknown>): TextEditInput[] => {
  const edits = params.edits
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > MAX_EDITS) {
    throw new AgentDocumentScopeError('INVALID_EDIT', `edits must contain 1-${MAX_EDITS} replacements.`)
  }
  return edits.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AgentDocumentScopeError('INVALID_EDIT', 'Each edit must be an object.')
    }
    const input = value as Record<string, unknown>
    const oldText = input.oldText
    const newText = input.newText
    const occurrence = input.occurrence
    if (typeof oldText !== 'string' || oldText.length === 0 || typeof newText !== 'string') {
      throw new AgentDocumentScopeError('INVALID_EDIT', 'Each edit requires non-empty oldText and string newText.')
    }
    if (occurrence !== undefined && (
      typeof occurrence !== 'number' || !Number.isInteger(occurrence) || occurrence < 1
    )) {
      throw new AgentDocumentScopeError('INVALID_EDIT', 'occurrence must be a positive integer.')
    }
    return { oldText, newText, ...(occurrence === undefined ? {} : { occurrence }) }
  })
}

const locateEdit = (markdown: string, edit: TextEditInput): EditRange => {
  const starts: number[] = []
  let cursor = 0
  while (cursor <= markdown.length - edit.oldText.length) {
    const start = markdown.indexOf(edit.oldText, cursor)
    if (start < 0) break
    starts.push(start)
    cursor = start + Math.max(edit.oldText.length, 1)
  }
  if (!starts.length) {
    throw new AgentDocumentScopeError('EDIT_TARGET_NOT_FOUND', 'An edit target no longer exists in the live document.')
  }
  if (edit.occurrence === undefined && starts.length !== 1) {
    throw new AgentDocumentScopeError('EDIT_TARGET_AMBIGUOUS', 'An edit target occurs more than once; provide an occurrence.')
  }
  const start = edit.occurrence === undefined ? starts[0] : starts[edit.occurrence - 1]
  if (start === undefined) {
    throw new AgentDocumentScopeError('EDIT_TARGET_NOT_FOUND', 'The requested edit occurrence does not exist.')
  }
  return { ...edit, start, end: start + edit.oldText.length }
}

export const applyExactAgentEdits = (
  markdown: string,
  edits: readonly TextEditInput[]
): string => {
  const ranges = edits.map(edit => locateEdit(markdown, edit)).sort((left, right) => left.start - right.start)
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index]!.start < ranges[index - 1]!.end) {
      throw new AgentDocumentScopeError('EDIT_TARGET_OVERLAP', 'Agent edits overlap and were not applied.')
    }
  }
  return [...ranges].reverse().reduce((content, edit) => (
    `${content.slice(0, edit.start)}${edit.newText}${content.slice(edit.end)}`
  ), markdown)
}

export class AgentDocumentScopeService implements AnnotaMDAgentDocumentGateway {
  private readonly scopes = new Map<string, AgentDocumentScope>()
  private readonly documentOwners = new Map<string, string>()

  constructor(
    private readonly applyCandidate: ApplyAgentDocumentCandidate,
    private readonly readSnapshot: ReadAgentDocumentSnapshot
  ) {}

  issueScope(input: AgentDocumentScopeInput): string {
    if (input.document) {
      assertSnapshot(input.document)
      const owner = this.documentOwners.get(input.document.documentId)
      if (owner) {
        throw new AgentDocumentScopeError('DOCUMENT_BUSY', 'This document already has an active Agent mutation turn.')
      }
    }
    const token = randomBytes(32).toString('hex')
    const scope: AgentDocumentScope = { ...input, token, createdAt: Date.now() }
    this.scopes.set(token, scope)
    if (input.document) this.documentOwners.set(input.document.documentId, token)
    return token
  }

  revokeScope(scopeToken: string): void {
    const scope = this.scopes.get(scopeToken)
    if (!scope) return
    if (scope.document && this.documentOwners.get(scope.document.documentId) === scopeToken) {
      this.documentOwners.delete(scope.document.documentId)
    }
    this.scopes.delete(scopeToken)
  }

  revokeRun(runId: string): void {
    for (const scope of this.scopes.values()) {
      if (scope.runId === runId) this.revokeScope(scope.token)
    }
  }

  getContext(scopeToken: string): unknown {
    const scope = this.requireScope(scopeToken)
    return {
      conversationId: scope.conversationId,
      runId: scope.runId,
      turnId: scope.turnId,
      document: scope.document ? this.publicDocument(scope.document, false) : null,
      selection: scope.selectionText ? { text: scope.selectionText } : null
    }
  }

  async readDocument(scopeToken: string, params: Record<string, unknown>): Promise<unknown> {
    const scope = this.requireScope(scopeToken)
    const document = this.requireDocument(scope)
    const requestedHandle = params.handleId
    if (requestedHandle !== undefined && requestedHandle !== document.handleId) {
      throw new AgentDocumentScopeError('DOCUMENT_NOT_AVAILABLE', 'The requested document is outside this Agent scope.')
    }
    const fresh = await this.readSnapshot({
      windowId: scope.windowId,
      scopeToken: scope.token,
      conversationId: scope.conversationId,
      runId: scope.runId,
      turnId: scope.turnId,
      document: { ...document }
    })
    if (
      fresh.documentHandleId !== document.handleId ||
      fresh.documentId !== document.documentId ||
      fresh.documentUri !== document.uri ||
      fresh.filePath !== document.filePath
    ) {
      throw new AgentDocumentScopeError('DOCUMENT_REVISION_CONFLICT', 'The editor returned a different document handle.')
    }
    if (Buffer.byteLength(fresh.markdown, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw new AgentDocumentScopeError('DOCUMENT_TOO_LARGE', 'The active document is too large for an Agent turn.')
    }
    const contentHash = hashAgentDocument(fresh.markdown)
    const changed = contentHash !== document.contentHash
    const updated: AgentDocumentSnapshot = {
      ...document,
      markdown: fresh.markdown,
      contentHash,
      revision: document.revision + (changed ? 1 : 0),
      dirty: document.dirty || changed
    }
    scope.document = updated
    return this.publicDocument(updated, true)
  }

  async editDocument(scopeToken: string, params: Record<string, unknown>): Promise<unknown> {
    const scope = this.requireScope(scopeToken)
    const document = this.requireMutationBase(scope, params)
    const nextMarkdown = applyExactAgentEdits(document.markdown, parseEdits(params))
    return this.apply(scope, document, nextMarkdown, 'edit')
  }

  async replaceDocument(scopeToken: string, params: Record<string, unknown>): Promise<unknown> {
    const scope = this.requireScope(scopeToken)
    const document = this.requireMutationBase(scope, params)
    const markdown = params.markdown
    if (typeof markdown !== 'string') {
      throw new AgentDocumentScopeError('INVALID_EDIT', 'markdown must be a string.')
    }
    return this.apply(scope, document, markdown, 'replace')
  }

  private requireScope(scopeToken: string): AgentDocumentScope {
    const scope = this.scopes.get(scopeToken)
    if (!scope) throw new AgentDocumentScopeError('SCOPE_NOT_FOUND', 'The Agent document scope expired.')
    return scope
  }

  private requireDocument(scope: AgentDocumentScope): AgentDocumentSnapshot {
    if (!scope.document) {
      throw new AgentDocumentScopeError('DOCUMENT_NOT_AVAILABLE', 'Open or create a document before using document tools.')
    }
    return scope.document
  }

  private requireMutationBase(
    scope: AgentDocumentScope,
    params: Record<string, unknown>
  ): AgentDocumentSnapshot {
    const document = this.requireDocument(scope)
    if (stringValue(params, 'handleId') !== document.handleId) {
      throw new AgentDocumentScopeError('DOCUMENT_NOT_AVAILABLE', 'The requested document is outside this Agent scope.')
    }
    const expectedRevision = revisionValue(params)
    const expectedHash = stringValue(params, 'expectedHash')
    if (expectedRevision !== document.revision || expectedHash !== document.contentHash) {
      throw new AgentDocumentScopeError('DOCUMENT_REVISION_CONFLICT', 'The live document changed; read it again before editing.')
    }
    return document
  }

  private async apply(
    scope: AgentDocumentScope,
    document: AgentDocumentSnapshot,
    nextMarkdown: string,
    operation: AgentDocumentCandidate['operation']
  ): Promise<unknown> {
    if (Buffer.byteLength(nextMarkdown, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw new AgentDocumentScopeError('DOCUMENT_TOO_LARGE', 'The proposed document is too large.')
    }
    const updated = await this.applyCandidate({
      windowId: scope.windowId,
      scopeToken: scope.token,
      conversationId: scope.conversationId,
      runId: scope.runId,
      turnId: scope.turnId,
      document: { ...document },
      expectedRevision: document.revision,
      expectedHash: document.contentHash,
      nextMarkdown,
      operation
    })
    assertSnapshot(updated)
    if (updated.documentId !== document.documentId || updated.handleId !== document.handleId) {
      throw new AgentDocumentScopeError('DOCUMENT_REVISION_CONFLICT', 'The editor returned a different document handle.')
    }
    scope.document = { ...updated }
    return this.publicDocument(updated, false)
  }

  private publicDocument(document: AgentDocumentSnapshot, includeMarkdown: boolean): unknown {
    return {
      handleId: document.handleId,
      documentId: document.documentId,
      uri: document.uri,
      ...(document.filePath ? { filePath: document.filePath } : {}),
      revision: document.revision,
      contentHash: document.contentHash,
      dirty: document.dirty,
      ...(includeMarkdown ? { markdown: document.markdown } : {})
    }
  }
}
