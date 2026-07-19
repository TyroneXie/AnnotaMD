<template>
  <aside class="annotamd-comment-pane">
    <header class="annotamd-comment-header">
      <div class="annotamd-comment-title">
        {{ t('annotamd.comments.titleWithCount', { count: selectionComments.length }) }}
      </div>
      <div class="annotamd-comment-header-actions">
        <button
          class="annotamd-mcp-status"
          :class="mcpStatusClass"
          type="button"
          :title="mcpStatusTitle"
          :aria-label="mcpStatusTitle"
          @click="openAgentSettings"
        >
          <span class="annotamd-mcp-status-dot" />
          <span>MCP</span>
        </button>
        <button
          class="annotamd-pane-close"
          type="button"
          :title="t('annotamd.comments.closePane')"
          :aria-label="t('annotamd.comments.closePane')"
          @click="commentStore.setPaneVisible(false)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 5 7 7-7 7" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </header>

    <section
      ref="commentList"
      class="annotamd-comment-list"
      :class="{ anchored: anchoredLayoutEnabled }"
      :style="{ '--annotamd-comment-stage-height': `${commentStageHeight}px` }"
      :aria-label="t('annotamd.comments.listLabel')"
    >
      <article
        v-if="composerOpen"
        class="annotamd-comment-card annotamd-composer-card active"
      >
        <div class="annotamd-comment-row">
          <span class="annotamd-comment-scope">{{ t('annotamd.comments.selectionScope') }}</span>
          <div class="annotamd-comment-card-actions">
            <button
              type="button"
              @click="closeComposer"
            >
              {{ t('annotamd.comments.cancel') }}
            </button>
          </div>
        </div>
        <blockquote v-if="activeSelection">
          {{ activeSelection.quote }}
        </blockquote>
        <textarea
          ref="composerTextarea"
          v-model="draftBody"
          :placeholder="t('annotamd.comments.selectionPlaceholder')"
          rows="4"
          @keydown.meta.enter.prevent="submitComment"
          @keydown.ctrl.enter.prevent="submitComment"
        />
        <div class="annotamd-comment-action-row annotamd-composer-actions">
          <span>{{ t('annotamd.comments.excludeFromRenderedMarkdown') }}</span>
          <button
            type="button"
            :disabled="!draftBody.trim() || !activeSelection"
            @click="submitComment"
          >
            {{ t('annotamd.comments.send') }}
          </button>
        </div>
      </article>

      <article
        v-for="comment in selectionComments"
        :key="comment.id"
        :data-comment-id="comment.id"
        class="annotamd-comment-card"
        :class="{
          resolved: comment.resolved,
          emphasized: activeCommentId === comment.id
        }"
        :style="commentCardStyle(comment.id)"
        @mouseenter="commentStore.setActiveComment(comment.id)"
        @mouseleave="clearActiveComment(comment.id)"
        @click="commentStore.setActiveComment(comment.id)"
      >
        <div class="annotamd-comment-row">
          <span class="annotamd-comment-scope">{{ t('annotamd.comments.selectionScope') }}</span>
          <div class="annotamd-comment-card-actions">
            <button
              v-if="!comment.resolved || (comment.anchor && comment.focus)"
              type="button"
              @click="commentStore.toggleResolved(filePath, comment.id)"
            >
              {{ t(comment.resolved ? 'annotamd.comments.restore' : 'annotamd.comments.markResolved') }}
            </button>
          </div>
        </div>

        <blockquote>{{ comment.quote }}</blockquote>

        <textarea
          v-if="editingId === comment.id"
          v-model="editBody"
          class="annotamd-inline-editor"
          rows="3"
        />
        <p v-else>{{ comment.body }}</p>

        <div
          v-if="comment.replies.length"
          class="annotamd-replies"
        >
          <p
            v-for="reply in comment.replies"
            :key="reply.id"
          >
            <span
              v-if="reply.author === 'agent'"
              class="annotamd-reply-author"
            >{{ t('annotamd.comments.agentAuthor') }}</span>
            {{ reply.body }}
          </p>
        </div>

        <div
          v-if="replyingId === comment.id"
          class="annotamd-reply-editor"
        >
          <textarea
            v-model="replyBody"
            rows="2"
            :placeholder="t('annotamd.comments.replyPlaceholder')"
          />
          <button
            type="button"
            :disabled="!replyBody.trim()"
            @click="saveReply(comment.id)"
          >
            {{ t('annotamd.comments.reply') }}
          </button>
        </div>

        <div class="annotamd-comment-action-row">
          <button
            v-if="editingId === comment.id"
            type="button"
            :disabled="!editBody.trim()"
            @click="saveEdit(comment.id)"
          >
            {{ t('annotamd.comments.save') }}
          </button>
          <button
            v-else
            type="button"
            @click="startEdit(comment.id, comment.body)"
          >
            {{ t('annotamd.comments.edit') }}
          </button>
          <button
            type="button"
            @click="startReply(comment.id)"
          >
            {{ t('annotamd.comments.reply') }}
          </button>
          <button
            type="button"
            @click="commentStore.deleteComment(filePath, comment.id)"
          >
            {{ t('annotamd.comments.delete') }}
          </button>
        </div>
      </article>

      <div
        v-if="!selectionComments.length && !composerOpen"
        class="annotamd-empty-comments"
      >
        <div class="annotamd-empty-icon">☰</div>
        <strong>{{ t('annotamd.comments.emptyTitle') }}</strong>
        <p>{{ t('annotamd.comments.emptyDescription') }}</p>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useAnnotaMDCommentsStore } from '@/store/annotamdComments'
