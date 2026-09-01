import diff from 'fast-diff'
import bus from '@/bus'
import type {
  AgentDocumentDiff,
  AgentDocumentRendererSnapshot,
  AgentDocumentLineDiff,
  AgentDocumentTarget,
  AgentDocumentTransactionRequest,
  AgentDocumentTransactionResult,
  AgentDocumentTransactionStaleReason,
  AgentDocumentTurnRoute,
  AgentDocumentTurnSnapshot,
  ApplyAgentDocumentMutationRequest,
  BeginAgentDocumentTurnRequest,
  KeepAgentDocumentTurnRequest,
  ReadAgentDocumentSnapshotRequest,
  RollbackAgentDocumentTurnRequest
} from '@shared/types/agentDocumentTransactions'

export const AGENT_DOCUMENT_TRANSACTION_EVENT = 'agentDocumentTransaction'

export interface AgentDocumentTransactionEvent {
  request: AgentDocumentTransactionRequest
  resolve: (result: AgentDocumentTransactionResult) => void
}

export interface AgentDocumentEditorContext {
  flush: () => void
  getCurrentDocument: () => (AgentDocumentTarget & { documentHandleId: string }) | null
  isDirty?: () => boolean
  getMarkdown: () => string
  normalizeMarkdown: (markdown: string) => string
  getState: () => unknown
  replaceContent: (markdown: string) => boolean
  setCommentTransformSuppressed: (suppressed: boolean) => void
  remapComments: (filePath: string, previousDocument: unknown, nextDocument: unknown) => void
}

type EditorMutationResult =
  | { status: 'applied'; appliedMarkdown: string; changed: boolean }
  | { status: 'stale'; reason: AgentDocumentTransactionStaleReason }
  | { status: 'failed'; message: string }

interface TextEdit {
  start: number
  end: number
  text: string
  removedText: string
}

export type AgentDocumentRollbackPlan =
  | { status: 'ready'; markdown: string; preservedUserChanges: boolean }
  | {
    status: 'conflicted'
    reason: 'agent-user-edits-overlap' | 'rollback-content-mismatch'
  }

const turnKey = (route: AgentDocumentTurnRoute): string => (
  `${route.sessionId}\u0000${route.turnId}`
)

export const createAgentDocumentUri = (documentId: string, filePath?: string): string => {
  if (!filePath) return `annotamd://document/${encodeURIComponent(documentId)}`
  const normalizedPath = filePath.replace(/\\/g, '/')
  const encodedPath = encodeURI(normalizedPath)
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
  return normalizedPath.startsWith('/')
    ? `file://${encodedPath}`
    : `file:///${encodedPath}`
}

const splitMarkdownLines = (markdown: string): string[] => {
  const lines: string[] = []
  let start = 0
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] !== '\n') continue
    lines.push(markdown.slice(start, index + 1))
    start = index + 1
  }
  if (start < markdown.length) lines.push(markdown.slice(start))
  return lines
}

const coarseLineDiff = (before: string[], after: string[]): AgentDocumentLineDiff[] => {
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const lines: AgentDocumentLineDiff[] = []
  for (let index = 0; index < prefix; index += 1) {
    lines.push({ kind: 'context', text: before[index]!, beforeLine: index + 1, afterLine: index + 1 })
  }
  for (let index = prefix; index < before.length - suffix; index += 1) {
    lines.push({ kind: 'deletion', text: before[index]!, beforeLine: index + 1 })
  }
  for (let index = prefix; index < after.length - suffix; index += 1) {
    lines.push({ kind: 'addition', text: after[index]!, afterLine: index + 1 })
  }
  for (let offset = suffix; offset > 0; offset -= 1) {
    const beforeIndex = before.length - offset
    const afterIndex = after.length - offset
    lines.push({
      kind: 'context',
      text: before[beforeIndex]!,
      beforeLine: beforeIndex + 1,
      afterLine: afterIndex + 1
    })
  }
  return lines
}

