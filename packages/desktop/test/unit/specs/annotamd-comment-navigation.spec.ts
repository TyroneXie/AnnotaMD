import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { findAnnotaMDCommentAtPosition } from '@/util/annotamdCommentHighlights'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

const contentBlock = (path: Array<string | number>, text: string): HTMLElement => {
  const element = document.createElement('span')
  element.className = 'mu-content'
  element.textContent = text
  ;(element as HTMLElement & { __MUYA_BLOCK__?: unknown }).__MUYA_BLOCK__ = { path }
  return element
}

describe('AnnotaMD comment navigation', () => {
  it('matches a click position to the persisted selection comment', () => {
    const root = document.createElement('div')
    const content = contentBlock([0, 0], 'hello commented text')
    root.append(content)
    const text = content.firstChild as Text
    const comments = [
      {
        id: 'comment-1',
        scope: 'selection' as const,
        resolved: false,
        anchor: { key: '0/0', offset: 6 },
        focus: { key: '0/0', offset: 15 }
      }
    ]

    expect(findAnnotaMDCommentAtPosition(root, comments, text, 8)?.id).toBe('comment-1')
    expect(findAnnotaMDCommentAtPosition(root, comments, text, 2)).toBeNull()
  })

  it('opens the pane with a one-shot focus request', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined
      }
    })
    setActivePinia(createPinia())
    const store = useAnnotaMDCommentsStore()

    store.requestCommentFocus('comment-1')

    expect(store.paneVisible).toBe(true)
    expect(store.activeCommentId).toBe('comment-1')
    expect(store.commentFocusRequest?.commentId).toBe('comment-1')
  })

  it('connects highlighted text clicks to the matching comment card', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )
    const pane = read(
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    )

    expect(editor).toContain('findAnnotaMDCommentAtPosition')
    expect(editor).toContain('handleCommentHighlightHover')
    expect(editor).toContain("annotaMDCommentsStore.requestCommentFocus(comment.id)")
    expect(pane).toContain(':data-comment-id="comment.id"')
    expect(pane).toContain('commentFocusRequest')
    expect(pane).toContain('activeCommentId === comment.id')
    expect(pane).toContain("card?.scrollIntoView({ block: 'center', behavior: 'smooth' })")
  })
})
