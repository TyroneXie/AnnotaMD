<template>
  <div class="annotamd-agent-message-stream">
    <div v-if="messages.length === 0" class="annotamd-agent-empty" data-testid="ai-empty-state">
      <section class="annotamd-agent-suggestions" :aria-label="t('annotamd.agentWorkspace.suggestionsTitle')">
        <span>{{ t('annotamd.agentWorkspace.suggestionsTitle') }}</span>
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          type="button"
          data-testid="ai-suggested-prompt"
          @click="emit('selectSuggestion', suggestion)"
        >
          {{ suggestion }}
        </button>
      </section>
      <div class="annotamd-agent-empty-intro">
        <span class="annotamd-agent-empty-mark" aria-hidden="true"><el-icon><Cpu /></el-icon></span>
        <strong>{{ t('annotamd.agentWorkspace.emptyTitle') }}</strong>
        <p>{{ t('annotamd.agentWorkspace.emptyDescription') }}</p>
      </div>
    </div>
    <template v-else>
      <template v-for="entry in timelineEntries" :key="entry.id">
        <section
          v-if="entry.type === 'process-group'"
          class="annotamd-agent-process-group"
          :data-status="runStatus(entry)"
          data-testid="ai-process-group"
        >
          <button
            type="button"
            class="annotamd-agent-process-group-toggle"
            :aria-expanded="processGroupExpanded(entry)"
            :aria-controls="`ai-process-group-${entry.id}`"
            data-testid="ai-process-group-toggle"
            @click="toggleProcessGroup(entry)"
          >
            <el-icon class="annotamd-agent-tool-state" :class="`is-${runStatus(entry)}`">
              <Loading v-if="runStatus(entry) === 'streaming'" />
              <CircleClose v-else-if="runStatus(entry) === 'failed'" />
              <VideoPause v-else-if="runStatus(entry) === 'cancelled'" />
              <CircleCheck v-else />
            </el-icon>
            <strong>{{ activityStatusLabel(runStatus(entry)) }}</strong>
            <span v-if="toolCount(entry.messages)">
              {{ t('annotamd.agentWorkspace.toolActivityCount', { count: toolCount(entry.messages) }) }}
            </span>
            <span v-if="activityDuration(entry.summary)">
              · {{ t('annotamd.agentWorkspace.toolActivityDuration', {
                duration: activityDuration(entry.summary)
              }) }}
            </span>
            <el-icon
              class="annotamd-agent-process-group-chevron"
              :class="{ 'is-expanded': processGroupExpanded(entry) }"
            >
              <ArrowRight />
            </el-icon>
          </button>
          <div
            v-if="processGroupExpanded(entry) && entry.items.length"
            :id="`ai-process-group-${entry.id}`"
            class="annotamd-agent-process-group-body"
            data-testid="ai-process-group-body"
          >
            <template v-for="item in entry.items" :key="item.id">
              <div
                v-if="item.type === 'activity'"
                class="annotamd-agent-tool-list"
                data-testid="ai-tool-list"
              >
                <article
                  v-for="activity in item.messages"
                  :key="activity.message.id"
                  :class="['annotamd-agent-tool-row', `is-${activity.message.status}`]"
                  data-testid="ai-tool-message"
                >
                  <div class="annotamd-agent-tool-line">
                    <el-icon class="annotamd-agent-tool-state" :class="`is-${activity.message.status}`">
                      <Loading v-if="activity.message.status === 'streaming'" />
                      <CircleCheck v-else-if="activity.message.status === 'complete'" />
                      <CircleClose v-else-if="activity.message.status === 'failed'" />
                      <VideoPause v-else />
                    </el-icon>
                    <strong>{{ toolDisplayName(activity.message.toolName) }}</strong>
                    <span>{{ toolStatusLabel(activity.message.status) }}</span>
                  </div>
                  <pre
                    v-if="activity.message.status === 'failed' && activity.message.content"
                    class="annotamd-agent-tool-error"
                  >{{ activity.message.content }}</pre>
                </article>
              </div>
              <article
                v-else
                class="annotamd-agent-process-note"
                data-testid="ai-process-message"
                :aria-label="processLabel(item.message)"
              >
                <div
                  v-for="(part, partIndex) in item.parts"
                  :key="partIndex"
                  class="annotamd-agent-process-note-content"
                >
                  <div
                    v-if="part.type === 'html'"
                    class="annotamd-agent-markdown"
                    @click="openMarkdownLink"
                    v-html="part.html"
                  />
                  <pre v-else><code>{{ part.code }}</code></pre>
                </div>
              </article>
            </template>
          </div>
          <p v-if="runError(entry.summary)" class="annotamd-agent-run-error">
            {{ runError(entry.summary) }}
          </p>
          <p v-if="entry.missingFinal" class="annotamd-agent-missing-final">
            {{ t('annotamd.agentWorkspace.missingFinalAnswer') }}
          </p>
        </section>
        <article
          v-else
          class="annotamd-agent-message"
          :class="[`is-${entry.message.role}`, `is-${entry.message.status ?? 'complete'}`]"
          :aria-label="roleLabel(entry.message.role)"
        >
          <div class="annotamd-agent-message-bubble">
            <div class="annotamd-agent-message-content">
              <template v-for="(part, partIndex) in entry.parts" :key="partIndex">
                <div
                  v-if="part.type === 'html'"
                  class="annotamd-agent-markdown"
                  data-testid="ai-markdown-content"
                  @click="openMarkdownLink"
                  v-html="part.html"
                />
                <div v-else class="annotamd-agent-code-block" data-testid="ai-code-block">
                  <div class="annotamd-agent-code-header">
                    <span>{{ part.language }}</span>
                    <button
                      type="button"
                      class="annotamd-agent-copy-action"
                      data-testid="ai-copy-code"
                      :title="t('contextMenu.copy')"
                      :aria-label="t('contextMenu.copy')"
                      @click.stop="copyContent(`code:${entry.message.id}:${partIndex}`, part.code)"
                    >
                      <el-icon>
                        <Check v-if="copiedKey === `code:${entry.message.id}:${partIndex}`" />
                        <CopyDocument v-else />
                      </el-icon>
                    </button>
                  </div>
                  <pre><code>{{ part.code }}</code></pre>
                </div>
              </template>
            </div>
            <p v-if="entry.message.status === 'failed'" class="annotamd-agent-message-error">
              {{ t('annotamd.agentWorkspace.messageFailed') }}
              <button
                type="button"
                data-testid="ai-retry-message"
                @click="emit('retry', entry.message.id)"
              >
                {{ t('annotamd.agentWorkspace.retryMessage') }}
              </button>
            </p>
          </div>
          <footer class="annotamd-agent-message-meta">
            <time :datetime="new Date(entry.message.createdAt).toISOString()">
              {{ formatMessageTime(entry.message.createdAt) }}
            </time>
            <button
              v-if="entry.message.content"
              type="button"
              class="annotamd-agent-copy-action"
              data-testid="ai-copy-message"
              :title="t('contextMenu.copy')"
              :aria-label="t('contextMenu.copy')"
              @click.stop="copyContent(`message:${entry.message.id}`, entry.message.content)"
            >
              <el-icon>
                <Check v-if="copiedKey === `message:${entry.message.id}`" />
                <CopyDocument v-else />
              </el-icon>
            </button>
          </footer>
        </article>
      </template>
    </template>
    <div v-if="running && !hasVisibleRunningState" class="annotamd-agent-thinking" role="status">
      <span /><span /><span />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  ArrowRight,
  Check,
  CircleCheck,
  CircleClose,
  CopyDocument,
  Cpu,
  Loading,
  VideoPause
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import {
  AI_REASONING_MESSAGE_TOOL,
  AI_RUN_SUMMARY_TOOL
} from '@shared/types/aiWorkspace'
import type { AiMessage, AiMessageRole, AiMessageStatus } from '@shared/types/aiWorkspace'
import { formatCommentTimestamp } from '@/util/annotamdCommentTime'
import { renderAgentMarkdown } from './agentMarkdown'