/** Build stable, render-ready line data without depending on a UI component. */
export const buildAgentDocumentDiff = (beforeMarkdown: string, afterMarkdown: string): AgentDocumentDiff => {
  const before = splitMarkdownLines(beforeMarkdown)
  const after = splitMarkdownLines(afterMarkdown)
  const cellCount = before.length * after.length
  let lines: AgentDocumentLineDiff[]

  // A bounded LCS gives a minimal line diff for normal documents. Very large
  // products fall back to a prefix/suffix diff instead of allocating an
  // unbounded matrix in the renderer.
  if (cellCount > 4_000_000) {
    lines = coarseLineDiff(before, after)
  } else {
    const columns = after.length + 1
    const directions = new Uint8Array((before.length + 1) * columns)
    let previous = new Uint32Array(columns)
    let current = new Uint32Array(columns)

    for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex += 1) {
      current.fill(0)
      for (let afterIndex = 1; afterIndex <= after.length; afterIndex += 1) {
        const directionIndex = beforeIndex * columns + afterIndex
        if (before[beforeIndex - 1] === after[afterIndex - 1]) {
          current[afterIndex] = previous[afterIndex - 1]! + 1
          directions[directionIndex] = 1
        } else if (previous[afterIndex]! >= current[afterIndex - 1]!) {
          current[afterIndex] = previous[afterIndex]!
          directions[directionIndex] = 2
        } else {
          current[afterIndex] = current[afterIndex - 1]!
          directions[directionIndex] = 3
        }
      }
      const swap = previous
      previous = current
      current = swap
    }

    const reversed: AgentDocumentLineDiff[] = []
    let beforeIndex = before.length
    let afterIndex = after.length
    while (beforeIndex > 0 || afterIndex > 0) {
      const direction = directions[beforeIndex * columns + afterIndex]
      if (beforeIndex > 0 && afterIndex > 0 && direction === 1) {
        reversed.push({
          kind: 'context',
          text: before[beforeIndex - 1]!,
          beforeLine: beforeIndex,
          afterLine: afterIndex
        })
        beforeIndex -= 1
        afterIndex -= 1
      } else if (beforeIndex > 0 && (afterIndex === 0 || direction === 2)) {
        reversed.push({ kind: 'deletion', text: before[beforeIndex - 1]!, beforeLine: beforeIndex })
        beforeIndex -= 1
      } else {
        reversed.push({ kind: 'addition', text: after[afterIndex - 1]!, afterLine: afterIndex })
        afterIndex -= 1
      }
    }
    lines = reversed.reverse()
  }

  const orderedLines: AgentDocumentLineDiff[] = []
  let changedRun: AgentDocumentLineDiff[] = []
  const flushChangedRun = (): void => {
    orderedLines.push(
      ...changedRun.filter((line) => line.kind === 'deletion'),
      ...changedRun.filter((line) => line.kind === 'addition')
    )
    changedRun = []
  }
  for (const line of lines) {
    if (line.kind !== 'context') {
      changedRun.push(line)
      continue
    }
    flushChangedRun()
    orderedLines.push(line)
  }
  flushChangedRun()

  return {
    additions: orderedLines.filter((line) => line.kind === 'addition').length,
    deletions: orderedLines.filter((line) => line.kind === 'deletion').length,
    lines: orderedLines
  }
}

const buildTextEdits = (source: string, target: string): TextEdit[] => {
  const edits: TextEdit[] = []
  let sourceOffset = 0
  let pending: TextEdit | null = null
  const flush = (): void => {
    if (pending) edits.push(pending)
    pending = null
  }

  for (const [kind, text] of diff(source, target)) {
    if (kind === diff.EQUAL) {
      flush()
      sourceOffset += text.length
      continue
    }
    if (!pending || pending.end !== sourceOffset) {
      flush()
      pending = { start: sourceOffset, end: sourceOffset, text: '', removedText: '' }
    }
    if (kind === diff.DELETE) {
      pending.end += text.length
      pending.removedText += text
      sourceOffset += text.length
    } else {
      pending.text += text
    }
  }
  flush()
  return edits
}

const editsOverlap = (first: TextEdit, second: TextEdit): boolean => {
  const firstIsPoint = first.start === first.end
  const secondIsPoint = second.start === second.end
  if (firstIsPoint && secondIsPoint) return first.start === second.start
  if (firstIsPoint) return second.start < first.start && first.start < second.end
  if (secondIsPoint) return first.start < second.start && second.start < first.end
  return Math.max(first.start, second.start) < Math.min(first.end, second.end)
}

const mapOffsetThroughEdits = (
  offset: number,
  edits: TextEdit[],
  affinity: 'left' | 'right'
): number | null => {
  let delta = 0
  for (const edit of edits) {
    const removedLength = edit.end - edit.start
    if (edit.end < offset || (removedLength > 0 && edit.end === offset)) {
      delta += edit.text.length - removedLength
      continue
    }
    if (edit.start > offset) break
    if (removedLength === 0 && edit.start === offset) {
      if (affinity === 'right') delta += edit.text.length
      continue
    }
    if (edit.start === offset) {
      return edit.start + delta + (affinity === 'right' ? edit.text.length : 0)
    }
    if (edit.start < offset && offset < edit.end) return null
  }
  return offset + delta
}

