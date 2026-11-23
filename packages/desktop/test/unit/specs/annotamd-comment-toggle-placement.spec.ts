import { readSource as readFileSync } from '../readSource'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'

vi.hoisted(() => {
  const target = globalThis as unknown as { window?: { path?: { sep: string } } }
  target.window ??= {}
  target.window.path ??= { sep: '/' }
})

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD comment toggle placement', () => {
  it('places comments at the right edge of the document tab row and Agent in the left activity bar', () => {
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
    const agentHeader = read(
      'packages/desktop/src/renderer/src/components/agent/AgentPanelHeader.vue'
    )
    const sideBar = read(
      'packages/desktop/src/renderer/src/components/sideBar/index.vue'
    )
    const sideBarHelp = read(
      'packages/desktop/src/renderer/src/components/sideBar/help.ts'
    )

    const toggleState = read(
      'packages/desktop/src/renderer/src/composables/useCommentPane.ts'
    )
    const toggleButton = read(
      'packages/desktop/src/renderer/src/components/titleBar/CommentPaneToggle.vue'
    )

    expect(toggleButton).toContain('class="comment-pane-toggle"')
    expect(toggleButton).toContain(':aria-pressed="commentPaneActive"')
    expect(toggleButton).toContain('@click.stop="toggleCommentPane"')
    expect(titleBar).not.toContain('CommentPaneToggle')
    expect(titleBar).not.toContain('tab-agent-toggle')
    expect(tabs).toContain('<CommentPaneToggle')
    expect(tabs).not.toContain('tab-comment-toggle')
    expect(toggleState).toMatch(
      /if \(commentPaneActive\.value\) \{\s*commentsStore\.setPaneVisible\(false\)\s*return\s*\}/s
    )
    expect(toggleState).toContain("layoutStore.rightColumn === 'agent'")
    expect(toggleState).toContain("layoutStore.SET_LAYOUT({ rightColumn: '' })")
    // eslint-disable-next-line no-template-curly-in-string
    expect(sideBar).toContain('`sidebar-${c.id}-toggle`')
    expect(sideBar).toContain('v-else-if="rightColumn === \'agent\'"')
    expect(sideBarHelp).toContain("id: 'agent'")
    expect(tabs).not.toContain('class="tab-agent-toggle"')
    expect(editorWithTabs).toContain('<tabs :show-tabs="showTabBar" />')
    expect(editorWithTabs).not.toContain('<tabs v-show="showTabBar" />')
    expect(tabs).toContain('defineProps<{ showTabs: boolean }>()')
    expect(tabs).toContain('v-show="showTabs"')
    expect(toggleButton).toMatch(
      /\.comment-pane-toggle\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;[^}]*border-radius:\s*7px;/s
    )
    expect(toggleButton).toMatch(/\.comment-pane-toggle\.is-active\s*\{[^}]*var\(--annotamd-green/s)
    expect(commentPane).toContain(':content="t(\'annotamd.comments.closePane\')"')
    expect(commentPane).toContain('<el-icon><Close /></el-icon>')
    expect(commentPane).not.toContain('m5 5 7 7-7 7')
    expect(commentPane).toMatch(
      /\.annotamd-comment-pane\s*\{[^}]*top:\s*calc\(var\(--titleBarHeight\) \+ 8px\);[^}]*bottom:\s*8px;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-header\s*\{[^}]*height:\s*var\(--annotamd-editor-tab-height, 40px\);[^}]*padding:\s*0 12px;/s
    )
    expect(agentHeader).toMatch(
      /\.annotamd-agent-header\s*\{[^}]*height:\s*var\(--annotamd-editor-tab-height, 40px\);[^}]*padding:\s*0 12px;[^}]*background:\s*var\(--annotamd-surface-soft\);/s
    )
    expect(agentHeader).toMatch(
      /\.annotamd-agent-title strong\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*650;[^}]*line-height:\s*20px;/s
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
    expect(store.selectionComposerOpen).toBe(true)

    store.setPaneVisible(true)
    expect(store.paneVisible).toBe(true)
    expect(store.composerRequest).toBeNull()
    expect(store.selectionComposerOpen).toBe(false)
  })

  it('locks a non-empty selection draft to its original anchor', () => {
    setActivePinia(createPinia())
    const store = useAnnotaMDCommentsStore()
    const originalSelection = {
      quote: '最初选中的整段代码',
      exactQuote: '最初选中的整段代码',
      anchor: { key: '0', path: [0], offset: 0 },
      focus: { key: '0', path: [0], offset: 9 },
      isCrossBlock: false,
      capturedAt: 1
    }
    const laterSelection = {
      quote: '后来选中的小段',
      exactQuote: '后来选中的小段',
      anchor: { key: '1', path: [1], offset: 0 },
      focus: { key: '1', path: [1], offset: 7 },
      isCrossBlock: false,
      capturedAt: 2
    }

    store.setActiveSelection(originalSelection)
    store.requestComposer('selection')
    store.setSelectionComposerHasDraft(true)
    store.setActiveSelection(laterSelection)

    expect(store.activeSelection?.quote).toBe(originalSelection.quote)

    store.setSelectionComposerHasDraft(false)
    expect(store.activeSelection?.quote).toBe(laterSelection.quote)

    store.closeSelectionComposer()
    expect(store.selectionComposerHasDraft).toBe(false)
  })

  it('does not render an agent-readable status footer on comment cards', () => {
    const commentPane = read(
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    )

    expect(commentPane).not.toContain('commentStatus(comment)')
    expect(commentPane).not.toContain('class="annotamd-comment-meta"')
  })

  it('keeps the running Agent status in the same row as the thread toggle', () => {
    const commentPane = read(
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    )

    expect(commentPane).toMatch(
      /agentTurns\.isRunning\(comment\.id\)\)"\s+class="annotamd-comment-action-row"/
    )
    expect(commentPane).toContain(
      'class="annotamd-agent-turn-status"'
    )
    expect(commentPane).not.toContain(
      '<p v-if="agentTurns.isRunning(comment.id)" class="annotamd-agent-turn-status">'
    )
  })
})