const props = defineProps<{
  messages: readonly AiMessage[]
  running: boolean
  suggestions: readonly string[]
}>()
const emit = defineEmits<{
  retry: [messageId: string]
  selectSuggestion: [suggestion: string]
}>()
const { t, locale } = useI18n()
const renderedMessages = computed(() => props.messages
  .filter(message => !(
    message.role === 'assistant' && message.status !== 'failed' && !message.content.trim()
  ))
  .map(message => ({
    message,
    parts: renderAgentMarkdown(message.content)
  })))
type RenderedMessage = (typeof renderedMessages.value)[number]
type ActivityEntry = {
  type: 'activity'
  id: string
  messages: RenderedMessage[]
}
type ProcessEntry = {
  type: 'process'
  id: string
  message: AiMessage
  parts: RenderedMessage['parts']
}
type ProcessItemEntry = ActivityEntry | ProcessEntry
type ProcessGroupEntry = {
  type: 'process-group'
  id: string
  items: ProcessItemEntry[]
  messages: RenderedMessage[]
  running: boolean
  missingFinal: boolean
  summary?: RenderedMessage
}
type TimelineEntry =
  | { type: 'message'; id: string; message: AiMessage; parts: RenderedMessage['parts'] }
  | ProcessGroupEntry

const appendTurnEntries = (
  entries: TimelineEntry[],
  turn: RenderedMessage[],
  running: boolean
): void => {
  const summary = turn.find(({ message }) => message.toolName === AI_RUN_SUMMARY_TOOL)
  const visibleTurn = turn.filter(({ message }) => message.toolName !== AI_RUN_SUMMARY_TOOL)
  let lastActivityIndex = -1
  for (let index = visibleTurn.length - 1; index >= 0; index -= 1) {
    const message = visibleTurn[index].message
    if (message.role === 'tool' || message.role === 'system') {
      lastActivityIndex = index
      break
    }
  }

  if (!running && lastActivityIndex < 0) {
    for (const rendered of visibleTurn) {
      entries.push({ type: 'message', id: rendered.message.id, ...rendered })
    }
    return
  }

  let finalAnswerIndex = -1
  if (lastActivityIndex >= 0) {
    for (let index = visibleTurn.length - 1; index > lastActivityIndex; index -= 1) {
      const message = visibleTurn[index].message
      if (message.role === 'assistant' && message.content.trim()) {
        finalAnswerIndex = index
        break
      }
    }
  }

  const activityMessages = visibleTurn.slice(
    0,
    finalAnswerIndex < 0 ? visibleTurn.length : finalAnswerIndex
  )
  const processItems: ProcessItemEntry[] = []
  let toolGroup: RenderedMessage[] = []
  const flushToolGroup = (): void => {
    if (!toolGroup.length) return
    processItems.push({
      type: 'activity',
      id: `activity-${toolGroup[0].message.id}`,
      messages: toolGroup
    })
    toolGroup = []
  }
  for (const rendered of activityMessages) {
    if (rendered.message.role === 'tool') {
      toolGroup.push(rendered)
      continue
    }
    flushToolGroup()
    if (rendered.message.status !== 'failed' && rendered.message.content.trim()) {
      processItems.push({ type: 'process', id: rendered.message.id, ...rendered })
    }
  }
  flushToolGroup()
  const failedAssistant = finalAnswerIndex < 0
    ? visibleTurn.find(({ message }) => (
        message.role === 'assistant' && message.status === 'failed'
      ))
    : undefined
  const missingFinal = !running
    && finalAnswerIndex < 0
    && !failedAssistant
    && Boolean(activityMessages.length || summary?.message.status === 'complete')
  const hasProcessGroup = Boolean(processItems.length || summary || running)
  if (hasProcessGroup) {
    entries.push({
      type: 'process-group',
      id: `process-group-${summary?.message.id ?? processItems[0]?.id ?? 'running'}`,
      items: processItems,
      messages: activityMessages,
      running,
      missingFinal,
      ...(summary ? { summary } : {})
    })
  }
  if (finalAnswerIndex >= 0) {
    for (const rendered of visibleTurn.slice(finalAnswerIndex)) {
      if (rendered.message.role === 'assistant') {
        entries.push({ type: 'message', id: rendered.message.id, ...rendered })
      }
    }
    return
  }
  if (!running && (activityMessages.length || summary?.message.status === 'complete')) {
    if (failedAssistant) {
      entries.push({ type: 'message', id: failedAssistant.message.id, ...failedAssistant })
    }
  }
}

