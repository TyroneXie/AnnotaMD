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
          if (channel === 'annotamd::comments::replace') structuredClone(request)
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
      'annotamd::comments::replace',
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
      if (channel !== 'annotamd::comments::replace') {
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
      channel === 'annotamd::comments::replace'
    ))
    expect(replaceCalls).toHaveLength(2)
    expect(replaceCalls[1][1]).toMatchObject({ markdown: 'latest' })
  })

  it('keeps a comment when only part of its selected text is deleted', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0
    const previous = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'same' }
    ]
    const next = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'sme' }
    ]

    store.transformSelectionAnchors(
      filePath,
      editOp([1, 'text'], 'text-unicode', [1, { d: 'a' }]),
      previous,
      next
    )

    expect(store.commentsByFile[filePath]).toMatchObject([{
      id: 'comment-1',
      quote: 'same',
      exactQuote: 'same',
      anchor: { offset: 0 },
      focus: { offset: 3 }
    }])
  })

  it('keeps a comment when only part of its selected text is replaced', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0
    const previous = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'same' }
    ]
    const next = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'sXXe' }
    ]

    store.transformSelectionAnchors(
      filePath,
      editOp([1, 'text'], 'text-unicode', [1, { d: 'am' }, 'XX']),
      previous,
      next
    )

    expect(store.commentsByFile[filePath]).toMatchObject([{
      id: 'comment-1',
      quote: 'same',
      exactQuote: 'same',
      anchor: { offset: 0 },
      focus: { offset: 4 }
    }])
  })

  it('keeps the comment when only surrounding content changes', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0

    expect(store.commentsByFile[filePath]).toHaveLength(1)
  })

  it('includes text inserted at the end of the annotated range', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0
    const previous = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'same' }
    ]
    const next = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'same!' }
    ]

    store.transformSelectionAnchors(
      filePath,
      editOp([1, 'text'], 'text-unicode', [4, '!']),
      previous,
      next
    )
    expect(store.commentsByFile[filePath][0].anchor?.offset).toBe(0)
    expect(store.commentsByFile[filePath][0].focus?.offset).toBe(5)
    expect(store.commentsByFile[filePath][0].exactQuote).toBe('same')
  })

  it.each([
    { name: 'replaced', operation: [{ d: 'same' }, 'whole'], nextText: 'whole' },
    { name: 'deleted', operation: [{ d: 'same' }], nextText: '' }
  ])('removes a comment when its whole selected text is $name', ({ operation, nextText }) => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0
    const previous = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: 'same' }
    ]
    const next = [
      { name: 'paragraph', text: 'first' },
      { name: 'paragraph', text: nextText }
    ]

    store.transformSelectionAnchors(
      filePath,
      editOp([1, 'text'], 'text-unicode', operation),
      previous,
      next
    )

    expect(store.commentsByFile[filePath]).toEqual([])
  })

  it('keeps and expands the comment across an external partial edit', () => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0

    store.remapSelectionAnchorsBetweenDocuments(
      filePath,
      [
        { name: 'paragraph', text: 'first' },
        { name: 'paragraph', text: 'same' }
      ],
      [
        { name: 'paragraph', text: 'first' },
        { name: 'paragraph', text: 'sXXe!' }
      ]
    )

    expect(store.commentsByFile[filePath]).toMatchObject([{
      id: 'comment-1',
      exactQuote: 'same',
      anchor: { offset: 0 },
      focus: { offset: 5 }
    }])
  })

  it.each([
    { name: 'replaced', nextText: 'XYZ' },
    { name: 'deleted', nextText: '' }
  ])('removes the comment when an external edit has $name the whole selection', ({ nextText }) => {
    const store = useAnnotaMDCommentsStore()
    store.commentsByFile[filePath] = [commentAtSecondBlock()]
    store.revisionByFile[filePath] = 0

    store.remapSelectionAnchorsBetweenDocuments(
      filePath,
      [
        { name: 'paragraph', text: 'first' },
        { name: 'paragraph', text: 'same' }
      ],
      [
        { name: 'paragraph', text: 'first' },
        { name: 'paragraph', text: nextText }
      ]
    )

    expect(store.commentsByFile[filePath]).toEqual([])
  })

  it('does not keep a separate Agent-completed history path', () => {
    const store = useAnnotaMDCommentsStore()

    expect(store).not.toHaveProperty('completeAgentEdit')
    expect(store).not.toHaveProperty('toggleResolved')
  })
})