import bus from '@/bus'
import {
  layoutCommentBubbles,
  type CommentBubbleLayout
} from '@/util/commentBubbleLayout'
import type { CommentAnchorRect } from '@/util/annotamdCommentHighlights'
import { useI18n } from 'vue-i18n'
import type { AnnotaMDMcpStatus } from '@shared/types/comments'

const editorStore = useEditorStore()
const commentStore = useAnnotaMDCommentsStore()
const { t } = useI18n()

const { currentFile } = storeToRefs(editorStore)
const {
  activeSelection,
  activeCommentId,
  composerRequest,
  commentFocusRequest
} = storeToRefs(commentStore)

const composerOpen = ref(false)
const draftBody = ref('')
const editingId = ref<string | null>(null)
const editBody = ref('')
const replyingId = ref<string | null>(null)
const replyBody = ref('')
const composerTextarea = ref<HTMLTextAreaElement | null>(null)
const commentList = ref<HTMLElement | null>(null)
const commentAnchors = ref<CommentAnchorRect[]>([])
const commentLayout = ref<CommentBubbleLayout>({ positions: {}, height: 0 })
let commentResizeObserver: ResizeObserver | null = null
let commentLayoutFrame: number | null = null
let commentLayoutDisposed = false
const commentCardHeights = new Map<string, number>()
const observedCommentCards = new Map<string, HTMLElement>()
let stopMcpStatusListener: (() => void) | null = null
const mcpStatus = ref<AnnotaMDMcpStatus>({ enabled: false, running: false, clients: [] })

const filePath = computed(() => currentFile.value?.pathname ?? '')
const comments = computed(() => commentStore.commentsForFile(filePath.value))
const selectionComments = computed(() => comments.value.filter((comment) => comment.scope === 'selection'))
const mcpStatusClass = computed(() => ({
  disabled: !mcpStatus.value.enabled,
  error: mcpStatus.value.enabled && !mcpStatus.value.running,
  enabled: mcpStatus.value.enabled && mcpStatus.value.running
}))
const mcpStatusTitle = computed(() => {
  if (!mcpStatus.value.enabled) return t('annotamd.comments.mcpDisabled')
  if (!mcpStatus.value.running) return t('annotamd.comments.mcpError')
  return t('annotamd.comments.mcpEnabled')
})
const anchoredLayoutEnabled = computed(() =>
  !composerOpen.value && Object.keys(commentLayout.value.positions).length > 0
)
const commentStageHeight = computed(() => commentLayout.value.height)

const commentCardStyle = (commentId: string): Record<string, string> => {
  if (!anchoredLayoutEnabled.value) return {}
  const top = commentLayout.value.positions[commentId]
  return Number.isFinite(top) ? { top: `${top}px` } : {}
}

