import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import bus from '@/bus'
import {
  AGENT_DOCUMENT_TRANSACTION_EVENT,
  AgentDocumentTurnController,
  buildAgentDocumentDiff,
  createAgentDocumentUri,
  dispatchAgentDocumentTransaction,
  planAgentDocumentRollback,
  type AgentDocumentEditorContext,
  type AgentDocumentTransactionEvent
} from '@/components/editorWithTabs/agentDocumentTransaction'
import type {
  AgentDocumentTarget,
  AgentDocumentTurnRoute,
  ApplyAgentDocumentMutationRequest,
  BeginAgentDocumentTurnRequest
} from '@shared/types/agentDocumentTransactions'

const repoRoot = resolve(__dirname, '../../../../..')

const route: AgentDocumentTurnRoute = {
  sessionId: 'session-1',
  turnId: 'turn-1'
}

const savedTarget: AgentDocumentTarget = {
  documentId: 'document-1',
  documentUri: createAgentDocumentUri('document-1', '/workspace/note.md'),
  filePath: '/workspace/note.md'
}

const beginRequest = (
  expectedMarkdown: string,
  target: AgentDocumentTarget = savedTarget
): BeginAgentDocumentTurnRequest => ({
  action: 'begin',
  ...route,
  ...target,
  expectedMarkdown
})

const mutationRequest = (
  expectedMarkdown: string,
  nextMarkdown: string,
  target: AgentDocumentTarget = savedTarget
): ApplyAgentDocumentMutationRequest => ({
  action: 'mutate',
  ...route,
  ...target,
  expectedMarkdown,
  nextMarkdown
})

const createHarness = (
  initialMarkdown: string,
  target: AgentDocumentTarget = savedTarget,
  normalizeMarkdown: (markdown: string) => string = (markdown) => markdown
) => {
  let markdown = initialMarkdown
  let state: unknown = { markdown }
  const replaceContent = vi.fn((nextMarkdown: string) => {
    if (nextMarkdown === markdown) return false
    markdown = nextMarkdown
    state = { markdown }
    return true
  })
  const context: AgentDocumentEditorContext = {
    flush: vi.fn(),
    getCurrentDocument: vi.fn(() => ({ ...target, documentHandleId: target.documentId })),
    getMarkdown: vi.fn(() => markdown),
    normalizeMarkdown: vi.fn(normalizeMarkdown),
    getState: vi.fn(() => state),
    replaceContent,
    setCommentTransformSuppressed: vi.fn(),
    remapComments: vi.fn()
  }
  return {
    context,
    replaceContent,
    getMarkdown: () => markdown,
    setMarkdown: (nextMarkdown: string) => {
      markdown = nextMarkdown
      state = { markdown }
    }
  }
}