const timelineEntries = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []
  let turn: RenderedMessage[] = []
  for (const rendered of renderedMessages.value) {
    if (rendered.message.role === 'user') {
      appendTurnEntries(entries, turn, false)
      turn = []
      entries.push({ type: 'message', id: rendered.message.id, ...rendered })
      continue
    }
    turn.push(rendered)
  }
  appendTurnEntries(entries, turn, props.running)
  return entries
})
const hasVisibleRunningState = computed(() => timelineEntries.value.some(entry => (
  entry.type === 'process-group'
    ? runStatus(entry) === 'streaming'
    : entry.type === 'message' && entry.message.status === 'streaming' && entry.message.content.trim().length > 0
)))
const copiedKey = ref('')
const processGroupExpansionOverrides = ref(new Map<string, boolean>())
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const copyContent = (key: string, content: string): void => {
  window.electron.clipboard.writeText(content)
  copiedKey.value = key
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = ''
  }, 1600)
}

const openMarkdownLink = (event: MouseEvent): void => {
  if (!(event.target instanceof Element)) return
  const anchor = event.target.closest('a')
  if (!(anchor instanceof HTMLAnchorElement)) return
  const href = anchor.getAttribute('href') ?? ''
  if (href.startsWith('#')) return
  event.preventDefault()
  if (/^(?:https?:|mailto:)/i.test(href)) void window.electron.shell.openExternal(href)
}

