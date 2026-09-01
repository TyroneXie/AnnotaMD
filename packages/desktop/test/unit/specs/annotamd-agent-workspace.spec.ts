import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AI workspace panel', () => {
  it('renders the DBX-style chat shell and post-apply change review', () => {
    const panel = read(
      'packages/desktop/src/renderer/src/components/agent/AgentWorkspacePanel.vue'
    )
    const header = read(
      'packages/desktop/src/renderer/src/components/agent/AgentPanelHeader.vue'
    )
    const composer = read(
      'packages/desktop/src/renderer/src/components/agent/AgentComposer.vue'
    )
    const history = read(
      'packages/desktop/src/renderer/src/components/agent/AgentConversationHistory.vue'
    )
    const modelSelector = read(
      'packages/desktop/src/renderer/src/components/agent/AgentModelSelector.vue'
    )
    const changeSet = read(
      'packages/desktop/src/renderer/src/components/agent/AgentChangeSetCard.vue'
    )
    const app = read('packages/desktop/src/renderer/src/pages/app.vue')
    const editor = read('packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue')
    const commentPane = read('packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue')
    const tabs = read('packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue')
    const titleBar = read('packages/desktop/src/renderer/src/components/titleBar/index.vue')
    const preferences = read('packages/desktop/src/renderer/src/pages/preference.vue')

    expect(panel).toContain("t('annotamd.agentWorkspace.title')")
    expect(panel).toContain('data-testid="ai-retry-snapshot"')
    expect(panel).toContain(':suggestions="suggestedPrompts"')
    expect(panel).toContain('@select-suggestion="applySuggestedPrompt"')
    expect(panel).toContain('const count = Math.random() < 0.5 ? 2 : 3')
    expect(panel).toContain('refreshSuggestedPrompts()')
    expect(header).toContain('data-testid="ai-new-session"')
    expect(header).toContain('data-testid="ai-delete-current"')
    expect(header).toContain(':disabled="deleteDisabled"')
    expect(header).not.toContain('data-testid="ai-toggle-maximize"')
    expect(history).toContain('data-testid="ai-history-toggle"')
    expect(history).toContain("conversation.status === 'running'")
    expect(history).toContain("emit('stop', id)")
    expect(history).toContain('conversationAgentName(conversation)')
    expect(history).toContain('conversations.rename(id, title)')
    expect(history).toContain('annotamd.agentWorkspace.renameConversation')
    expect(history).toMatch(
      /\.annotamd-agent-history-row\.is-active \.annotamd-agent-history-select > i\s*\{[^}]*background:\s*var\(--annotamd-green\);/s
    )
    expect(composer).toContain('data-testid="ai-composer"')
    expect(composer).toContain(':disabled="inputDisabled"')
    expect(composer).toContain(':disabled="sendDisabled || !modelValue.trim()"')
    expect(composer).toContain('data-testid="ai-stop"')
    expect(composer).toContain('data-testid="ai-add-attachment"')
    expect(composer).toContain('data-testid="ai-attachment-input"')
    expect(composer).toContain('data-testid="ai-selection-context"')
    expect(panel).toContain('v-model:attachments="attachments"')
    expect(panel).toContain('attachments: pendingAttachments')
    expect(panel).toContain('@clear-selection="emit(\'clearSelection\')"')
    expect(editor).toContain("'annotamd:agent-selection-changed'")
    expect(app).toContain("window.addEventListener('annotamd:agent-selection-changed'")
    expect(app).toContain('selectionText: agentSelectionText.value')
    expect(composer).not.toContain('AgentModeSelector')
    expect(composer).not.toContain("'update:mode'")
    expect(composer).not.toContain('v-model:mode')
    expect(composer).toContain('<AgentModelSelector')
    expect(modelSelector).toContain('<AiProviderLogo')
    expect(modelSelector).toContain('selectedModel.value?.effortLevels')
    expect(modelSelector).toContain('class="annotamd-agent-provider-list"')
    expect(modelSelector).toContain('class="annotamd-agent-model-options"')
    expect(modelSelector.match(/:teleported="false"/g)).toHaveLength(2)
    expect(modelSelector).toContain('<el-option value="provider-default"')
    expect(modelSelector).not.toContain('selectedConfig && effortLevels.length > 0')
    expect(modelSelector).toContain('settings.cachedModels(configId)')
    expect(modelSelector).not.toContain('<el-option value="low"')
    expect(composer).not.toContain('AgentTemplateSelector')
    const timeline = read(
      'packages/desktop/src/renderer/src/components/agent/AgentMessageTimeline.vue'
    )
    expect(timeline).toContain('data-testid="ai-suggested-prompt"')
    expect(timeline).toContain("emit('selectSuggestion', suggestion)")
    expect(changeSet).toContain('changeSet: AiChangeSet')
    expect(changeSet).toContain('data-testid="ai-change-set-card"')
    expect(changeSet).toContain('data-testid="ai-change-set-keep"')
    expect(changeSet).toContain('data-testid="ai-change-set-rollback"')
    expect(changeSet).toContain("changeSet.transaction?.diff.lines")
    expect(changeSet).not.toContain('proposal')
    expect(panel).toContain("conversations.send({")
    expect(panel).toContain('matchesAiConversationIdentity')
    expect(panel).toContain('reusableConversationId.value')
    expect(panel).toContain("conversations.retry(request)")
    expect(panel).toContain("conversations.stopConversation")
    expect(panel).toContain("conversations.resolveChangeSet")
    expect(panel).toContain('data-testid="ai-setup-required"')
    expect(panel).toContain("'annotamd::open-setting-window', 'agent'")
    expect(panel).toContain("window.addEventListener('focus', refreshAfterSettings)")
    expect(panel).toContain('conversations.changeSets.map')
    expect(panel).not.toContain('PiProposalApplyCallback')
    expect(panel).not.toContain('installPi(')
    expect(app).not.toContain(':apply-proposal="applyPiDocumentProposal"')
    expect(app).not.toContain("import { Cpu } from '@element-plus/icons-vue'")
    expect(app).not.toContain('<svg viewBox="0 0 24 24" aria-hidden="true">')
    expect(tabs).toContain('import { ChatLineRound, Plus, Close }')
    expect(tabs).not.toContain('tab-agent-toggle')
    expect(titleBar).not.toContain('ChatLineRound')
    expect(titleBar).not.toContain('<Cpu />')
    expect(titleBar).not.toContain('<svg class="title-pane-icon"')
    const settings = read('packages/desktop/src/renderer/src/prefComponents/agent/index.vue')
    expect(settings).not.toContain('pref-ai-segmented')
    expect(settings).not.toContain('setDefaultMode')
    expect(settings).not.toContain("kind: 'api'")
    expect(settings).toContain("config.kind === 'cli'")
    expect(panel).toContain('documentContext?: AiDocumentContext | null')
    expect(panel).not.toContain('selectedProviderId')
    expect(panel).not.toContain('provider-list')
    expect(panel).not.toContain('availability.missing-adapter')
    expect(app).toContain('readRightPaneWidth')
    expect(app).toContain('writeRightPaneWidth')
    expect(app).toMatch(
      /\.annotamd-shared-scroll-source::\-webkit-scrollbar\)\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/s
    )
    expect(app).not.toMatch(
      /\.annotamd-shared-scroll-source::\-webkit-scrollbar\)\s*\{[^}]*display:\s*none;/s
    )
    expect(app).toMatch(/\.annotamd-editor-width-stable\)\s*\{[^}]*scrollbar-gutter:\s*stable;/s)
    expect(editor).toContain("container.classList.add('annotamd-editor-width-stable')")
    expect(panel).toMatch(/\.annotamd-agent-workspace\s*\{[^}]*box-sizing:\s*border-box;/s)
    expect(commentPane).toMatch(/\.annotamd-comment-pane\s*\{[^}]*box-sizing:\s*border-box;/s)
    expect(preferences).toMatch(/& \.pref-setting\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*min-width:\s*0;/s)
    expect(header).toContain('<Plus />')
    expect(header).toContain('<el-tooltip')
    expect(header).toContain('var(--annotamd-editor-tab-height, 28px)')
    expect(header).toContain('box-shadow: 0 0 9px 2px rgb(0 0 0 / 10%)')
    expect(header).not.toContain('subtitle')
  })
})