/**
 * Preflight the inverse of before -> final against later user edits
 * final -> current. No mutation is performed until every inverse edit maps and
 * validates, which is the atomic zero-partial-write boundary.
 */
export const planAgentDocumentRollback = (
  beforeMarkdown: string,
  finalMarkdown: string,
  currentMarkdown: string
): AgentDocumentRollbackPlan => {
  if (beforeMarkdown === finalMarkdown) {
    return { status: 'ready', markdown: currentMarkdown, preservedUserChanges: currentMarkdown !== finalMarkdown }
  }
  if (currentMarkdown === finalMarkdown) {
    return { status: 'ready', markdown: beforeMarkdown, preservedUserChanges: false }
  }

  const inverseEdits = buildTextEdits(finalMarkdown, beforeMarkdown)
  const userEdits = buildTextEdits(finalMarkdown, currentMarkdown)
  if (inverseEdits.some((agentEdit) => userEdits.some((userEdit) => editsOverlap(agentEdit, userEdit)))) {
    return { status: 'conflicted', reason: 'agent-user-edits-overlap' }
  }

  const mappedEdits: TextEdit[] = []
  for (const edit of inverseEdits) {
    const start = mapOffsetThroughEdits(edit.start, userEdits, 'right')
    const end = mapOffsetThroughEdits(edit.end, userEdits, 'left')
    if (start == null || end == null || start > end || currentMarkdown.slice(start, end) !== edit.removedText) {
      return { status: 'conflicted', reason: 'rollback-content-mismatch' }
    }
    mappedEdits.push({ ...edit, start, end })
  }

  let markdown = currentMarkdown
  for (const edit of mappedEdits.sort((first, second) => second.start - first.start || second.end - first.end)) {
    markdown = `${markdown.slice(0, edit.start)}${edit.text}${markdown.slice(edit.end)}`
  }
  return { status: 'ready', markdown, preservedUserChanges: true }
}

const validateTarget = (
  target: AgentDocumentTarget,
  context: AgentDocumentEditorContext | null
): {
  current: AgentDocumentTarget & { documentHandleId: string }
  markdown: string
} | { reason: AgentDocumentTransactionStaleReason } => {
  if (!context) return { reason: 'no-active-document' }
  context.flush()
  const current = context.getCurrentDocument()
  if (!current) return { reason: 'no-active-document' }
  if (current.documentId !== target.documentId) return { reason: 'document-id-mismatch' }
  if (target.filePath !== undefined && current.filePath !== target.filePath) {
    return { reason: 'file-path-mismatch' }
  }
  if (current.documentUri !== target.documentUri) return { reason: 'document-uri-mismatch' }
  return { current, markdown: context.getMarkdown() }
}