const processGroupExpanded = (entry: ProcessGroupEntry): boolean => (
  processGroupExpansionOverrides.value.get(entry.id)
    ?? (entry.running || runStatus(entry) === 'failed')
)
const toggleProcessGroup = (entry: ProcessGroupEntry): void => {
  const next = new Map(processGroupExpansionOverrides.value)
  next.set(entry.id, !processGroupExpanded(entry))
  processGroupExpansionOverrides.value = next
}

const runStatus = (entry: ProcessGroupEntry): AiMessageStatus => {
  if (entry.summary?.message.status === 'failed'
    || entry.messages.some(({ message }) => message.status === 'failed')) return 'failed'
  if (entry.summary?.message.status === 'cancelled'
    || entry.messages.some(({ message }) => message.status === 'cancelled')) return 'cancelled'
  if (entry.running || entry.summary?.message.status === 'streaming') return 'streaming'
  return 'complete'
}

const toolCount = (messages: readonly RenderedMessage[]): number => (
  messages.filter(({ message }) => message.role === 'tool').length
)

const activityStatusLabel = (status: AiMessageStatus): string => {
  if (status === 'streaming') return t('annotamd.agentWorkspace.toolActivityRunning')
  if (status === 'failed') return t('annotamd.agentWorkspace.toolActivityFailed')
  if (status === 'cancelled') return t('annotamd.agentWorkspace.toolActivityCancelled')
  return t('annotamd.agentWorkspace.toolActivityComplete')
}

const activityDuration = (summary?: RenderedMessage): string => {
  const content = summary?.message.content
  if (!content) return ''
  try {
    const durationMs = Number((JSON.parse(content) as { durationMs?: unknown }).durationMs)
    if (!Number.isFinite(durationMs) || durationMs < 0) return ''
    const seconds = Math.floor(durationMs / 1_000)
    if (seconds < 1) return t('annotamd.agentWorkspace.durationUnderSecond')
    if (seconds < 60) return t('annotamd.agentWorkspace.durationSeconds', { count: seconds })
    return t('annotamd.agentWorkspace.durationMinutesSeconds', {
      minutes: Math.floor(seconds / 60),
      seconds: seconds % 60
    })
  } catch {
    return ''
  }
}

