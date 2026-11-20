<template>
  <aside
    class="annotamd-agent-workspace"
    :aria-label="t('annotamd.agentWorkspace.title')"
    :style="agentWorkspaceStyle"
  >
    <AgentPanelHeader
      :title="conversationTitle"
      :status="displayedStatus"
      :new-disabled="conversations.loading"
      :delete-disabled="deleteCurrentDisabled"
      @new="newConversation"
      @select-conversation="selectConversation"
      @delete-conversation="deleteConversation"
      @stop-conversation="stopConversation"
      @delete-current="deleteCurrentConversation"
      @close="emit('close')"
    />

    <section ref="timeline" class="annotamd-agent-timeline" aria-live="polite">
      <div v-if="conversations.error" class="annotamd-agent-error" role="alert">
        <span>{{ conversations.error }}</span>
        <button type="button" data-testid="ai-retry-snapshot" @click="refresh">
          {{ t('annotamd.agentWorkspace.retryDetection') }}
        </button>
      </div>

      <div v-if="setupRequired" class="annotamd-agent-setup" data-testid="ai-setup-required">
        <span aria-hidden="true"><el-icon><Setting /></el-icon></span>
        <div>
          <strong>{{ t('annotamd.agentWorkspace.setupTitle') }}</strong>
          <p>{{ t(`annotamd.agentWorkspace.setupDescription.${conversations.readiness.setupIssue ?? 'agent'}`) }}</p>
        </div>
        <button type="button" data-testid="ai-open-settings" @click="openAgentSettings">
          {{ t('annotamd.agentWorkspace.openSettings') }}
        </button>
      </div>

      <AgentMessageTimeline
        :messages="conversations.messages"
        :running="conversations.running"
        :suggestions="suggestedPrompts"
        @retry="retryMessage"
        @select-suggestion="applySuggestedPrompt"
      />

      <AgentApprovalCard
        v-for="approval in conversations.pendingApprovals"
        :key="approval.id"
        :approval="approval"
        @resolve="conversations.resolveApproval(approval.id, $event)"
      />

      <AgentChangeSetCard
        v-for="changeSet in conversations.changeSets"
        :key="changeSet.id"
        :change-set="changeSet"
        :resolving="conversations.changeSetResolvingId === changeSet.id"
        :error="conversations.changeSetErrors[changeSet.id]"
        @keep="resolveChangeSet(changeSet.id, 'keep')"
        @rollback="resolveChangeSet(changeSet.id, 'rollback')"
      />
    </section>

    <AgentComposer
      ref="composer"
      v-model="draft"
      v-model:attachments="attachments"
      :workspace-path="workspacePath"
      :runtime-model="selectedModel"
      :provider="selectedConfig?.provider"
      :selection-text="quote?.text"
      :running="conversations.running"
      :input-disabled="conversations.loading || settings.loading"
      :send-disabled="!canSend"
      @send="send"
      @stop="conversations.stop()"
      @clear-selection="quote && emit('clearSelection', quote)"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Setting } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type {
  AiAttachment,
  AiDocumentContext,
  AiDraftQuote,
  AiEffortSelection,
  AiRetryRequest,
  AiSendRequest,
  AiWorkspaceSelection
} from '@shared/types/aiWorkspace'
import { matchesAiConversationIdentity } from '@shared/types/aiConversationIdentity'
import { useAgentConversationsStore } from '@/store/agentConversations'
import { useAiSettingsStore } from '@/store/aiSettings'
import { usePreferencesStore } from '@/store/preferences'
import AgentChangeSetCard from './AgentChangeSetCard.vue'
import AgentApprovalCard from './AgentApprovalCard.vue'
import AgentComposer from './AgentComposer.vue'
import AgentMessageTimeline from './AgentMessageTimeline.vue'
import AgentPanelHeader from './AgentPanelHeader.vue'
import { isAgentTimelineNearBottom } from './agentTimelineScroll'

