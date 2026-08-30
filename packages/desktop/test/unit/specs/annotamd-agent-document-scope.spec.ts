// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  AgentDocumentScopeError,
  AgentDocumentScopeService,
  applyExactAgentEdits,
  hashAgentDocument,
  type AgentDocumentSnapshot
} from '../../../src/main/agentDocumentBridge/AgentDocumentScopeService'

const snapshot = (markdown = 'alpha\nbeta\n'): AgentDocumentSnapshot => ({
  handleId: 'handle-1',
  documentId: 'document-1',
  uri: 'annotamd://document/document-1',
  revision: 3,
  markdown,
  contentHash: hashAgentDocument(markdown),
  dirty: true
})

const issue = (service: AgentDocumentScopeService, document = snapshot()): string => (
  service.issueScope({
    windowId: 1,
    conversationId: 'conversation-1',
    runId: 'run-1',
    turnId: 'turn-1',
    document,
    selectionText: 'beta'
  })
)

const rendererSnapshot = (document: AgentDocumentSnapshot) => ({
  documentHandleId: document.handleId,
  documentId: document.documentId,
  documentUri: document.uri,
  ...(document.filePath ? { filePath: document.filePath } : {}),
  markdown: document.markdown
})

const createService = (
  apply = vi.fn(),
  read = vi.fn(async({ document }: { document: AgentDocumentSnapshot }) => rendererSnapshot(document))
): AgentDocumentScopeService => new AgentDocumentScopeService(apply, read)

describe('Agent document scope service', () => {
  it('exposes live content only to the exact random scope', async() => {
    const read = vi.fn(async({ document }: { document: AgentDocumentSnapshot }) => rendererSnapshot(document))
    const service = createService(vi.fn(), read)
    const token = issue(service)

    expect(service.getContext(token)).toMatchObject({
      document: { handleId: 'handle-1', revision: 3 },
      selection: { text: 'beta' }
    })
    await expect(service.readDocument(token, {})).resolves.toMatchObject({
      markdown: 'alpha\nbeta\n',
      contentHash: hashAgentDocument('alpha\nbeta\n')
    })
    await expect(service.readDocument(token, {})).resolves.toMatchObject({ revision: 3 })
    await expect(service.readDocument('forged', {})).rejects.toThrowError(
      expect.objectContaining({ code: 'SCOPE_NOT_FOUND' })
    )
    await expect(service.readDocument(token, { handleId: 'outside-scope' })).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_AVAILABLE'
    })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('applies unique exact edits immediately and advances the live baseline', async() => {
    const apply = vi.fn(async(candidate) => ({
      ...candidate.document,
      revision: candidate.document.revision + 1,
      markdown: candidate.nextMarkdown,
      contentHash: hashAgentDocument(candidate.nextMarkdown)
    }))
    const service = createService(apply)
    const token = issue(service)

    await expect(service.editDocument(token, {
      handleId: 'handle-1',
      expectedRevision: 3,
      expectedHash: hashAgentDocument('alpha\nbeta\n'),
      edits: [{ oldText: 'beta', newText: 'gamma' }]
    })).resolves.toMatchObject({ revision: 4, contentHash: hashAgentDocument('alpha\ngamma\n') })

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'edit',
      nextMarkdown: 'alpha\ngamma\n'
    }))
    await expect(service.readDocument(token, {})).resolves.toMatchObject({
      markdown: 'alpha\ngamma\n',
      revision: 4
    })
  })

  it('refreshes the scoped renderer snapshot so a conflict can be reread and retried', async() => {
    let live = snapshot()
    const read = vi.fn(async() => rendererSnapshot(live))
    const apply = vi.fn(async(candidate) => {
      if (candidate.expectedHash !== live.contentHash) {
        throw new AgentDocumentScopeError(
          'DOCUMENT_REVISION_CONFLICT',
          'The live editor rejected the stale mutation.'
        )
      }
      live = {
        ...candidate.document,
        revision: candidate.expectedRevision + 1,
        markdown: candidate.nextMarkdown,
        contentHash: hashAgentDocument(candidate.nextMarkdown),
        dirty: true
      }
      return live
    })
    const service = createService(apply, read)
    const token = issue(service)

    live = {
      ...live,
      markdown: 'alpha\nuser edit\n',
      contentHash: hashAgentDocument('alpha\nuser edit\n'),
      dirty: true
    }
    await expect(service.editDocument(token, {
      handleId: 'handle-1',
      expectedRevision: 3,
      expectedHash: hashAgentDocument('alpha\nbeta\n'),
      edits: [{ oldText: 'beta', newText: 'agent edit' }]
    })).rejects.toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' })

    const refreshed = await service.readDocument(token, {}) as AgentDocumentSnapshot
    expect(refreshed).toMatchObject({
      markdown: 'alpha\nuser edit\n',
      revision: 4,
      contentHash: hashAgentDocument('alpha\nuser edit\n')
    })
    await expect(service.editDocument(token, {
      handleId: 'handle-1',
      expectedRevision: refreshed.revision,
      expectedHash: refreshed.contentHash,
      edits: [{ oldText: 'user edit', newText: 'agent edit' }]
    })).resolves.toMatchObject({
      revision: 5,
      contentHash: hashAgentDocument('alpha\nagent edit\n')
    })

    expect(read).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledTimes(2)
  })

  it('rejects stale, ambiguous, missing, and overlapping edits without calling Muya', async() => {
    const apply = vi.fn()
    const service = createService(apply)
    const token = issue(service, snapshot('same same\n'))
    const base = {
      handleId: 'handle-1',
      expectedRevision: 3,
      expectedHash: hashAgentDocument('same same\n')
    }

    await expect(service.editDocument(token, {
      ...base,
      expectedRevision: 2,
      edits: [{ oldText: 'same', newText: 'new' }]
    })).rejects.toMatchObject({ code: 'DOCUMENT_REVISION_CONFLICT' })
    await expect(service.editDocument(token, {
      ...base,
      edits: [{ oldText: 'same', newText: 'new' }]
    })).rejects.toMatchObject({ code: 'EDIT_TARGET_AMBIGUOUS' })
    await expect(service.editDocument(token, {
      ...base,
      edits: [{ oldText: 'absent', newText: 'new' }]
    })).rejects.toMatchObject({ code: 'EDIT_TARGET_NOT_FOUND' })
    expect(() => applyExactAgentEdits('abcd', [
      { oldText: 'abc', newText: 'x' },
      { oldText: 'bcd', newText: 'y' }
    ])).toThrowError(expect.objectContaining({ code: 'EDIT_TARGET_OVERLAP' }))
    expect(apply).not.toHaveBeenCalled()
  })

  it('locks one document to one mutation turn and releases it on revoke', () => {
    const service = createService()
    const token = issue(service)

    expect(() => issue(service)).toThrowError(expect.objectContaining({ code: 'DOCUMENT_BUSY' }))
    service.revokeScope(token)
    expect(() => issue(service)).not.toThrow()
  })

  it('supports no-document conversations but refuses document tools', async() => {
    const service = createService()
    const token = service.issueScope({
      windowId: 1,
      conversationId: 'conversation-1',
      runId: 'run-1',
      turnId: 'turn-1'
    })

    expect(service.getContext(token)).toMatchObject({ document: null })
    await expect(service.readDocument(token, {})).rejects.toThrow(AgentDocumentScopeError)
  })
})