const runError = (summary?: RenderedMessage): string => {
  const content = summary?.message.content
  if (!content) return ''
  try {
    const error = (JSON.parse(content) as { error?: unknown }).error
    return typeof error === 'string' ? error : ''
  } catch {
    return ''
  }
}

const processLabel = (message: AiMessage): string => (
  message.toolName === AI_REASONING_MESSAGE_TOOL
    ? t('annotamd.agentWorkspace.reasoningSummary')
    : t('annotamd.agentWorkspace.processNarration')
)

const toolDisplayName = (name?: string): string => {
  if (name === 'commandExecution') return t('annotamd.agentWorkspace.toolKinds.command')
  if (name === 'fileChange') return t('annotamd.agentWorkspace.toolKinds.fileChange')
  if (name === 'mcpToolCall') return t('annotamd.agentWorkspace.toolKinds.mcp')
  if (name === 'dynamicToolCall') return t('annotamd.agentWorkspace.toolKinds.dynamic')
  if (name === 'webSearch') return t('annotamd.agentWorkspace.toolKinds.webSearch')
  return name || roleLabel('tool')
}

const toolStatusLabel = (status: AiMessageStatus): string => {
  if (status === 'streaming') return t('annotamd.agentWorkspace.status.running')
  if (status === 'failed') return t('annotamd.agentWorkspace.status.error')
  if (status === 'cancelled') return t('annotamd.agentWorkspace.stop')
  return t('annotamd.agentWorkspace.toolActivityComplete')
}

const roleLabel = (role: AiMessageRole): string => {
  if (role === 'user') return t('annotamd.agentWorkspace.you')
  if (role === 'tool') return t('annotamd.agentWorkspace.tool')
  if (role === 'system') return t('annotamd.agentWorkspace.system')
  return t('annotamd.agentWorkspace.ai')
}

