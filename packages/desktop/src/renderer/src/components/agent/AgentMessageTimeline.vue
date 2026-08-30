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
      <article
        v-for="entry in renderedMessages"
        :key="entry.message.id"
        class="annotamd-agent-message"
        :class="[`is-${entry.message.role}`, `is-${entry.message.status ?? 'complete'}`]"
        :aria-label="roleLabel(entry.message.role)"
      >
        <template v-if="entry.message.role === 'tool'">
          <button
            type="button"
            class="annotamd-agent-tool-summary"
            data-testid="ai-tool-message"
            :aria-expanded="toolExpanded(entry.message.id)"
            @click="toggleTool(entry.message.id)"
          >
            <el-icon class="annotamd-agent-tool-state" :class="`is-${entry.message.status}`">
              <Loading v-if="entry.message.status === 'streaming'" />
              <CircleCheck v-else-if="entry.message.status === 'complete'" />
              <CircleClose v-else-if="entry.message.status === 'failed'" />
              <VideoPause v-else />
            </el-icon>
            <strong>{{ entry.message.toolName || roleLabel('tool') }}</strong>
            <span>{{ toolStatusLabel(entry.message.status) }}</span>
            <el-icon
              class="annotamd-agent-tool-chevron"
              :class="{ 'is-expanded': toolExpanded(entry.message.id) }"
            >
              <ArrowRight />
            </el-icon>
          </button>
          <div
            v-if="toolExpanded(entry.message.id)"
            class="annotamd-agent-tool-details"
            data-testid="ai-tool-details"
          >
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
            <pre v-if="entry.message.content">{{ entry.message.content }}</pre>
          </div>
        </template>
        <template v-else>
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
        </template>
      </article>
    </template>
    <div v-if="running && !hasStreamingMessage" class="annotamd-agent-thinking" role="status">
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
const hasStreamingMessage = computed(() => props.messages.some(message => (
  message.status === 'streaming' && message.content.trim().length > 0
)))
const renderedMessages = computed(() => props.messages
  .filter(message => !(
    message.role === 'assistant' && message.status === 'streaming' && !message.content.trim()
  ))
  .map(message => ({
    message,
    parts: renderAgentMarkdown(message.content)
  })))
const copiedKey = ref('')
const expandedToolIds = ref(new Set<string>())
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