const syncObservedCommentCards = (list: HTMLElement): void => {
  const currentIds = new Set<string>()
  for (const card of list.querySelectorAll<HTMLElement>('[data-comment-id]')) {
    const id = card.dataset.commentId
    if (!id) continue
    currentIds.add(id)
    const previous = observedCommentCards.get(id)
    if (previous === card) continue
    if (previous) commentResizeObserver?.unobserve(previous)
    observedCommentCards.set(id, card)
    commentCardHeights.set(id, card.offsetHeight)
    commentResizeObserver?.observe(card)
  }
  for (const [id, card] of observedCommentCards) {
    if (currentIds.has(id)) continue
    commentResizeObserver?.unobserve(card)
    observedCommentCards.delete(id)
    commentCardHeights.delete(id)
  }
}

const recalculateCommentBubbleLayout = (): void => {
  const list = commentList.value
  if (!list || composerOpen.value) return

  syncObservedCommentCards(list)
  const listRect = list.getBoundingClientRect()
  const anchorById = new Map(commentAnchors.value.map((anchor) => [anchor.id, anchor]))
  const bubbles = selectionComments.value.map((comment) => {
    const anchor = anchorById.get(comment.id)
    return {
      id: comment.id,
      anchorTop: anchor ? anchor.top - listRect.top + list.scrollTop : null,
      height: commentCardHeights.get(comment.id) ?? 120
    }
  })
  commentLayout.value = layoutCommentBubbles(bubbles, 0, list.clientHeight)
}

const updateCommentBubbleLayout = (): void => {
  void nextTick().then(() => {
    if (commentLayoutDisposed || commentLayoutFrame != null) return
    commentLayoutFrame = requestAnimationFrame(() => {
      commentLayoutFrame = null
      recalculateCommentBubbleLayout()
    })
  })
}

const handleCommentAnchors = (payload: unknown): void => {
  commentAnchors.value = Array.isArray(payload) ? payload as CommentAnchorRect[] : []
  updateCommentBubbleLayout()
}

const clearActiveComment = (commentId: string): void => {
  if (activeCommentId.value === commentId) commentStore.setActiveComment(null)
}

const openAgentSettings = (): void => {
  window.electron.ipcRenderer.send('mt::open-setting-window', 'agent')
}

const openComposer = (): void => {
  composerOpen.value = true
  nextTick(() => {
    composerTextarea.value?.focus()
  })
}

const closeComposer = (): void => {
  composerOpen.value = false
  draftBody.value = ''
  commentStore.clearComposerRequest()
}

const submitComment = (): void => {
  if (!filePath.value || !draftBody.value.trim()) return

  if (activeSelection.value) {
    commentStore.addSelectionComment(filePath.value, draftBody.value)
  }
  closeComposer()
}

const startEdit = (id: string, body: string): void => {
  editingId.value = id
  editBody.value = body
}

const saveEdit = (id: string): void => {
  if (!filePath.value) return
  commentStore.updateComment(filePath.value, id, editBody.value)
  editingId.value = null
  editBody.value = ''
}

const startReply = (id: string): void => {
  replyingId.value = replyingId.value === id ? null : id
  replyBody.value = ''
}

const saveReply = (id: string): void => {
  if (!filePath.value) return
  commentStore.addReply(filePath.value, id, replyBody.value)
  replyingId.value = null
  replyBody.value = ''
}

const focusCommentCard = async (commentId: string): Promise<void> => {
  composerOpen.value = false
  draftBody.value = ''
  commentStore.setActiveComment(commentId)
  await nextTick()
  recalculateCommentBubbleLayout()
  await nextTick()
  const card = [...(commentList.value?.querySelectorAll<HTMLElement>('[data-comment-id]') ?? [])]
    .find((element) => element.dataset.commentId === commentId)
  card?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  commentStore.clearCommentFocusRequest()
}

watch(composerRequest, (request) => {
  if (!request) return
  if (request.mode === 'selection') openComposer()
  commentStore.clearComposerRequest()
}, { immediate: true })

