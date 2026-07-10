import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAnnotaMDCommentRanges } from '@/util/annotamdCommentHighlights'

const repoRoot = resolve(__dirname, '../../../../..')

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
  })
})