const props = defineProps<{
  workspacePath: string
  documentContext?: AiDocumentContext | null
  quote?: AiDraftQuote
}>()
const emit = defineEmits<{
  close: []
  clearSelection: [quote: AiDraftQuote]
}>()

const { t } = useI18n()
const conversations = useAgentConversationsStore()
const settings = useAiSettingsStore()
const preferences = usePreferencesStore()
const { agentFontSize } = storeToRefs(preferences)
const agentWorkspaceStyle = computed<Record<string, string>>(() => ({
  '--annotamd-agent-font-size': `${agentFontSize.value}px`
}))
const draft = ref('')
const composer = ref<InstanceType<typeof AgentComposer> | null>(null)
defineExpose({ focusComposer: () => composer.value?.focusInput() })
const attachments = ref<AiAttachment[]>([])
const timeline = ref<HTMLElement | null>(null)
const SUGGESTION_KEYS = [
  'reviewComments',
  'improveStructure',
  'checkLogic',
  'polishWriting',
  'proofread',
  'createSummary',
  'reviewHeadings',
  'findGaps',
  'standardizeTerms'
] as const
const suggestedPromptKeys = ref<string[]>([])

const refreshSuggestedPrompts = (): void => {
  const shuffled = [...SUGGESTION_KEYS]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  const count = Math.random() < 0.5 ? 2 : 3
  suggestedPromptKeys.value = shuffled.slice(0, count)
}

refreshSuggestedPrompts()

const suggestedPrompts = computed(() => suggestedPromptKeys.value.map(key => (
  t(`annotamd.agentWorkspace.suggestions.${key}`)
)))

const selectedConfig = computed(() => settings.selectedConfig('agent'))
const selectedModel = computed(() => settings.selectedAgentModel)
const canSend = computed(() => Boolean(
  selectedConfig.value && conversations.readiness.status === 'ready' &&
  !conversations.loading && !conversations.running
))
const setupRequired = computed(() => (
  !settings.loading && !conversations.loading &&
  (!selectedConfig.value || Boolean(conversations.readiness.setupIssue))
))
const deleteCurrentDisabled = computed(() => Boolean(
  !conversations.activeId || conversations.running ||
  conversations.changeSets.some(changeSet => changeSet.status === 'applied-unreviewed')
))
const displayedStatus = computed(() => {
  if (conversations.running) return 'running'
  if (conversations.loading || settings.loading) return 'initializing'
  if (conversations.error || settings.error) return 'error'
  if (conversations.readiness.status === 'ready' && !selectedConfig.value) return 'missing'
  return conversations.readiness.status
})
const conversationTitle = computed(() => (
  conversations.activeConversation?.title || t('annotamd.agentWorkspace.newConversationTitle')
))

const plainEffort = (effort: AiEffortSelection): AiEffortSelection => {
  switch (effort.kind) {
    case 'preset': return { kind: effort.kind, id: effort.id }
    case 'integer': return { kind: effort.kind, value: effort.value }
    case 'boolean': return { kind: effort.kind, value: effort.value }
    case 'text': return { kind: effort.kind, value: effort.value }
    default: return { kind: 'provider-default' }
  }
}

const selection = computed<AiWorkspaceSelection>(() => ({
  mode: 'agent',
  configId: settings.selections.agent.configId,
  modelId: selectedModel.value,
  effort: plainEffort(settings.selections.agent.effort),
  permissionMode: settings.selections.agent.permissionMode,
  templateIds: []
}))

const reusableConversationId = computed(() => {
  const conversation = conversations.activeConversation
  if (!conversation) return undefined
  if (conversations.messages.length === 0 && conversations.changeSets.length === 0) {
    return conversation.id
  }
  return matchesAiConversationIdentity(conversation, {
    ...selection.value,
    provider: selectedConfig.value?.provider,
    modelId: selectedModel.value,
    workspacePath: props.workspacePath
  }) ? conversation.id : undefined
})

