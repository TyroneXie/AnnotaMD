import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID,
  buildAnnotaMDCommentRangeLayout,
  buildAnnotaMDCommentRanges,
  createAnnotaMDCommentTextReader,
  syncAnnotaMDCommentHighlights
} from '@/util/annotamdCommentHighlights'

const repoRoot = resolve(__dirname, '../../../../..')

afterEach(() => {
  vi.unstubAllGlobals()
})

const contentBlock = (path: Array<string | number>, text: string): HTMLElement => {
  const element = document.createElement('span')
  element.className = 'mu-content'
  element.textContent = text
  ;(element as HTMLElement & { __MUYA_BLOCK__?: unknown }).__MUYA_BLOCK__ = { path }
  return element
}

describe('AnnotaMD selection comment highlights', () => {
  it('builds a DOM range from the persisted Muya path and offsets', () => {
    const root = document.createElement('div')
    root.append(contentBlock([0, 0], 'hello commented text'))

    const ranges = buildAnnotaMDCommentRanges(root, [
      {
        scope: 'selection',
        resolved: false,
        anchor: { key: '0/0', offset: 6 },
        focus: { key: '0/0', offset: 15 }
      }
    ])

    expect(ranges).toHaveLength(1)
    expect(ranges[0].toString()).toBe('commented')
  })

  it('builds one range and exact quote across multiple content blocks', () => {
    const root = document.createElement('div')
    root.append(
      contentBlock([0, 0], 'first block'),
      contentBlock([1, 0], 'middle block'),
      contentBlock([2, 0], 'last block')
    )
    const comment = {
      scope: 'selection' as const,
      resolved: false,
      anchor: { key: '0/0', offset: 6 },
      focus: { key: '2/0', offset: 4 }
    }

    const ranges = buildAnnotaMDCommentRanges(root, [comment])
    const readText = createAnnotaMDCommentTextReader(root)

    expect(ranges).toHaveLength(1)
    expect(ranges[0].toString()).toBe('blockmiddle blocklast')
    expect(readText(comment)).toBe('blockmiddle blocklast')
  })

  it('skips resolved comments and comments whose blocks no longer exist', () => {
    const root = document.createElement('div')
    root.append(contentBlock([0, 0], 'hello commented text'))

    const ranges = buildAnnotaMDCommentRanges(root, [
      {
        scope: 'selection',
        resolved: true,
        anchor: { key: '0/0', offset: 6 },
        focus: { key: '0/0', offset: 15 }
      },
      {
        scope: 'selection',
        resolved: false,
        anchor: { key: '9/9', offset: 0 },
        focus: { key: '9/9', offset: 4 }
      }
    ])

    expect(ranges).toHaveLength(0)
  })

  it('reuses one content-block index for ranges, anchors and text reads', () => {
    const root = document.createElement('div')
    root.append(contentBlock([0, 0], 'hello commented text'))
    const comments = [
      {
        id: 'comment-1',
        scope: 'selection' as const,
        resolved: false,
        anchor: { key: '0/0', offset: 6 },
        focus: { key: '0/0', offset: 15 }
      }
    ]
    const querySelectorAll = vi.spyOn(root, 'querySelectorAll')

    const layout = buildAnnotaMDCommentRangeLayout(root, comments)

    expect(layout.ranges[0]?.toString()).toBe('commented')
    expect(layout.anchorRects).toHaveLength(1)
    expect(querySelectorAll).toHaveBeenCalledTimes(1)

    querySelectorAll.mockClear()
    const readText = createAnnotaMDCommentTextReader(root)
    expect(readText(comments[0])).toBe('commented')
    expect(readText(comments[0])).toBe('commented')
    expect(querySelectorAll).toHaveBeenCalledTimes(1)
  })

  it('positions the composer from its selection without adding a second highlight', () => {
    const root = document.createElement('div')
    root.append(contentBlock([0, 0], 'first and second'))

    const layout = buildAnnotaMDCommentRangeLayout(root, [], [{
      id: ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID,
      scope: 'selection',
      resolved: false,
      anchor: { key: '0/0', offset: 10 },
      focus: { key: '0/0', offset: 16 }
    }])

    expect(layout.ranges).toHaveLength(0)
    expect(layout.anchorRects.map(({ id }) => id)).toEqual([
      ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID
    ])
  })

  it('bridges comment underlines across inline-code padding', () => {
    const root = document.createElement('div')
    const content = contentBlock([0, 0], '')
    content.append('before ')
    const code = document.createElement('code')
    code.className = 'mu-inline-rule'
    code.textContent = 'inline'
    content.append(code, ' after')
    root.append(content)
    const HighlightClass = class {
      constructor(..._ranges: Range[]) {}
    }
    const registry = { delete: vi.fn(), set: vi.fn() }
    vi.stubGlobal('Highlight', HighlightClass)
    vi.stubGlobal('CSS', { highlights: registry })
    const comment = {
      id: 'comment-1',
      scope: 'selection' as const,
      resolved: false,
      anchor: { key: '0/0', offset: 0 },
      focus: { key: '0/0', offset: 19 }
    }
    const layout = buildAnnotaMDCommentRangeLayout(root, [comment])

    syncAnnotaMDCommentHighlights(root, [comment], null, layout)

    expect(code.classList.contains('annotamd-comment-code-bridge-start')).toBe(true)
    expect(code.classList.contains('annotamd-comment-code-bridge-end')).toBe(true)
  })

  it('keeps the browser highlight registry synced without writing markup', () => {
    const editor = readFileSync(
      resolve(repoRoot, 'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'),
      'utf8'
    )

    expect(editor).toContain('syncAnnotaMDCommentHighlights')
    expect(editor).toContain('queueAnnotaMDCommentHighlights()')
    expect(editor).toContain('clearAnnotaMDCommentHighlights()')
    expect(editor).toContain('annotaMDCommentsStore.commentsByFile')
    expect(editor).toContain('annotaMDCommentsStore.$subscribe')
    expect(editor).toMatch(
      /const refreshAnnotaMDCommentHighlights = \(\): void => \{\s*const root = getScrollContainer\(\)/s
    )
    expect(editor).toMatch(
      /::highlight\(annotamd-selection-comment\)\s*\{[^}]*background:\s*transparent;[^}]*text-decoration:\s*underline rgb\(51 112 255 \/ 85%\);/s
    )
    expect(editor).toMatch(
      /::highlight\(annotamd-active-selection-comment\)\s*\{[^}]*background:\s*rgb\(51 112 255 \/ 14%\);/s
    )
  })
})
