import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRightPaneStore } from '@/store/rightPane'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD right pane', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps the right pane scoped to comments', () => {
    const store = useRightPaneStore()

    expect(store.mode).toBe('closed')

    store.openComments()
    expect(store.mode).toBe('comments')

    store.closeIf('comments')
    expect(store.mode).toBe('closed')
  })

  it('places Agent in the left workspace while comments remain document-scoped', () => {
    const app = read('packages/desktop/src/renderer/src/pages/app.vue')
    const sideBar = read('packages/desktop/src/renderer/src/components/sideBar/index.vue')
    const panel = read(
      'packages/desktop/src/renderer/src/components/agent/AgentWorkspacePanel.vue'
    )
    const header = read(
      'packages/desktop/src/renderer/src/components/agent/AgentPanelHeader.vue'
    )
    const composer = read(
      'packages/desktop/src/renderer/src/components/agent/AgentComposer.vue'
    )

    expect(app).toContain('<AnnotaMDCommentPane v-if="commentPaneActive" />')
    expect(app).toContain(':agent-workspace-path="agentWorkspacePath"')
    expect(app).toContain(':agent-document-context="agentDocumentContext"')
    expect(sideBar).toMatch(/<AgentWorkspacePanel\s+v-else-if="rightColumn === 'agent'"/)
    expect(sideBar).toContain('window.innerWidth < DUAL_SIDE_PANE_MIN_WIDTH')
    expect(sideBar).toContain("rightPaneStore.closeIf('comments')")
    expect(app).toMatch(
      /commentPaneVisible\.value\s+&& rightPaneMode\.value === 'comments'/
    )
    expect(app).toMatch(
      /watch\(\[init, hasCurrentFile\][\s\S]*?rightColumn !== 'agent'[\s\S]*?SET_LAYOUT\(\{ rightColumn: '' \}\)/
    )
    expect(app).toMatch(
      /watch\(\[init, hasCurrentFile\][\s\S]*?rightPaneStore\.closeIf\('comments'\)[\s\S]*?setPaneVisible\(false\)/
    )
    expect(header).toContain("@click=\"emit('close')\"")
    expect(header).not.toContain("emit('open-comments')")
    expect(header).not.toContain('data-testid="ai-open-comments"')
    expect(panel).toContain('@new="newConversation"')
    expect(composer).toContain("@click=\"emit('send')\"")
    expect(composer).toContain("@click=\"emit('stop')\"")
    expect(panel).not.toContain('is-maximized')
    expect(panel).toMatch(/width:\s*100%;[^}]*height:\s*100%/s)
  })
})