const documentFields = (): Partial<AiSendRequest> => {
  const document = props.documentContext
  if (!document?.documentId) return {}
  return {
    documentHandleId: document.documentHandleId,
    documentId: document.documentId,
    documentUri: document.documentUri,
    filePath: document.filePath,
    markdown: document.markdown,
    documentRevision: document.revision,
    documentContentHash: document.contentHash,
    documentDirty: document.dirty
  }
}

const newConversation = async(): Promise<void> => {
  const quote = props.quote
  await conversations.create({ ...selection.value, title: t('annotamd.agentWorkspace.newConversationTitle') })
  draft.value = ''
  attachments.value = []
  if (quote) emit('clearSelection', quote)
  refreshSuggestedPrompts()
}

const applySuggestedPrompt = (prompt: string): void => {
  draft.value = prompt
}

const selectConversation = async(id: string): Promise<void> => {
  await conversations.select(id)
  const conversation = conversations.activeConversation
  if (!conversation || conversation.mode !== 'agent') return
  if (!settings.configsForMode('agent').some(config => config.id === conversation.configId)) return
  settings.selectConfig('agent', conversation.configId)
  const modelIds = settings.agentReadiness?.modelIds
  settings.selectModel('agent', !modelIds || modelIds.includes(conversation.modelId ?? '')
    ? conversation.modelId
    : undefined)
  if (conversation.effort) settings.selectEffort('agent', conversation.effort)
}

const deleteConversation = async(id: string): Promise<void> => conversations.delete(id)
const stopConversation = async(id: string): Promise<void> => conversations.stopConversation(id)
const deleteCurrentConversation = async(): Promise<void> => {
  if (conversations.activeId) await conversations.delete(conversations.activeId)
}

const send = async(): Promise<void> => {
  const text = draft.value.trim()
  if (!text || !canSend.value) return
  const pendingAttachments = attachments.value
  const quote = props.quote
  draft.value = ''
  attachments.value = []
  try {
    await conversations.send({
      ...(reusableConversationId.value ? { conversationId: reusableConversationId.value } : {}),
      text,
      selection: selection.value,
      workspacePath: props.workspacePath,
      ...(pendingAttachments.length ? { attachments: pendingAttachments } : {}),
      ...documentFields(),
      ...(quote ? { selectionText: quote.text } : {})
    })
    if (quote) emit('clearSelection', quote)
  } catch {
    if (!draft.value) draft.value = text
    if (!attachments.value.length) attachments.value = pendingAttachments
  }
}

const openAgentSettings = (): void => {
  window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent')
}

const retryMessage = async(messageId: string): Promise<void> => {
  if (!conversations.activeId || conversations.running) return
  const request: AiRetryRequest = {
    conversationId: conversations.activeId,
    messageId,
    workspacePath: props.workspacePath,
    ...documentFields()
  }
  await conversations.retry(request).catch(() => undefined)
}

const resolveChangeSet = async(id: string, action: 'keep' | 'rollback'): Promise<void> => {
  await conversations.resolveChangeSet({ changeSetId: id, action })
}

const refresh = async(): Promise<void> => {
  await Promise.all([
    settings.initialize(true),
    conversations.initialize(true)
  ])
}

watch(
  [
    () => conversations.activeId,
    () => conversations.messages.map(message => `${message.id}:${message.content.length}`).join('|'),
    () => conversations.changeSets.map(changeSet => `${changeSet.id}:${changeSet.status}`).join('|')
  ],
  async([activeId], [previousActiveId]) => {
    const shouldFollow = activeId !== previousActiveId || !timeline.value ||
      isAgentTimelineNearBottom(timeline.value)
    await nextTick()
    if (shouldFollow && timeline.value) {
      timeline.value.scrollTo({ top: timeline.value.scrollHeight })
    }
  }
)