const formatMessageTime = (timestamp: number): string => (
  formatCommentTimestamp(timestamp, locale.value)
)

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<style scoped>
.annotamd-agent-message-stream { display: flex; min-width: 0; width: 100%; flex-direction: column; gap: 12px; }
.annotamd-agent-empty { display: grid; min-height: 320px; flex: 1; grid-template-rows: auto minmax(190px, 1fr); gap: 12px; color: var(--annotamd-muted); }
.annotamd-agent-suggestions { display: grid; gap: 7px; }
.annotamd-agent-suggestions > span { color: var(--annotamd-muted); font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 2px), 16px); font-weight: 600; }
.annotamd-agent-suggestions button { width: 100%; padding: 8px 10px; color: var(--annotamd-text); border: 1px solid var(--annotamd-border-soft); border-radius: 8px; background: var(--annotamd-surface); cursor: pointer; font: inherit; font-size: clamp(10px, calc(var(--annotamd-agent-font-size, 12px) - 1px), 17px); line-height: 1.45; text-align: left; transition: border-color .15s ease, background .15s ease; }
.annotamd-agent-suggestions button:hover { border-color: color-mix(in srgb, var(--annotamd-blue) 35%, var(--annotamd-border)); background: color-mix(in srgb, var(--annotamd-blue) 5%, var(--annotamd-surface)); }
.annotamd-agent-suggestions button:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 2px; }
.annotamd-agent-empty-intro { display: grid; align-content: center; justify-items: center; gap: 7px; padding: 20px 10px 28px; text-align: center; }
.annotamd-agent-empty-mark { display: grid; width: 42px; height: 42px; margin-bottom: 4px; place-items: center; color: var(--annotamd-blue); border-radius: 13px; background: color-mix(in srgb, var(--annotamd-blue) 10%, transparent); font-size: 13px; font-weight: 700; }
.annotamd-agent-empty-mark :deep(svg) { width: 20px; height: 20px; }
.annotamd-agent-empty-intro strong { color: var(--annotamd-text); font-size: var(--annotamd-agent-font-size, 12px); }
.annotamd-agent-empty-intro p { max-width: 280px; margin: 0; font-size: clamp(10px, calc(var(--annotamd-agent-font-size, 12px) - 1px), 17px); line-height: 1.5; }
.annotamd-agent-message { display: grid; width: fit-content; max-width: 92%; box-sizing: border-box; align-self: flex-start; gap: 3px; }
.annotamd-agent-message.is-user { max-width: 82%; align-self: flex-end; justify-items: end; }
.annotamd-agent-message-bubble { min-width: 0; width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--annotamd-border); border-radius: 10px; background: color-mix(in srgb, var(--annotamd-surface-soft) 76%, var(--annotamd-surface)); }
.annotamd-agent-message.is-user .annotamd-agent-message-bubble { border-color: color-mix(in srgb, var(--annotamd-green) 26%, var(--annotamd-border)); background: color-mix(in srgb, var(--annotamd-green) 10%, var(--annotamd-surface)); }
.annotamd-agent-message-meta { display: flex; min-height: 20px; width: 100%; align-items: center; justify-content: flex-end; gap: 2px; color: var(--annotamd-muted); font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); }
.annotamd-agent-message-meta time { padding: 0 2px; line-height: 1.4; white-space: nowrap; }
.annotamd-agent-process-group { width: 100%; min-width: 0; }
.annotamd-agent-process-group-toggle { display: flex; width: 100%; min-height: 30px; align-items: baseline; gap: 7px; padding: 3px 4px; color: var(--annotamd-muted); border: 0; border-radius: 6px; background: transparent; cursor: pointer; font: inherit; font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); line-height: 1.4; text-align: left; }
.annotamd-agent-process-group-toggle:hover { background: color-mix(in srgb, var(--annotamd-surface-soft) 84%, transparent); }
.annotamd-agent-process-group-toggle > .annotamd-agent-tool-state { align-self: baseline; }
.annotamd-agent-process-group-toggle strong { color: var(--annotamd-text); font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 2px), 16px); font-weight: 650; }
.annotamd-agent-process-group-chevron { flex: none; margin-left: auto; transition: transform .15s ease; }
.annotamd-agent-process-group-chevron.is-expanded { transform: rotate(90deg); }
.annotamd-agent-process-group-chevron :deep(svg) { width: 13px; height: 13px; }
.annotamd-agent-process-group-body { display: grid; min-width: 0; gap: 7px; margin: 3px 4px 6px 24px; }
.annotamd-agent-process-note { padding: 1px 0; color: var(--annotamd-muted); border: 0; background: transparent; }
.annotamd-agent-process-note-content { min-width: 0; font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 2px), 16px); line-height: 1.55; word-break: break-word; }
.annotamd-agent-process-note-content pre { margin: 5px 0 0; overflow: auto; white-space: pre-wrap; }
.annotamd-agent-run-error { margin: -2px 4px 4px 24px; color: #ef4444; font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); line-height: 1.45; word-break: break-word; }
.annotamd-agent-missing-final { margin: -2px 4px 4px 24px; color: var(--annotamd-muted); font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); line-height: 1.45; }
.annotamd-agent-tool-list { display: grid; min-width: 0; gap: 2px; }
.annotamd-agent-tool-row { min-width: 0; }
.annotamd-agent-tool-line { display: flex; min-width: 0; min-height: 24px; align-items: center; gap: 7px; padding: 1px 0; color: var(--annotamd-muted); }
.annotamd-agent-tool-line strong { overflow: hidden; color: var(--annotamd-text); font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 2px), 16px); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-tool-line > span { overflow: hidden; flex: 1; font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-tool-error { margin: 0 0 5px 20px; color: #ef4444; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.annotamd-agent-tool-state { flex: none; color: var(--annotamd-muted); }
.annotamd-agent-tool-state.is-streaming { color: var(--annotamd-blue); animation: ai-tool-spin 1s linear infinite; }
.annotamd-agent-tool-state.is-complete { color: #22a06b; }
.annotamd-agent-tool-state.is-failed { color: #ef4444; }
.annotamd-agent-tool-state :deep(svg) { width: 13px; height: 13px; }
.annotamd-agent-copy-action { display: grid; width: 22px; height: 22px; flex: none; padding: 0; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 5px; background: transparent; cursor: pointer; }
.annotamd-agent-copy-action:hover { color: var(--annotamd-text); background: var(--annotamd-surface-soft); }
.annotamd-agent-process-group-toggle:focus-visible, .annotamd-agent-copy-action:focus-visible, .annotamd-agent-message-error button:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: -2px; }
.annotamd-agent-copy-action :deep(svg) { width: 13px; height: 13px; }
.annotamd-agent-message-content { min-width: 0; color: var(--annotamd-text); font-size: var(--annotamd-agent-font-size, 12px); line-height: 1.6; word-break: break-word; }
.annotamd-agent-markdown :deep(> :first-child) { margin-top: 0; }
.annotamd-agent-markdown :deep(> :last-child) { margin-bottom: 0; }
.annotamd-agent-markdown :deep(p) { margin: .35em 0; }
.annotamd-agent-markdown :deep(h1),
.annotamd-agent-markdown :deep(h2),
.annotamd-agent-markdown :deep(h3),
.annotamd-agent-markdown :deep(h4) { margin: .7em 0 .3em; line-height: 1.35; }
.annotamd-agent-markdown :deep(h1) { font-size: 1.25em; }
.annotamd-agent-markdown :deep(h2) { font-size: 1.15em; }
.annotamd-agent-markdown :deep(h3),
.annotamd-agent-markdown :deep(h4) { font-size: 1.05em; }
.annotamd-agent-markdown :deep(ul),
.annotamd-agent-markdown :deep(ol) { margin: .35em 0; padding-left: 1.5em; }
.annotamd-agent-markdown :deep(blockquote) { margin: .45em 0; padding-left: .75em; color: var(--annotamd-muted); border-left: 2px solid var(--annotamd-border); }
.annotamd-agent-markdown :deep(a) { color: var(--annotamd-blue); text-decoration: underline; }
.annotamd-agent-markdown :deep(code) { padding: .1em .3em; border-radius: 3px; background: var(--annotamd-surface-soft); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .92em; }
.annotamd-agent-markdown :deep(table) { display: block; max-width: 100%; margin: .45em 0; overflow: auto; border-collapse: collapse; }
.annotamd-agent-markdown :deep(th),
.annotamd-agent-markdown :deep(td) { padding: 4px 6px; border: 1px solid var(--annotamd-border); text-align: left; }
.annotamd-agent-code-block { overflow: hidden; margin: 7px 0; border: 1px solid var(--annotamd-border-soft); border-radius: 7px; background: color-mix(in srgb, var(--annotamd-surface-soft) 75%, var(--annotamd-surface)); }
.annotamd-agent-code-header { display: flex; min-height: 28px; align-items: center; justify-content: space-between; padding: 2px 5px 2px 9px; color: var(--annotamd-muted); border-bottom: 1px solid var(--annotamd-border-soft); font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 3px), 15px); }
.annotamd-agent-code-block pre { max-width: 100%; margin: 0; padding: 9px; overflow: auto; white-space: pre; }
.annotamd-agent-code-block code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: clamp(10px, calc(var(--annotamd-agent-font-size, 12px) - 1px), 17px); line-height: 1.55; }
.annotamd-agent-message-error { display: flex; align-items: center; gap: 6px; margin: 0; color: #ef4444; font-size: clamp(9px, calc(var(--annotamd-agent-font-size, 12px) - 2px), 16px); }
.annotamd-agent-message-error button { padding: 0; color: inherit; border: 0; background: transparent; cursor: pointer; text-decoration: underline; }
.annotamd-agent-thinking { display: inline-flex; gap: 4px; padding: 8px 11px; }
.annotamd-agent-thinking span { width: 5px; height: 5px; border-radius: 50%; background: var(--annotamd-muted); animation: ai-thinking 1s infinite alternate; }
.annotamd-agent-thinking span:nth-child(2) { animation-delay: .2s; }
.annotamd-agent-thinking span:nth-child(3) { animation-delay: .4s; }
@keyframes ai-thinking { to { opacity: .25; transform: translateY(-2px); } }
@keyframes ai-tool-spin { to { transform: rotate(360deg); } }
</style>
