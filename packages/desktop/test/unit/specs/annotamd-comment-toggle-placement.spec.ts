import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD comment toggle placement', () => {
  it('places the single comment toggle in the document tab bar', () => {
    const titleBar = read(
      'packages/desktop/src/renderer/src/components/titleBar/index.vue'
    )
    const tabs = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue'
    )
    const editorWithTabs = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/index.vue'
    )
    const commentPane = read(
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    )

    expect(titleBar).not.toContain('class="comment-toggle')
    expect(tabs).toContain('class="tab-comment-toggle"')
    expect(tabs).toContain('v-if="!commentPaneVisible"')
    expect(tabs).toContain('@click.stop="openCommentPane"')
    expect(editorWithTabs).toContain('<tabs :show-tabs="showTabBar" />')
    expect(editorWithTabs).not.toContain('<tabs v-show="showTabBar" />')
    expect(tabs).toContain('defineProps<{ showTabs: boolean }>()')
    expect(tabs).toContain('v-show="showTabs"')
    expect(tabs).toMatch(
      /\.tab-comment-toggle\s*\{[^}]*flex:\s*0 0 40px;[^}]*margin-left:\s*auto;[^}]*width:\s*40px;[^}]*height:\s*28px;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-pane\s*\{[^}]*top:\s*var\(--titleBarHeight\);[^}]*bottom:\s*0;/s
    )
  })

  it('opens the selection composer when the pane mounts from the inline comment action', () => {
    const commentPane = read(
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    )

    expect(commentPane).toMatch(
      /watch\(composerRequest,\s*\(request\) => \{[^}]*request\.mode === 'selection'\) openComposer\(\)[^}]*\},\s*\{ immediate: true \}\)/s
    )
    expect(commentPane).toContain('commentStore.clearComposerRequest()')
  })

  it('does not reuse a stale selection-composer request when the pane is opened normally', () => {
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

    store.requestComposer('selection')
    expect(store.composerRequest?.mode).toBe('selection')

    store.setPaneVisible(true)
    expect(store.paneVisible).toBe(true)
    expect(store.composerRequest).toBeNull()
  })

  it('does not render an agent-readable status footer on comment cards', () => {
    const commentPane = read(
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    )

    expect(commentPane).not.toContain('commentStatus(comment)')
    expect(commentPane).not.toContain('class="annotamd-comment-meta"')
  })
})