watch(commentFocusRequest, (request) => {
  if (!request) return
  void focusCommentCard(request.commentId)
}, { immediate: true })

watch(
  [selectionComments, editingId, replyingId, composerOpen],
  updateCommentBubbleLayout,
  { deep: true }
)

watch(filePath, () => {
  commentStore.setActiveComment(null)
  commentAnchors.value = []
  commentLayout.value = { positions: {}, height: 0 }
})

onMounted(() => {
  void window.electron.ipcRenderer.invoke('mt::comments::mcp-status').then((status) => {
    mcpStatus.value = status
  })
  stopMcpStatusListener = window.electron.ipcRenderer.on(
    'mt::comments::mcp-status-changed',
    (_event, status) => {
      mcpStatus.value = status
    }
  )
  bus.on('annotamd-comment-anchors', handleCommentAnchors)
  if (commentList.value) {
    commentResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const card = entry.target as HTMLElement
        const id = card.dataset.commentId
        if (!id) continue
        const height = entry.borderBoxSize?.[0]?.blockSize ?? card.offsetHeight
        commentCardHeights.set(id, height)
      }
      updateCommentBubbleLayout()
    })
    commentResizeObserver.observe(commentList.value)
    updateCommentBubbleLayout()
  }
})

onBeforeUnmount(() => {
  commentLayoutDisposed = true
  stopMcpStatusListener?.()
  stopMcpStatusListener = null
  bus.off('annotamd-comment-anchors', handleCommentAnchors)
  if (commentLayoutFrame != null) cancelAnimationFrame(commentLayoutFrame)
  commentLayoutFrame = null
  commentResizeObserver?.disconnect()
  commentResizeObserver = null
  observedCommentCards.clear()
  commentCardHeights.clear()
  commentStore.setActiveComment(null)
})
</script>

<style scoped>
.annotamd-comment-pane {
  --annotamd-surface: #ffffff;
  --annotamd-surface-soft: #f7f8fa;
  --annotamd-surface-blue: #e8f1ff;
  --annotamd-border: #dee0e3;
  --annotamd-border-soft: #eceff3;
  --annotamd-text: #2f3437;
  --annotamd-ink: #1f2329;
  --annotamd-muted: #6b7280;
  --annotamd-blue: #3370ff;
  --annotamd-green: #20a162;
  display: flex;
  position: fixed;
  z-index: 30;
  top: var(--titleBarHeight);
  right: 0;
  bottom: 0;
  flex: 0 0 var(--annotamd-comment-pane-width, 310px);
  flex-direction: column;
  width: var(--annotamd-comment-pane-width, 310px);
  min-width: var(--annotamd-comment-pane-width, 310px);
  height: auto;
  overflow: hidden;
  border-left: 1px solid var(--annotamd-border-soft);
  background: #f7f8fa;
  color: var(--annotamd-text);
}

.annotamd-comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--annotamd-border-soft);
}

.annotamd-comment-title {
  color: var(--annotamd-ink);
  font-weight: 700;
}

.annotamd-comment-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.annotamd-mcp-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--annotamd-muted);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.annotamd-mcp-status:hover {
  background: #eef1f5;
}

.annotamd-mcp-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b5bac3;
}

.annotamd-mcp-status.error .annotamd-mcp-status-dot {
  background: #d64545;
}

.annotamd-mcp-status.enabled {
  color: #16794c;
}

.annotamd-mcp-status.enabled .annotamd-mcp-status-dot {
  background: var(--annotamd-green);
  box-shadow: 0 0 0 3px rgba(32, 161, 98, 0.12);
}

.annotamd-pane-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--annotamd-blue);
  cursor: pointer;
}

.annotamd-pane-close svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}

.annotamd-pane-close:hover {
  background: #eef3ff;
  color: var(--annotamd-blue);
}

.annotamd-comment-list {
  position: relative;
  flex: 1;
  overflow: auto;
  padding: 14px 14px 80px;
}

.annotamd-comment-list.anchored::after {
  display: block;
  height: var(--annotamd-comment-stage-height);
  content: '';
}