export const replaceAgentDocumentMarkdownInEditor = (
  target: AgentDocumentTarget,
  expectedMarkdown: string,
  nextMarkdown: string,
  context: AgentDocumentEditorContext | null,
  canonicalizeCandidate = false
): EditorMutationResult => {
  const validated = validateTarget(target, context)
  if ('reason' in validated) return { status: 'stale', reason: validated.reason }

  try {
    const normalizedMarkdown = context!.normalizeMarkdown(nextMarkdown)
    if (!canonicalizeCandidate && normalizedMarkdown !== nextMarkdown) {
      return { status: 'stale', reason: 'candidate-not-canonical' }
    }
    const candidateMarkdown = canonicalizeCandidate ? normalizedMarkdown : nextMarkdown
    if (validated.markdown === candidateMarkdown) {
      return { status: 'applied', appliedMarkdown: validated.markdown, changed: false }
    }
    if (validated.markdown !== expectedMarkdown) {
      return { status: 'stale', reason: 'document-content-changed' }
    }

    const previousDocument = context!.getState()
    let changed = false
    context!.setCommentTransformSuppressed(true)
    try {
      changed = context!.replaceContent(candidateMarkdown)
    } finally {
      context!.setCommentTransformSuppressed(false)
    }
    const appliedMarkdown = context!.getMarkdown()
    if (appliedMarkdown !== candidateMarkdown) {
      return { status: 'failed', message: 'Muya did not apply the requested Markdown.' }
    }
    if (changed && validated.current.filePath) {
      context!.remapComments(validated.current.filePath, previousDocument, context!.getState())
    }
    return { status: 'applied', appliedMarkdown, changed }
  } catch (error) {
    context!.setCommentTransformSuppressed(false)
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}

const snapshotWithDiff = (
  transaction: Omit<AgentDocumentTurnSnapshot, 'diff'>
): AgentDocumentTurnSnapshot => ({
  ...transaction,
  diff: buildAgentDocumentDiff(transaction.beforeMarkdown, transaction.finalMarkdown)
})

const cloneSnapshot = (transaction: AgentDocumentTurnSnapshot): AgentDocumentTurnSnapshot => ({
  ...transaction,
  diff: {
    ...transaction.diff,
    lines: transaction.diff.lines.map((line) => ({ ...line }))
  }
})

export class AgentDocumentTurnController {
  private readonly transactions = new Map<string, AgentDocumentTurnSnapshot>()
  private readonly activeTurnByDocument = new Map<string, string>()

  handle(
    request: AgentDocumentTransactionRequest,
    context: AgentDocumentEditorContext | null
  ): AgentDocumentTransactionResult {
    try {
      switch (request.action) {
        case 'read': return this.read(request, context)
        case 'begin': return this.begin(request, context)
        case 'mutate': return this.mutate(request, context)
        case 'keep': return this.keep(request)
        case 'rollback': return this.rollback(request, context)
        case 'get': {
          const transaction = this.transactions.get(turnKey(request))
          return transaction
            ? { status: 'found', transaction: cloneSnapshot(transaction) }
            : { status: 'missing', reason: 'turn-not-found' }
        }
      }
    } catch (error) {
      return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
  }

  clear(): void {
    this.transactions.clear()
    this.activeTurnByDocument.clear()
  }

  private read(
    request: ReadAgentDocumentSnapshotRequest,
    context: AgentDocumentEditorContext | null
  ): AgentDocumentTransactionResult {
    const validated = validateTarget(request, context)
    if ('reason' in validated) return { status: 'stale', reason: validated.reason }
    if (validated.current.documentHandleId !== request.documentHandleId) {
      return { status: 'stale', reason: 'document-handle-mismatch' }
    }
    const snapshot: AgentDocumentRendererSnapshot = {
      documentHandleId: validated.current.documentHandleId,
      documentId: validated.current.documentId,
      documentUri: validated.current.documentUri,
      ...(validated.current.filePath ? { filePath: validated.current.filePath } : {}),
      markdown: validated.markdown
    }
    return { status: 'snapshot', snapshot }
  }

  private begin(
    request: BeginAgentDocumentTurnRequest,
    context: AgentDocumentEditorContext | null
  ): AgentDocumentTransactionResult {
    const key = turnKey(request)
    const existing = this.transactions.get(key)
    if (existing) {
      if (existing.status !== 'active') return { status: 'stale', reason: 'turn-not-active' }
      if (
        existing.documentId !== request.documentId ||
        existing.documentUri !== request.documentUri ||
        (request.expectedMarkdown !== undefined && existing.beforeMarkdown !== request.expectedMarkdown)
      ) {
        return { status: 'stale', reason: 'checkpoint-mismatch' }
      }
      return {
        status: 'started',
        transaction: cloneSnapshot(existing),
        documentDirty: context?.isDirty?.() ?? false
      }
    }

    const activeKey = this.activeTurnByDocument.get(request.documentUri)
    if (activeKey && activeKey !== key) return { status: 'stale', reason: 'document-turn-busy' }
    const validated = validateTarget(request, context)
    if ('reason' in validated) return { status: 'stale', reason: validated.reason }
    if (request.expectedMarkdown !== undefined && validated.markdown !== request.expectedMarkdown) {
      return { status: 'stale', reason: 'document-content-changed' }
    }

    const transaction = snapshotWithDiff({
      sessionId: request.sessionId,
      turnId: request.turnId,
      documentId: request.documentId,
      documentUri: request.documentUri,
      filePath: request.filePath,
      beforeMarkdown: validated.markdown,
      finalMarkdown: validated.markdown,
      mutationCount: 0,
      status: 'active'
    })
    this.transactions.set(key, transaction)
    this.activeTurnByDocument.set(request.documentUri, key)
    return {
      status: 'started',
      transaction: cloneSnapshot(transaction),
      documentDirty: context?.isDirty?.() ?? false
    }
  }

  private mutate(
    request: ApplyAgentDocumentMutationRequest,
    context: AgentDocumentEditorContext | null
  ): AgentDocumentTransactionResult {
    const key = turnKey(request)
    let transaction = this.transactions.get(key)
    if (!transaction) {
      const started = this.begin({ ...request, action: 'begin' }, context)
      if (started.status !== 'started') return started
      transaction = this.transactions.get(key)!
    }
    if (transaction.status !== 'active') return { status: 'stale', reason: 'turn-not-active' }
    if (
      transaction.documentId !== request.documentId ||
      transaction.documentUri !== request.documentUri ||
      transaction.filePath !== request.filePath
    ) {
      return { status: 'stale', reason: 'checkpoint-mismatch' }
    }
    const isRetryOfCurrentFinal = transaction.finalMarkdown === request.nextMarkdown
    if (!isRetryOfCurrentFinal && transaction.finalMarkdown !== request.expectedMarkdown) {
      return { status: 'stale', reason: 'checkpoint-mismatch' }
    }

    const applied = replaceAgentDocumentMarkdownInEditor(
      request,
      request.expectedMarkdown,
      request.nextMarkdown,
      context,
      request.canonicalizeCandidate
    )
    if (applied.status !== 'applied') return applied

    if (!isRetryOfCurrentFinal || applied.changed) {
      transaction = snapshotWithDiff({
        ...transaction,
        finalMarkdown: applied.appliedMarkdown,
        // A native CLI may have already written the file and the watcher may have
        // loaded the exact candidate into Muya before this transaction arrives.
        // It is still a turn mutation when it differs from the previous checkpoint.
        mutationCount: transaction.mutationCount + (!isRetryOfCurrentFinal ? 1 : 0)
      })
      this.transactions.set(key, transaction)
    }
    return { ...applied, transaction: cloneSnapshot(transaction) }
  }

  private keep(request: KeepAgentDocumentTurnRequest): AgentDocumentTransactionResult {
    const key = turnKey(request)
    const transaction = this.restoreResolutionTransaction(request)
    if (!transaction) return { status: 'missing', reason: 'turn-not-found' }
    if (transaction.status !== 'active') return { status: 'stale', reason: 'turn-not-active' }

    const kept = { ...transaction, status: 'kept' as const }
    this.transactions.set(key, kept)
    this.activeTurnByDocument.delete(transaction.documentUri)
    return { status: 'kept', transaction: cloneSnapshot(kept), changed: false }
  }

  private rollback(
    request: RollbackAgentDocumentTurnRequest,
    context: AgentDocumentEditorContext | null
  ): AgentDocumentTransactionResult {
    const key = turnKey(request)
    const transaction = this.restoreResolutionTransaction(request)
    if (!transaction) return { status: 'missing', reason: 'turn-not-found' }
    if (transaction.status !== 'active') return { status: 'stale', reason: 'turn-not-active' }

    const validated = validateTarget(transaction, context)
    if ('reason' in validated) return { status: 'stale', reason: validated.reason }
    const plan = planAgentDocumentRollback(
      transaction.beforeMarkdown,
      transaction.finalMarkdown,
      validated.markdown
    )
    if (plan.status === 'conflicted') return plan
    if (context!.normalizeMarkdown(plan.markdown) !== plan.markdown) {
      return { status: 'conflicted', reason: 'rollback-not-canonical' }
    }

    const applied = replaceAgentDocumentMarkdownInEditor(
      transaction,
      validated.markdown,
      plan.markdown,
      context
    )
    if (applied.status !== 'applied') return applied

    const rolledBack = {
      ...transaction,
      status: 'rolled-back' as const
    }
    this.transactions.set(key, rolledBack)
    this.activeTurnByDocument.delete(transaction.documentUri)
    return {
      status: 'rolled-back',
      transaction: cloneSnapshot(rolledBack),
      appliedMarkdown: applied.appliedMarkdown,
      changed: applied.changed,
      preservedUserChanges: plan.preservedUserChanges
    }
  }

  private restoreResolutionTransaction(
    request: KeepAgentDocumentTurnRequest | RollbackAgentDocumentTurnRequest
  ): AgentDocumentTurnSnapshot | undefined {
    const key = turnKey(request)
    const existing = this.transactions.get(key)
    if (existing) return existing
    const persisted = request.transaction
    if (
      !persisted ||
      persisted.sessionId !== request.sessionId ||
      persisted.turnId !== request.turnId ||
      persisted.status !== 'active'
    ) return undefined
    const activeKey = this.activeTurnByDocument.get(persisted.documentUri)
    if (activeKey && activeKey !== key) return undefined
    const { diff: _persistedDiff, ...base } = persisted
    const restored = snapshotWithDiff(base)
    this.transactions.set(key, restored)
    this.activeTurnByDocument.set(restored.documentUri, key)
    return restored
  }
}

export const dispatchAgentDocumentTransaction = (
  request: AgentDocumentTransactionRequest
): Promise<AgentDocumentTransactionResult> => new Promise((resolve) => {
  bus.emit(AGENT_DOCUMENT_TRANSACTION_EVENT, { request, resolve } satisfies AgentDocumentTransactionEvent)
})
