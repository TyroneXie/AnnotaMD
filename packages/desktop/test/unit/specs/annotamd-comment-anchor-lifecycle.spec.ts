import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { editOp } from 'ot-json1'
import { useAnnotaMDCommentsStore, type AnnotaMDComment } from '@/store/annotamdComments'

const filePath = '/tmp/repeated.md'

const commentAtSecondBlock = (): AnnotaMDComment => ({
  id: 'comment-1',
  filePath,
  scope: 'selection',
  quote: 'same',
  exactQuote: 'same',
  body: '修改第二处',
  resolved: false,
  agentReadable: true,
  createdAt: 1,
  updatedAt: 1,
  replies: [],
  anchor: { key: '1/text', path: [1, 'text'], offset: 0 },
  focus: { key: '1/text', path: [1, 'text'], offset: 4 },
  isCrossBlock: false
})

beforeEach(() => {
  setActivePinia(createPinia())
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      ipcRenderer: {
        on: vi.fn(() => vi.fn()),
        invoke: vi.fn(async(channel: string, request: { comments?: AnnotaMDComment[] }) => {
          if (channel === 'mt::comments::replace') structuredClone(request)
          return {
            documentId: 'document-1',
            filePath,
            revision: 1,
            comments: request?.comments ?? []
          }
        })
      }
    }
  })
})

describe('AnnotaMD live comment anchors', () => {
  it('creates a selection comment from the captured selection', () => {
    const store = useAnnotaMDCommentsStore()
    store.markdownByFile[filePath] = 'same\n\nsame'
    store.revisionByFile[filePath] = 0
    store.setActiveSelection({
      quote: 'same',
      exactQuote: 'same',
      anchor: { key: '1/text', path: [1, 'text'], offset: 0 },
      focus: { key: '1/text', path: [1, 'text'], offset: 4 },
      isCrossBlock: false,
      capturedAt: 1
    })

    store.addSelectionComment(filePath, '修改第二处')

    expect(store.commentsByFile[filePath]).toMatchObject([{
      scope: 'selection',
      exactQuote: 'same',
      body: '修改第二处'
    }])
  })

  it('does not bind or persist when an unrelated identical quote changes', async() => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0
    const previous = [
      { name: 'paragraph', text: 'same' },
      { name: 'paragraph', text: 'same' }
    ]
    const next = [
      { name: 'paragraph', text: 'changed same' },
      { name: 'paragraph', text: 'same' }
    ]

    store.transformSelectionAnchors(
      filePath,
      editOp([0, 'text'], 'text-unicode', ['changed ']),
      previous,
      next
    )

    expect(store.commentsByFile[filePath][0].anchor?.path).toEqual([1, 'text'])
    expect(store.commentsByFile[filePath][0].focus?.path).toEqual([1, 'text'])
    await Promise.resolve()
    expect(window.electron.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'mt::comments::replace',
      expect.anything()
    )
  })

  it('coalesces repeated persistence requests to the latest state', async() => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.markdownByFile[filePath] = 'first'
    store.revisionByFile[filePath] = 0

    let releaseFirst: ((value: unknown) => void) | undefined
    let revision = 0
    const invoke = vi.mocked(window.electron.ipcRenderer.invoke)
    invoke.mockImplementation((channel: string, request: { comments?: AnnotaMDComment[] }) => {
      if (channel !== 'mt::comments::replace') {
        return Promise.resolve({ comments: [], revision })
      }
      revision += 1
      const response = {
        documentId: 'document-1',
        filePath,
        revision,
        comments: request.comments ?? []
      }
      if (revision === 1) {
        return new Promise((resolve) => { releaseFirst = resolve }).then(() => response)
      }
      return Promise.resolve(response)
    })

    const pending = store.persistFile(filePath)
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    store.markdownByFile[filePath] = 'latest'
    store.persistFile(filePath)
    store.persistFile(filePath)
    expect(invoke).toHaveBeenCalledTimes(1)

    releaseFirst?.(undefined)
    await pending

    const replaceCalls = invoke.mock.calls.filter(([channel]) => (
      channel === 'mt::comments::replace'
    ))
    expect(replaceCalls).toHaveLength(2)
    expect(replaceCalls[1][1]).toMatchObject({ markdown: 'latest' })
  })

  it('removes a comment as soon as its selected visible text changes', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0

    store.removeCommentsWithChangedText(filePath, () => 'sXme')

    expect(store.commentsByFile[filePath]).toEqual([])
  })

  it('keeps the comment when only surrounding content changes', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0

    store.removeCommentsWithChangedText(filePath, () => 'same')

    expect(store.commentsByFile[filePath]).toHaveLength(1)
  })

  it('keeps an Agent-completed comment as resolved history after its text changes', async() => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.markdownByFile[filePath] = 'same\n\nupdated'
    store.revisionByFile[filePath] = 0

    await store.completeAgentEdit(filePath, 'comment-1', '已按评论修改文档。')
    store.removeCommentsWithChangedText(filePath, () => null)

    expect(store.commentsByFile[filePath]).toMatchObject([{
      id: 'comment-1',
      resolved: true,
      anchor: undefined,
      focus: undefined,
      replies: [{
        author: 'agent',
        body: '已按评论修改文档。'
      }]
    }])
  })
})