.annotamd-comment-list.anchored .annotamd-comment-card[data-comment-id] {
  position: absolute;
  right: 14px;
  left: 14px;
  margin-bottom: 0;
  transition: top 120ms ease, border-color 120ms ease, background-color 120ms ease;
}

.annotamd-comment-card {
  margin-bottom: 12px;
  border: 1px solid var(--annotamd-border);
  border-radius: 10px;
  background: var(--annotamd-surface);
}

.annotamd-comment-card.active {
  border-color: var(--annotamd-blue);
  box-shadow: 0 0 0 3px var(--annotamd-surface-blue);
}

.annotamd-comment-card.emphasized {
  border-color: #9bb8ff;
  background: #f7f9ff;
}

.annotamd-comment-card.resolved {
  opacity: 0.72;
}

.annotamd-comment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 0;
}

.annotamd-comment-scope {
  color: var(--annotamd-blue);
  font-size: 12px;
  font-weight: 700;
}

.annotamd-comment-card-actions,
.annotamd-comment-action-row {
  display: flex;
  gap: 4px;
}

.annotamd-comment-card-actions button,
.annotamd-comment-action-row button {
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--annotamd-blue);
  font-size: 12px;
}

.annotamd-comment-card-actions button:hover,
.annotamd-comment-action-row button:hover {
  background: var(--annotamd-surface-blue);
  color: var(--annotamd-blue);
}

.annotamd-composer-card textarea,
.annotamd-inline-editor,
.annotamd-reply-editor textarea {
  width: 100%;
  box-sizing: border-box;
  margin: 10px;
  width: calc(100% - 20px);
  padding: 8px 10px;
  resize: vertical;
  border: 1px solid var(--annotamd-border);
  border-radius: 6px;
  outline: none;
  background: var(--annotamd-surface);
  color: var(--annotamd-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
}

.annotamd-composer-card textarea:focus,
.annotamd-inline-editor:focus,
.annotamd-reply-editor textarea:focus {
  border-color: var(--annotamd-blue);
  box-shadow: 0 0 0 2px rgba(51, 112, 255, 0.12);
}

.annotamd-composer-actions {
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 10px;
}

.annotamd-composer-actions span {
  margin-right: auto;
  color: var(--annotamd-muted);
  font-size: 12px;
}

.annotamd-composer-actions button,
.annotamd-reply-editor button {
  padding: 0 12px;
  background: var(--annotamd-blue);
  color: #fff;
}

.annotamd-composer-actions button:disabled,
.annotamd-reply-editor button:disabled {
  background: #edf1f7;
  color: #a0a6b0;
}

.annotamd-comment-card blockquote {
  margin: 8px 10px 0;
  padding: 7px 9px;
  border-left: 3px solid var(--annotamd-blue);
  background: var(--annotamd-surface-blue);
  color: var(--annotamd-text);
  font-size: 13px;
  line-height: 1.45;
}

.annotamd-comment-card p {
  margin: 0;
  padding: 9px 10px 11px;
  color: var(--annotamd-text);
  font-size: 14px;
  line-height: 1.5;
}

.annotamd-replies {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 10px 10px;
  padding: 8px 9px;
  border-left: 2px solid var(--annotamd-border);
  border-radius: 0 6px 6px 0;
  background: #fafbfc;
}

.annotamd-replies p {
  padding: 0;
  color: var(--annotamd-text);
  font-size: 13px;
}

.annotamd-reply-author {
  display: inline-flex;
  margin-right: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--annotamd-surface-blue);
  color: var(--annotamd-blue);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.annotamd-reply-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 10px 10px;
}

.annotamd-reply-editor button {
  align-self: flex-end;
}

.annotamd-comment-action-row {
  padding: 0 10px 10px;
}

.annotamd-empty-comments {
  margin-top: 48px;
  color: var(--annotamd-muted);
  text-align: center;
}

.annotamd-empty-icon {
  margin: 0 auto 12px;
  color: #a0a6b0;
  font-size: 32px;
}

.annotamd-empty-comments strong {
  display: block;
  color: var(--annotamd-text);
  font-size: 14px;
}

.annotamd-empty-comments p {
  max-width: 220px;
  margin: 8px auto 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