describe('Agent document turn transaction', () => {
  it('returns a fresh snapshot only for the current renderer document handle', () => {
    const harness = createHarness('fresh renderer content\n')
    const controller = new AgentDocumentTurnController()
    const request = {
      action: 'read' as const,
      ...route,
      ...savedTarget,
      documentHandleId: savedTarget.documentId
    }

    expect(controller.handle(request, harness.context)).toEqual({
      status: 'snapshot',
      snapshot: {
        ...savedTarget,
        documentHandleId: savedTarget.documentId,
        markdown: 'fresh renderer content\n'
      }
    })
    expect(harness.context.flush).toHaveBeenCalledOnce()
    expect(controller.handle(
      { ...request, documentHandleId: 'another-handle' },
      harness.context
    )).toEqual({ status: 'stale', reason: 'document-handle-mismatch' })
  })

  it('applies immediately and exactly restores the checkpoint with comment remapping', () => {
    const before = 'alpha\nbeta\n'
    const final = 'alpha\nBETA\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    expect(controller.handle(beginRequest(before), harness.context)).toMatchObject({
      status: 'started',
      transaction: { beforeMarkdown: before, finalMarkdown: before, mutationCount: 0 }
    })
    expect(controller.handle(mutationRequest(before, final), harness.context)).toMatchObject({
      status: 'applied',
      appliedMarkdown: final,
      changed: true,
      transaction: { beforeMarkdown: before, finalMarkdown: final, mutationCount: 1 }
    })
    expect(harness.getMarkdown()).toBe(final)

    expect(controller.handle({ action: 'rollback', ...route }, harness.context)).toMatchObject({
      status: 'rolled-back',
      appliedMarkdown: before,
      changed: true,
      preservedUserChanges: false
    })
    expect(harness.getMarkdown()).toBe(before)
    expect(harness.replaceContent).toHaveBeenCalledTimes(2)
    expect(harness.context.remapComments).toHaveBeenCalledTimes(2)
  })

  it('aggregates repeated mutations into one before-to-final Diff and Keep does not write again', () => {
    const before = 'alpha\nbeta\n'
    const middle = 'alpha\nBETA\n'
    const final = 'intro\nalpha\nBETA\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    controller.handle(beginRequest(before), harness.context)
    controller.handle(mutationRequest(before, middle), harness.context)
    const second = controller.handle(mutationRequest(middle, final), harness.context)

    expect(second).toMatchObject({
      status: 'applied',
      transaction: {
        beforeMarkdown: before,
        finalMarkdown: final,
        mutationCount: 2,
        diff: { additions: 2, deletions: 1 }
      }
    })
    if (second.status !== 'applied') throw new Error('Expected applied transaction')
    expect(second.transaction.diff.lines).toEqual([
      { kind: 'addition', text: 'intro\n', afterLine: 1 },
      { kind: 'context', text: 'alpha\n', beforeLine: 1, afterLine: 2 },
      { kind: 'deletion', text: 'beta\n', beforeLine: 2 },
      { kind: 'addition', text: 'BETA\n', afterLine: 3 }
    ])

    const writesBeforeKeep = harness.replaceContent.mock.calls.length
    expect(controller.handle({ action: 'keep', ...route }, harness.context)).toMatchObject({
      status: 'kept',
      changed: false,
      transaction: { beforeMarkdown: before, finalMarkdown: final, mutationCount: 2 }
    })
    expect(harness.replaceContent).toHaveBeenCalledTimes(writesBeforeKeep)
    expect(harness.getMarkdown()).toBe(final)
  })

  it('records a native CLI change even when the file watcher already loaded it into Muya', () => {
    const before = 'alpha\nbeta\n'
    const final = 'alpha\nBETA\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    controller.handle(beginRequest(before), harness.context)
    harness.setMarkdown(final)

    expect(controller.handle(mutationRequest(before, final), harness.context)).toMatchObject({
      status: 'applied',
      appliedMarkdown: final,
      changed: false,
      transaction: {
        beforeMarkdown: before,
        finalMarkdown: final,
        mutationCount: 1,
        diff: { additions: 1, deletions: 1 }
      }
    })
    expect(harness.replaceContent).not.toHaveBeenCalled()
  })

  it('restores a persisted review checkpoint after renderer restart before Keep', () => {
    const before = 'alpha\nbeta\n'
    const final = 'alpha\nBETA\n'
    const harness = createHarness(before)
    const firstController = new AgentDocumentTurnController()

    firstController.handle(beginRequest(before), harness.context)
    const applied = firstController.handle(mutationRequest(before, final), harness.context)
    if (applied.status !== 'applied') throw new Error('Expected applied transaction')

    const restartedController = new AgentDocumentTurnController()
    expect(restartedController.handle({
      action: 'keep',
      ...route,
      transaction: applied.transaction
    }, harness.context)).toMatchObject({
      status: 'kept',
      changed: false,
      transaction: { beforeMarkdown: before, finalMarkdown: final, status: 'kept' }
    })
    expect(harness.getMarkdown()).toBe(final)
  })

  it('restores a persisted review checkpoint after renderer restart before Rollback', () => {
    const before = 'alpha\nbeta\n'
    const final = 'alpha\nBETA\n'
    const harness = createHarness(before)
    const firstController = new AgentDocumentTurnController()

    firstController.handle(beginRequest(before), harness.context)
    const applied = firstController.handle(mutationRequest(before, final), harness.context)
    if (applied.status !== 'applied') throw new Error('Expected applied transaction')

    const restartedController = new AgentDocumentTurnController()
    expect(restartedController.handle({
      action: 'rollback',
      ...route,
      transaction: applied.transaction
    }, harness.context)).toMatchObject({
      status: 'rolled-back',
      appliedMarkdown: before,
      changed: true,
      preservedUserChanges: false,
      transaction: { beforeMarkdown: before, finalMarkdown: final, status: 'rolled-back' }
    })
    expect(harness.getMarkdown()).toBe(before)
  })

  it('preserves a later non-overlapping user edit while reverting the Agent edit', () => {
    const before = 'alpha\nbeta\ngamma\n'
    const final = 'alpha\nBETA\ngamma\n'
    const current = 'alpha\nBETA\ngamma user\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    controller.handle(beginRequest(before), harness.context)
    controller.handle(mutationRequest(before, final), harness.context)
    harness.setMarkdown(current)

    expect(controller.handle({ action: 'rollback', ...route }, harness.context)).toMatchObject({
      status: 'rolled-back',
      appliedMarkdown: 'alpha\nbeta\ngamma user\n',
      preservedUserChanges: true
    })
    expect(harness.getMarkdown()).toBe('alpha\nbeta\ngamma user\n')
  })

  it('returns conflicted without writing when a later user edit overlaps the Agent range', () => {
    const before = 'alpha\nbeta\ngamma\n'
    const final = 'alpha\nBETA\ngamma\n'
    const current = 'alpha\nBE-user-TA\ngamma\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    controller.handle(beginRequest(before), harness.context)
    controller.handle(mutationRequest(before, final), harness.context)
    harness.setMarkdown(current)
    const writesBeforeRollback = harness.replaceContent.mock.calls.length

    expect(controller.handle({ action: 'rollback', ...route }, harness.context)).toEqual({
      status: 'conflicted',
      reason: 'agent-user-edits-overlap'
    })
    expect(harness.replaceContent).toHaveBeenCalledTimes(writesBeforeRollback)
    expect(harness.getMarkdown()).toBe(current)
  })

  it('preflights every inverse edit so one overlap prevents all partial rollback writes', () => {
    const before = 'one\ntwo\nthree\nfour\n'
    const final = 'ONE\ntwo\nTHREE\nfour\n'
    const current = 'O-user-NE\ntwo\nTHREE\nfour user\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    controller.handle(beginRequest(before), harness.context)
    controller.handle(mutationRequest(before, final), harness.context)
    harness.setMarkdown(current)
    const writesBeforeRollback = harness.replaceContent.mock.calls.length

    expect(controller.handle({ action: 'rollback', ...route }, harness.context)).toEqual({
      status: 'conflicted',
      reason: 'agent-user-edits-overlap'
    })
    expect(harness.replaceContent).toHaveBeenCalledTimes(writesBeforeRollback)
    expect(harness.getMarkdown()).toBe(current)
    expect(harness.getMarkdown()).toContain('THREE')
  })

  it('supports an unsaved Muya buffer through a stable virtual document URI', () => {
    const target: AgentDocumentTarget = {
      documentId: 'untitled 1',
      documentUri: createAgentDocumentUri('untitled 1')
    }
    const before = 'draft\n'
    const final = 'revised draft\n'
    const harness = createHarness(before, target)
    const controller = new AgentDocumentTurnController()

    expect(target.documentUri).toBe('annotamd://document/untitled%201')
    controller.handle(beginRequest(before, target), harness.context)
    expect(controller.handle(mutationRequest(before, final, target), harness.context)).toMatchObject({
      status: 'applied',
      appliedMarkdown: final
    })
    expect(harness.context.remapComments).not.toHaveBeenCalled()
  })

  it('rejects non-canonical and stale mutations before touching Muya', () => {
    const before = 'base\n'
    const harness = createHarness(
      before,
      savedTarget,
      (markdown) => markdown === 'not canonical' ? 'not canonical\n' : markdown
    )
    const controller = new AgentDocumentTurnController()
    controller.handle(beginRequest(before), harness.context)

    expect(controller.handle(mutationRequest(before, 'not canonical'), harness.context)).toEqual({
      status: 'stale',
      reason: 'candidate-not-canonical'
    })
    expect(harness.replaceContent).not.toHaveBeenCalled()

    harness.setMarkdown('same-frame user edit\n')
    expect(controller.handle(mutationRequest(before, 'agent edit\n'), harness.context)).toEqual({
      status: 'stale',
      reason: 'document-content-changed'
    })
    expect(harness.replaceContent).not.toHaveBeenCalled()
  })

  it('canonicalizes a native CLI file candidate before applying it to Muya', () => {
    const before = 'base\n'
    const canonical = 'not canonical\n'
    const harness = createHarness(
      before,
      savedTarget,
      (markdown) => markdown === 'not canonical' ? canonical : markdown
    )
    const controller = new AgentDocumentTurnController()
    controller.handle(beginRequest(before), harness.context)

    expect(controller.handle({
      ...mutationRequest(before, 'not canonical'),
      canonicalizeCandidate: true
    }, harness.context)).toMatchObject({
      status: 'applied',
      appliedMarkdown: canonical
    })
    expect(harness.getMarkdown()).toBe(canonical)
  })

  it('revalidates live Muya content before acknowledging a retried mutation', () => {
    const before = 'base\n'
    const final = 'agent edit\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()

    controller.handle(beginRequest(before), harness.context)
    controller.handle(mutationRequest(before, final), harness.context)
    harness.setMarkdown('user continued editing\n')

    expect(controller.handle(mutationRequest(before, final), harness.context)).toEqual({
      status: 'stale',
      reason: 'document-content-changed'
    })
    expect(harness.replaceContent).toHaveBeenCalledOnce()
  })

  it('exposes pure Diff and three-way rollback planning', () => {
    expect(buildAgentDocumentDiff('one\ntwo\n', 'one\nTWO\n')).toMatchObject({
      additions: 1,
      deletions: 1
    })
    expect(planAgentDocumentRollback(
      'one\ntwo\nthree\n',
      'one\nTWO\nthree\n',
      'one\nTWO\nthree user\n'
    )).toEqual({
      status: 'ready',
      markdown: 'one\ntwo\nthree user\n',
      preservedUserChanges: true
    })
  })

  it('dispatches the typed request over the renderer bus and is wired by the live editor', async() => {
    const before = 'base\n'
    const harness = createHarness(before)
    const controller = new AgentDocumentTurnController()
    const listener = (payload: unknown): void => {
      const event = payload as AgentDocumentTransactionEvent
      event.resolve(controller.handle(event.request, harness.context))
    }
    bus.on(AGENT_DOCUMENT_TRANSACTION_EVENT, listener)

    await expect(dispatchAgentDocumentTransaction(beginRequest(before))).resolves.toMatchObject({
      status: 'started',
      transaction: { beforeMarkdown: before }
    })
    bus.off(AGENT_DOCUMENT_TRANSACTION_EVENT, listener)

    const source = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    ), 'utf8')
    expect(source).toContain(
      'bus.on(AGENT_DOCUMENT_TRANSACTION_EVENT, handleAgentDocumentTransaction)'
    )
    expect(source).toContain(
      'bus.off(AGENT_DOCUMENT_TRANSACTION_EVENT, handleAgentDocumentTransaction)'
    )
  })
})