const toolExpanded = (id: string): boolean => expandedToolIds.value.has(id)
const toggleTool = (id: string): void => {
  const next = new Set(expandedToolIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedToolIds.value = next
}

const toolStatusLabel = (status: AiMessageStatus): string => {
  if (status === 'streaming') return t('annotamd.agentWorkspace.status.running')
  if (status === 'failed') return t('annotamd.agentWorkspace.status.error')
  if (status === 'cancelled') return t('annotamd.agentWorkspace.stop')
  return t('annotamd.agentWorkspace.status.ready')
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
.annotamd-agent-suggestions > span { color: var(--annotamd-muted); font-size: 10px; font-weight: 600; }
.annotamd-agent-suggestions button { width: 100%; padding: 8px 10px; color: var(--annotamd-text); border: 1px solid var(--annotamd-border-soft); border-radius: 8px; background: var(--annotamd-surface); cursor: pointer; font: inherit; font-size: 11px; line-height: 1.45; text-align: left; transition: border-color .15s ease, background .15s ease; }
.annotamd-agent-suggestions button:hover { border-color: color-mix(in srgb, var(--annotamd-blue) 35%, var(--annotamd-border)); background: color-mix(in srgb, var(--annotamd-blue) 5%, var(--annotamd-surface)); }
.annotamd-agent-suggestions button:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 2px; }
.annotamd-agent-empty-intro { display: grid; align-content: center; justify-items: center; gap: 7px; padding: 20px 10px 28px; text-align: center; }
.annotamd-agent-empty-mark { display: grid; width: 42px; height: 42px; margin-bottom: 4px; place-items: center; color: var(--annotamd-blue); border-radius: 13px; background: color-mix(in srgb, var(--annotamd-blue) 10%, transparent); font-size: 13px; font-weight: 700; }
.annotamd-agent-empty-mark :deep(svg) { width: 20px; height: 20px; }
.annotamd-agent-empty-intro strong { color: var(--annotamd-text); font-size: 13px; }
.annotamd-agent-empty-intro p { max-width: 280px; margin: 0; font-size: 11px; line-height: 1.5; }
.annotamd-agent-message { display: grid; width: fit-content; max-width: 92%; box-sizing: border-box; align-self: flex-start; gap: 3px; }
.annotamd-agent-message.is-user { max-width: 82%; align-self: flex-end; justify-items: end; }
.annotamd-agent-message-bubble { min-width: 0; width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--annotamd-border); border-radius: 10px; background: color-mix(in srgb, var(--annotamd-surface-soft) 76%, var(--annotamd-surface)); }
.annotamd-agent-message.is-user .annotamd-agent-message-bubble { border-color: color-mix(in srgb, var(--annotamd-green) 26%, var(--annotamd-border)); background: color-mix(in srgb, var(--annotamd-green) 10%, var(--annotamd-surface)); }
.annotamd-agent-message.is-tool { width: 100%; max-width: 100%; gap: 0; padding: 0; border: 1px solid var(--annotamd-border); border-radius: 7px; background: color-mix(in srgb, var(--annotamd-surface-soft) 70%, var(--annotamd-surface)); box-shadow: none; }
.annotamd-agent-message-meta { display: flex; min-height: 20px; width: 100%; align-items: center; justify-content: flex-end; gap: 2px; color: var(--annotamd-muted); font-size: 9px; }
.annotamd-agent-message-meta time { padding: 0 2px; line-height: 1.4; white-space: nowrap; }
.annotamd-agent-tool-summary { display: flex; min-width: 0; min-height: 34px; align-items: center; gap: 7px; padding: 6px 8px; color: var(--annotamd-muted); border: 0; background: transparent; cursor: pointer; text-align: left; }
.annotamd-agent-tool-summary strong { overflow: hidden; color: var(--annotamd-text); font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-tool-summary > span { overflow: hidden; flex: 1; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-tool-state { flex: none; color: var(--annotamd-muted); }
.annotamd-agent-tool-state.is-streaming { color: var(--annotamd-blue); animation: ai-tool-spin 1s linear infinite; }
.annotamd-agent-tool-state.is-complete { color: #22a06b; }
.annotamd-agent-tool-state.is-failed { color: #ef4444; }
.annotamd-agent-tool-state :deep(svg),
.annotamd-agent-tool-chevron :deep(svg) { width: 13px; height: 13px; }
.annotamd-agent-tool-chevron { flex: none; transition: transform .15s ease; }
.annotamd-agent-tool-chevron.is-expanded { transform: rotate(90deg); }
.annotamd-agent-tool-details { position: relative; min-width: 0; padding: 0 8px 8px 28px; border-top: 1px solid var(--annotamd-border-soft); }
.annotamd-agent-tool-details .annotamd-agent-copy-action { position: absolute; z-index: 1; top: 4px; right: 6px; }
.annotamd-agent-tool-details pre { max-height: 180px; margin: 7px 0 0; padding: 5px 28px 0 0; overflow: auto; color: var(--annotamd-muted); font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.annotamd-agent-copy-action { display: grid; width: 22px; height: 22px; flex: none; padding: 0; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 5px; background: transparent; cursor: pointer; }
.annotamd-agent-copy-action:hover { color: var(--annotamd-text); background: var(--annotamd-surface-soft); }
.annotamd-agent-tool-summary:focus-visible, .annotamd-agent-copy-action:focus-visible, .annotamd-agent-message-error button:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 1px; }
.annotamd-agent-copy-action :deep(svg) { width: 13px; height: 13px; }
.annotamd-agent-message-content { min-width: 0; color: var(--annotamd-text); font-size: 13px; line-height: 1.6; word-break: break-word; }
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
.annotamd-agent-code-header { display: flex; min-height: 28px; align-items: center; justify-content: space-between; padding: 2px 5px 2px 9px; color: var(--annotamd-muted); border-bottom: 1px solid var(--annotamd-border-soft); font-size: 9px; }
.annotamd-agent-code-block pre { max-width: 100%; margin: 0; padding: 9px; overflow: auto; white-space: pre; }
.annotamd-agent-code-block code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.55; }
.annotamd-agent-message-error { display: flex; align-items: center; gap: 6px; margin: 0; color: #ef4444; font-size: 10px; }
.annotamd-agent-message-error button { padding: 0; color: inherit; border: 0; background: transparent; cursor: pointer; text-decoration: underline; }
.annotamd-agent-thinking { display: inline-flex; gap: 4px; padding: 8px 11px; }
.annotamd-agent-thinking span { width: 5px; height: 5px; border-radius: 50%; background: var(--annotamd-muted); animation: ai-thinking 1s infinite alternate; }
.annotamd-agent-thinking span:nth-child(2) { animation-delay: .2s; }
.annotamd-agent-thinking span:nth-child(3) { animation-delay: .4s; }
@keyframes ai-thinking { to { opacity: .25; transform: translateY(-2px); } }
@keyframes ai-tool-spin { to { transform: rotate(360deg); } }
</style>