const refreshAfterSettings = (): void => {
  void Promise.all([
    settings.initialize(true),
    conversations.initialize(true)
  ])
}

onMounted(() => {
  window.addEventListener('focus', refreshAfterSettings)
  void refresh()
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshAfterSettings)
})
</script>

<style scoped>
.annotamd-agent-workspace,
:global(.annotamd-agent-permission-menu),
:global(.annotamd-agent-model-popover),
:global(.annotamd-agent-history-popover) {
  --annotamd-surface: var(--editorBgColor);
  --annotamd-text: var(--editorColor);
  --annotamd-ink: var(--editorColor);
  --annotamd-muted: color-mix(in srgb, var(--editorColor) 78%, var(--editorBgColor));
  --annotamd-surface-soft: color-mix(in srgb, var(--editorColor) 3%, var(--editorBgColor));
  --annotamd-fill-soft: color-mix(in srgb, var(--editorColor) 7%, var(--editorBgColor));
  --annotamd-border: color-mix(in srgb, var(--editorColor) 19%, var(--editorBgColor));
  --annotamd-border-soft: color-mix(in srgb, var(--editorColor) 12%, var(--editorBgColor));
  --annotamd-agent-accent: var(--highlightThemeColor);
}

.annotamd-agent-workspace {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  padding-top: var(--titleBarHeight);
  flex-direction: column;
  color: var(--annotamd-text);
  background: var(--annotamd-surface-soft);
  user-select: text;
}

.annotamd-agent-timeline {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--annotamd-border) transparent;
}

:global(.annotamd-agent-model-popover.el-popper),
:global(.annotamd-agent-history-popover.el-popper) {
  --el-bg-color-overlay: var(--annotamd-surface);
  --el-border-color-light: var(--annotamd-border);
  --el-text-color-regular: var(--annotamd-text);
  --el-text-color-primary: var(--annotamd-text);
  border-color: var(--annotamd-border);
  border-radius: 9px;
}

:global(.annotamd-agent-model-popover .el-popper__arrow::before),
:global(.annotamd-agent-history-popover .el-popper__arrow::before) {
  border-color: var(--annotamd-border);
  background: var(--annotamd-surface);
}
.annotamd-agent-error { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 8px 9px; color: #b42318; border: 1px solid color-mix(in srgb, #ef4444 25%, var(--annotamd-border)); border-radius: 7px; background: color-mix(in srgb, #ef4444 7%, var(--annotamd-surface)); font-size: 10px; line-height: 1.45; }
.annotamd-agent-error button { flex: none; padding: 2px 5px; color: inherit; border: 0; background: transparent; cursor: pointer; text-decoration: underline; }
.annotamd-agent-setup { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: start; gap: 8px 10px; padding: 11px; border: 1px solid var(--annotamd-border); border-radius: 9px; background: var(--annotamd-surface); }
.annotamd-agent-setup > span { display: grid; width: 34px; height: 34px; grid-row: 1 / span 2; place-items: center; color: var(--annotamd-text); border-radius: 8px; background: var(--annotamd-fill-soft); }
.annotamd-agent-setup > span :deep(svg) { width: 17px; height: 17px; }
.annotamd-agent-setup > div { min-width: 0; }
.annotamd-agent-setup strong { font-size: 12px; }
.annotamd-agent-setup p { margin: 3px 0 0; color: var(--annotamd-muted); font-size: 10px; line-height: 1.45; }
.annotamd-agent-setup button { grid-column: 2; justify-self: start; min-height: 28px; padding: 0 10px; color: var(--annotamd-text); border: 1px solid var(--annotamd-border); border-radius: 6px; background: var(--annotamd-fill-soft); font-size: 11px; cursor: pointer; }
.annotamd-agent-setup button:focus-visible, .annotamd-agent-error button:focus-visible { outline: 2px solid var(--annotamd-agent-accent); outline-offset: 2px; }
</style>
