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

  it('keeps comments and Agent mutually exclusive in one mode', () => {
    const store = useRightPaneStore()

    expect(store.mode).toBe('closed')

    store.openComments()
    expect(store.mode).toBe('comments')

    store.openAgent()
    expect(store.mode).toBe('agent')

    store.closeIf('comments')
    expect(store.mode).toBe('agent')

    store.closeIf('agent')
    expect(store.mode).toBe('closed')
  })

  it('keeps Agent available without a document while comments remain document-scoped', () => {
    const app = read('packages/desktop/src/renderer/src/pages/app.vue')
    const titleBar = read(
      'packages/desktop/src/renderer/src/components/titleBar/index.vue'
    )
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
    expect(app).toMatch(/<AgentWorkspacePanel\s+v-else-if="agentPaneActive"/)
    expect(app).toMatch(
      /commentPaneVisible\.value\s+&& rightPaneMode\.value === 'comments'/
    )
    expect(app).toMatch(
      /const agentPaneActive = computed<boolean>\(\(\) => \{\s*return init\.value && rightPaneMode\.value === 'agent'/
    )
    expect(app).toMatch(
      /watch\(rightPaneMode[\s\S]*?mode !== 'comments'[\s\S]*?setPaneVisible\(false\)/
    )
    expect(app).toMatch(
      /watch\(\[init, hasCurrentFile\][\s\S]*?rightPaneStore\.closeIf\('comments'\)[\s\S]*?setPaneVisible\(false\)/
    )
    expect(app).toContain('data-testid="empty-agent-toggle"')
    expect(app).toContain('@click="openAgentWorkspace"')
    expect(titleBar).toMatch(
      /const openAgentPane[\s\S]*?setPaneVisible\(false\)[\s\S]*?rightPaneStore\.openAgent\(\)/
    )
    expect(header).toContain("@click=\"emit('close')\"")
    expect(header).not.toContain("emit('open-comments')")
    expect(header).not.toContain('data-testid="ai-open-comments"')
    expect(panel).toContain('@new="newConversation"')
    expect(composer).toContain("@click=\"emit('send')\"")
    expect(composer).toContain("@click=\"emit('stop')\"")
    expect(app).toContain(':maximized="agentMaximized"')
    expect(app).toContain('@toggle-maximize="rightPaneStore.toggleAgentMaximized()"')
  })
})
