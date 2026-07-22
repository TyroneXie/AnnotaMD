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
      class="annotamd-comment-list annotamd-auto-hide-scrollbar"
      :class="{
        anchored: anchoredLayoutEnabled,
        'annotamd-scrollbar-visible': scrollbarVisible
      }"
      :style="{ '--annotamd-comment-stage-height': `${commentStageHeight}px` }"
      :aria-label="t('annotamd.comments.listLabel')"
      @scroll.passive="handleCommentListScroll"
      @wheel.passive="handleCommentListWheel"
      @pointerdown="handleCommentListPointerDown"
    >
      <article
        v-if="composerOpen"
        :data-comment-id="ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID"
        class="annotamd-comment-card annotamd-composer-card active"
        :style="commentCardStyle(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID)"
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
          emphasized: activeCommentId === comment.id || selectedCommentId === comment.id,
          selected: selectedCommentId === comment.id,
          compact: !isCommentExpanded(comment),
          'local-scroll': localScrollCommentId === comment.id
        }"
        :style="commentCardStyle(comment.id)"
        @mouseenter="commentStore.setActiveComment(comment.id)"
        @mouseleave="clearActiveComment(comment.id)"
        @wheel="handleCommentCardWheel($event, comment)"
        @click="selectComment(comment.id)"
      >
        <div class="annotamd-comment-row">
          <span class="annotamd-comment-scope">{{ t('annotamd.comments.selectionScope') }}</span>
          <div class="annotamd-comment-card-actions">
            <div
              v-if="selectedCommentId === comment.id"
              class="annotamd-comment-navigation"
            >
              <button
                class="annotamd-comment-next"
                type="button"
                :title="t('annotamd.comments.nextComment')"
                :aria-label="t('annotamd.comments.nextComment')"
                :disabled="!canNavigateComment(comment.id, 1)"
                @click.stop="navigateComment(comment.id, 1)"
              >
                <ArrowDown aria-hidden="true" />
              </button>
              <button
                class="annotamd-comment-previous"
                type="button"
                :title="t('annotamd.comments.previousComment')"
                :aria-label="t('annotamd.comments.previousComment')"
                :disabled="!canNavigateComment(comment.id, -1)"
                @click.stop="navigateComment(comment.id, -1)"
              >
                <ArrowUp aria-hidden="true" />
              </button>
            </div>
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

        <div
          v-show="isCommentExpanded(comment) || !comment.replies.length"
          class="annotamd-thread-message annotamd-root-message"
        >
          <span class="annotamd-message-author">{{ t('annotamd.comments.userAuthor') }}</span>
          <time
            class="annotamd-message-time"
            :datetime="new Date(comment.createdAt).toISOString()"
          >{{ formatMessageTime(comment.createdAt) }}</time>
          <textarea
            v-if="editingId === comment.id"
            v-model="editBody"
            class="annotamd-inline-editor"
            rows="3"
          />
          <p v-else>{{ comment.body }}</p>
          <div class="annotamd-message-actions">
            <template v-if="editingId === comment.id">
              <button
                type="button"
                :disabled="!editBody.trim()"
                @click="saveEdit(comment.id)"
              >
                {{ t('annotamd.comments.save') }}
              </button>
              <button type="button" @click="cancelEdit">
                {{ t('annotamd.comments.cancel') }}
              </button>
            </template>
            <template v-else>
              <button type="button" @click="startCommentEdit(comment.id, comment.body)">
                {{ t('annotamd.comments.edit') }}
              </button>
              <button type="button" @click="commentStore.deleteComment(filePath, comment.id)">
                {{ t('annotamd.comments.delete') }}
              </button>
            </template>
          </div>
        </div>

        <div
          v-if="comment.replies.length"
          class="annotamd-replies"
        >
          <article
            v-for="reply in comment.replies"
            :key="reply.id"
            v-show="isCommentExpanded(comment) || reply.id === latestReplyId(comment)"
            :data-reply-id="reply.id"
            class="annotamd-thread-message annotamd-reply-message"
            :class="`author-${reply.author}`"
          >
            <span class="annotamd-message-author">
              {{ t(reply.author === 'agent'
                ? 'annotamd.comments.agentAuthor'
                : 'annotamd.comments.userAuthor') }}
            </span>
            <time
              class="annotamd-message-time"
              :datetime="new Date(reply.createdAt).toISOString()"
            >{{ formatMessageTime(reply.createdAt) }}</time>
            <textarea
              v-if="editingReplyId === reply.id"
              v-model="editReplyBody"
              class="annotamd-inline-editor"
              rows="3"
            />
            <p v-else>{{ reply.body }}</p>
            <div
              v-if="reply.author === 'user'"
              class="annotamd-message-actions"
            >
              <template v-if="editingReplyId === reply.id">
                <button
                  type="button"
                  :disabled="!editReplyBody.trim()"
                  @click="saveReplyEdit(comment.id, reply.id)"
                >
                  {{ t('annotamd.comments.save') }}
                </button>
                <button type="button" @click="cancelReplyEdit">
                  {{ t('annotamd.comments.cancel') }}
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  @click="startReplyEdit(reply.id, reply.body)"
                >
                  {{ t('annotamd.comments.edit') }}
                </button>
                <button type="button" @click="deleteReply(comment.id, reply.id)">
                  {{ t('annotamd.comments.delete') }}
                </button>
              </template>
            </div>
          </article>
        </div>

        <button
          v-if="commentNeedsCollapse(comment) && !isCommentExpanded(comment)"
          class="annotamd-thread-toggle"
          type="button"
          :aria-expanded="false"
          @click.stop="toggleCommentExpanded(comment)"
        >
          {{ t('annotamd.comments.expandThread', { count: commentMessageCount(comment) }) }}
        </button>

        <div
          v-if="isCommentExpanded(comment)"
          class="annotamd-reply-editor"
          @click.stop
        >
          <textarea
            v-model="replyBodies[comment.id]"
            rows="1"
            :placeholder="t('annotamd.comments.replyPlaceholder')"
            @focus="startReply(comment.id)"
            @blur="stopReply(comment.id)"
            @input="resizeReplyEditor"
          />
        </div>

        <div
          v-if="isCommentExpanded(comment) &&
            (commentNeedsCollapse(comment) || replyingId === comment.id)"
          class="annotamd-comment-action-row"
        >
          <button
            v-if="commentNeedsCollapse(comment)"
            class="annotamd-thread-toggle"
            type="button"
            :aria-expanded="true"
            @click.stop="toggleCommentExpanded(comment)"
          >
            {{ t('annotamd.comments.collapseThread') }}
          </button>
          <div
            v-if="replyingId === comment.id"
            class="annotamd-reply-controls"
          >
            <button
              class="annotamd-reply-cancel"
              type="button"
              @mousedown.prevent
              @click.stop="cancelReply(comment.id, $event)"
            >
              {{ t('annotamd.comments.cancel') }}
            </button>
            <button
              class="annotamd-reply-submit"
              type="button"
              :disabled="!(replyBodies[comment.id] ?? '').trim()"
              @mousedown.prevent
              @click.stop="saveReply(comment.id, $event)"
            >
              {{ t('annotamd.comments.reply') }}
            </button>
          </div>
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
import {
  useAnnotaMDCommentsStore,
  type AnnotaMDComment
} from '@/store/annotamdComments'
import bus from '@/bus'
import {
  isCommentAnchorVisible,
  layoutCommentBubbles,
  type CommentBubbleLayout
} from '@/util/commentBubbleLayout'
import {
  ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID,
  type CommentAnchorRect
} from '@/util/annotamdCommentHighlights'
import { useI18n } from 'vue-i18n'
import type { AnnotaMDMcpStatus } from '@shared/types/comments'
import { useAutoHideScrollbar } from '@/composables/useAutoHideScrollbar'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { formatCommentTimestamp } from '@/util/annotamdCommentTime'

const COMMENT_ANCHOR_VIEWPORT_RATIO = 0.28
const LOCAL_SCROLL_BOTTOM_GAP = 12
const LOCAL_SCROLL_MIN_HEIGHT = 180

const editorStore = useEditorStore()
const commentStore = useAnnotaMDCommentsStore()
const { t, locale } = useI18n()

const formatMessageTime = (createdAt: number): string =>
  formatCommentTimestamp(createdAt, locale.value)

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
const editingReplyId = ref<string | null>(null)
const editReplyBody = ref('')
const replyingId = ref<string | null>(null)
const replyBodies = ref<Record<string, string>>({})
const selectedCommentId = ref<string | null>(null)
const collapsedCommentId = ref<string | null>(null)
const localScrollCommentId = ref<string | null>(null)
const localScrollMaxHeight = ref(0)
const composerTextarea = ref<HTMLTextAreaElement | null>(null)
const commentList = ref<HTMLElement | null>(null)
const commentAnchors = ref<CommentAnchorRect[]>([])
const commentLayout = ref<CommentBubbleLayout>({ positions: {}, height: 0 })
const hiddenCommentCardIds = ref<Set<string>>(new Set())
const sharedScrollHeight = ref(0)
let commentResizeObserver: ResizeObserver | null = null
let commentLayoutFrame: number | null = null
let commentLayoutDisposed = false
let sharedEditorScroller: HTMLElement | null = null
let syncingFromEditor = false
const commentCardHeights = new Map<string, number>()
const observedCommentCards = new Map<string, HTMLElement>()
let stopMcpStatusListener: (() => void) | null = null
const mcpStatus = ref<AnnotaMDMcpStatus>({ enabled: false, running: false, clients: [] })
const {
  scrollbarVisible,
  revealScrollbar,
  handleScrollbarPointerDown: handleAutoHideScrollbarPointerDown
} = useAutoHideScrollbar()

const filePath = computed(() => currentFile.value?.pathname ?? '')
const comments = computed(() => commentStore.commentsForFile(filePath.value))
const selectionComments = computed(() => comments.value.filter((comment) => comment.scope === 'selection'))
const orderedAnchoredCommentIds = computed(() => {
  const selectionIds = new Set(selectionComments.value.map((comment) => comment.id))
  return commentAnchors.value
    .filter((anchor) => selectionIds.has(anchor.id))
    .sort((first, second) => first.top - second.top)
    .map((anchor) => anchor.id)
})
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
  Object.keys(commentLayout.value.positions).length > 0 || hiddenCommentCardIds.value.size > 0
)
const commentStageHeight = computed(() => (
  Math.max(sharedScrollHeight.value, commentLayout.value.height)
))

const commentCardStyle = (commentId: string): Record<string, string> => {
  if (hiddenCommentCardIds.value.has(commentId)) {
    return { visibility: 'hidden', pointerEvents: 'none' }
  }
  const style: Record<string, string> = {}
  if (anchoredLayoutEnabled.value) {
    const top = commentLayout.value.positions[commentId]
    if (Number.isFinite(top)) style.top = `${top}px`
  }
  if (localScrollCommentId.value === commentId && localScrollMaxHeight.value > 0) {
    style.maxHeight = `${localScrollMaxHeight.value}px`
  }
  return style
}

const commentMessageCount = (comment: AnnotaMDComment): number => 1 + comment.replies.length

const latestReplyId = (comment: AnnotaMDComment): string | null => (
  comment.replies.at(-1)?.id ?? null
)

const commentHasActiveInteraction = (comment: AnnotaMDComment): boolean => (
  editingId.value === comment.id ||
  replyingId.value === comment.id ||
  comment.replies.some((reply) => editingReplyId.value === reply.id)
)

const isCommentExpanded = (comment: AnnotaMDComment): boolean => (
  commentHasActiveInteraction(comment) ||
  (selectedCommentId.value === comment.id && collapsedCommentId.value !== comment.id)
)

const commentNeedsCollapse = (comment: AnnotaMDComment): boolean => (
  commentMessageCount(comment) > 1 ||
  comment.body.length + comment.replies.reduce((total, reply) => total + reply.body.length, 0) > 180
)

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
  if (!list) return

  syncObservedCommentCards(list)
  const listRect = list.getBoundingClientRect()
  const anchorById = new Map(commentAnchors.value.map((anchor) => [anchor.id, anchor]))
  const hiddenIds = new Set<string>()
  const bubbles = selectionComments.value.flatMap((comment) => {
    const anchor = anchorById.get(comment.id)
    return [{
      id: comment.id,
      anchorTop: anchor ? list.scrollTop + anchor.top - listRect.top : null,
      height: commentCardHeights.get(comment.id) ?? 120
    }]
  })
  if (composerOpen.value) {
    const anchor = anchorById.get(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID)
    bubbles.push({
      id: ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID,
      anchorTop: anchor ? list.scrollTop + anchor.top - listRect.top : null,
      height: commentCardHeights.get(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID) ?? 220
    })
  }
  hiddenCommentCardIds.value = hiddenIds
  commentLayout.value = layoutCommentBubbles(
    bubbles,
    list.scrollTop,
    Math.max(sharedScrollHeight.value, list.clientHeight),
    12,
    selectedCommentId.value
  )
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
  if (activeCommentId.value === commentId) {
    commentStore.setActiveComment(selectedCommentId.value)
  }
}

const resetLocalCommentScroll = (commentId?: string): void => {
  if (commentId && localScrollCommentId.value !== commentId) return
  localScrollCommentId.value = null
  localScrollMaxHeight.value = 0
}

const wheelTargetsLocalComment = (event: WheelEvent): boolean => {
  const target = event.target
  if (!(target instanceof Element) || !localScrollCommentId.value) return false
  return target.closest<HTMLElement>('.annotamd-comment-card')?.dataset.commentId
    === localScrollCommentId.value
}

const handleCommentListWheel = (event: WheelEvent): void => {
  revealScrollbar()
  if (wheelTargetsLocalComment(event)) return
  resetLocalCommentScroll()
}

const handleCommentListPointerDown = (event: PointerEvent): void => {
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect()
    const onVerticalScrollbar = target.scrollHeight > target.clientHeight
      && event.clientX >= rect.right - 12
    if (onVerticalScrollbar) resetLocalCommentScroll()
  }
  handleAutoHideScrollbarPointerDown(event)
}

const handleEditorWheel = (event: WheelEvent): void => {
  if (wheelTargetsLocalComment(event)) return
  resetLocalCommentScroll()
}

const wheelDeltaInPixels = (event: WheelEvent, pageHeight: number): number => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 20
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * pageHeight
  return event.deltaY
}

const handleCommentCardWheel = (
  event: WheelEvent,
  comment: AnnotaMDComment
): void => {
  if (selectedCommentId.value !== comment.id || !isCommentExpanded(comment)) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

  const card = event.currentTarget as HTMLElement
  const list = commentList.value
  if (!list) return
  const delta = wheelDeltaInPixels(event, card.clientHeight)

  if (localScrollCommentId.value === comment.id) {
    event.preventDefault()
    event.stopPropagation()
    card.scrollTop += delta
    return
  }

  const listRect = list.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  const visibleCardTop = Math.max(cardRect.top, listRect.top)
  const availableHeight = Math.floor(
    listRect.bottom - visibleCardTop - LOCAL_SCROLL_BOTTOM_GAP
  )
  if (availableHeight < LOCAL_SCROLL_MIN_HEIGHT || card.scrollHeight <= availableHeight + 1) return

  event.preventDefault()
  event.stopPropagation()
  localScrollCommentId.value = comment.id
  localScrollMaxHeight.value = availableHeight
  void nextTick().then(() => {
    if (localScrollCommentId.value !== comment.id || !card.isConnected) return
    card.scrollTop += delta
    updateCommentBubbleLayout()
  })
}

const scrollCommentAnchorIntoView = (
  commentId: string,
  forcePosition = false
): void => {
  if (!sharedEditorScroller) return
  const anchor = commentAnchors.value.find((item) => item.id === commentId)
  if (!anchor) return
  const viewport = sharedEditorScroller.getBoundingClientRect()
  if (!forcePosition && isCommentAnchorVisible(
    anchor.top,
    anchor.bottom,
    viewport.top,
    viewport.bottom
  )) return

  const targetTop = viewport.top + viewport.height * COMMENT_ANCHOR_VIEWPORT_RATIO
  sharedEditorScroller.scrollTo({
    top: Math.max(0, sharedEditorScroller.scrollTop + anchor.top - targetTop),
    behavior: 'smooth'
  })
}

const selectComment = async(
  commentId: string,
  forceAnchorPosition = false
): Promise<void> => {
  if (localScrollCommentId.value !== commentId) resetLocalCommentScroll()
  selectedCommentId.value = commentId
  collapsedCommentId.value = null
  commentStore.setActiveComment(commentId)
  await nextTick()
  recalculateCommentBubbleLayout()
  await nextTick()
  scrollCommentAnchorIntoView(commentId, forceAnchorPosition)
}

const toggleCommentExpanded = (comment: AnnotaMDComment): void => {
  if (commentHasActiveInteraction(comment)) return
  resetLocalCommentScroll(comment.id)
  const preservedScrollTop = sharedEditorScroller?.scrollTop
  if (isCommentExpanded(comment)) {
    collapsedCommentId.value = comment.id
  } else {
    selectedCommentId.value = comment.id
    collapsedCommentId.value = null
    commentStore.setActiveComment(comment.id)
  }
  if (preservedScrollTop != null) {
    void nextTick().then(() => {
      if (sharedEditorScroller) sharedEditorScroller.scrollTop = preservedScrollTop
      if (commentList.value) commentList.value.scrollTop = preservedScrollTop
    })
  }
}

const canNavigateComment = (commentId: string, offset: -1 | 1): boolean => {
  const index = orderedAnchoredCommentIds.value.indexOf(commentId)
  const targetIndex = index + offset
  return index >= 0 && targetIndex >= 0 && targetIndex < orderedAnchoredCommentIds.value.length
}

const navigateComment = (commentId: string, offset: -1 | 1): void => {
  const index = orderedAnchoredCommentIds.value.indexOf(commentId)
  const targetId = orderedAnchoredCommentIds.value[index + offset]
  if (targetId) void selectComment(targetId, true)
}

const syncSharedScrollFromEditor = (): void => {
  const list = commentList.value
  if (!list || !sharedEditorScroller) return
  sharedScrollHeight.value = sharedEditorScroller.scrollHeight
  const editorMaxScrollTop = Math.max(
    0,
    sharedEditorScroller.scrollHeight - sharedEditorScroller.clientHeight
  )
  if (sharedEditorScroller.scrollTop >= editorMaxScrollTop - 1 &&
    list.scrollTop > editorMaxScrollTop) return
  if (Math.abs(list.scrollTop - sharedEditorScroller.scrollTop) < 1) return
  syncingFromEditor = true
  list.scrollTop = sharedEditorScroller.scrollTop
}

const bindSharedEditorScroller = (): void => {
  const next = document.querySelector<HTMLElement>('.editor-component')
  if (next === sharedEditorScroller) {
    syncSharedScrollFromEditor()
    return
  }
  sharedEditorScroller?.removeEventListener('scroll', syncSharedScrollFromEditor)
  sharedEditorScroller?.removeEventListener('wheel', handleEditorWheel)
  sharedEditorScroller = next
  sharedEditorScroller?.addEventListener('scroll', syncSharedScrollFromEditor, { passive: true })
  sharedEditorScroller?.addEventListener('wheel', handleEditorWheel, { passive: true })
  syncSharedScrollFromEditor()
}

const handleCommentListScroll = (): void => {
  const list = commentList.value
  if (!list || !sharedEditorScroller) return
  revealScrollbar()
  if (syncingFromEditor && Math.abs(list.scrollTop - sharedEditorScroller.scrollTop) < 1) {
    syncingFromEditor = false
  } else {
    const editorMaxScrollTop = Math.max(
      0,
      sharedEditorScroller.scrollHeight - sharedEditorScroller.clientHeight
    )
    const editorScrollTop = Math.min(list.scrollTop, editorMaxScrollTop)
    if (Math.abs(sharedEditorScroller.scrollTop - editorScrollTop) >= 1) {
      sharedEditorScroller.scrollTop = editorScrollTop
    }
  }
  updateCommentBubbleLayout()
}

const openAgentSettings = (): void => {
  window.electron.ipcRenderer.send('mt::open-setting-window', 'agent')
}

const openComposer = (): void => {
  composerOpen.value = true
  nextTick(() => {
    composerTextarea.value?.focus({ preventScroll: true })
    scrollCommentAnchorIntoView(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID)
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
    const previousIds = new Set(selectionComments.value.map((comment) => comment.id))
    commentStore.addSelectionComment(filePath.value, draftBody.value)
    const addedComment = selectionComments.value.find((comment) => !previousIds.has(comment.id))
    if (addedComment) {
      selectedCommentId.value = addedComment.id
      collapsedCommentId.value = null
      commentStore.setActiveComment(addedComment.id)
    }
  }
  closeComposer()
}

const saveEdit = (id: string): void => {
  if (!filePath.value) return
  commentStore.updateComment(filePath.value, id, editBody.value)
  cancelEdit()
}

const cancelEdit = (): void => {
  editingId.value = null
  editBody.value = ''
}

const startCommentEdit = (commentId: string, body: string): void => {
  cancelEdit()
  cancelReplyEdit()
  editingId.value = commentId
  editBody.value = body
}

const startReplyEdit = (replyId: string, body: string): void => {
  cancelEdit()
  cancelReplyEdit()
  editingReplyId.value = replyId
  editReplyBody.value = body
}

const saveReplyEdit = (commentId: string, replyId: string): void => {
  if (!filePath.value) return
  commentStore.updateReply(filePath.value, commentId, replyId, editReplyBody.value)
  cancelReplyEdit()
}

const cancelReplyEdit = (): void => {
  editingReplyId.value = null
  editReplyBody.value = ''
}

const deleteReply = (commentId: string, replyId: string): void => {
  if (!filePath.value) return
  if (editingReplyId.value === replyId) cancelReplyEdit()
  commentStore.deleteReply(filePath.value, commentId, replyId)
}

const startReply = (id: string): void => {
  replyingId.value = id
}

const stopReply = (id: string): void => {
  if (replyingId.value === id) replyingId.value = null
}

const resizeReplyEditor = (event: Event): void => {
  const textarea = event.currentTarget as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`
  textarea.style.overflowY = textarea.scrollHeight > 96 ? 'auto' : 'hidden'
}

const resetReplyEditor = (event: MouseEvent): void => {
  const card = (event.currentTarget as HTMLElement).closest('.annotamd-comment-card')
  const textarea = card?.querySelector<HTMLTextAreaElement>('.annotamd-reply-editor textarea')
  if (!textarea) return
  textarea.style.height = ''
  textarea.style.overflowY = 'hidden'
  textarea.blur()
}

const cancelReply = (id: string, event: MouseEvent): void => {
  replyBodies.value[id] = ''
  replyingId.value = null
  resetReplyEditor(event)
}

const saveReply = (id: string, event: MouseEvent): void => {
  if (!filePath.value) return
  commentStore.addReply(filePath.value, id, replyBodies.value[id] ?? '')
  replyBodies.value[id] = ''
  replyingId.value = null
  resetReplyEditor(event)
}

const focusCommentCard = async (commentId: string): Promise<void> => {
  composerOpen.value = false
  draftBody.value = ''
  await selectComment(commentId)
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
  [
    selectionComments,
    editingId,
    editingReplyId,
    replyingId,
    composerOpen,
    selectedCommentId,
    collapsedCommentId
  ],
  updateCommentBubbleLayout,
  { deep: true }
)

watch(selectionComments, (nextComments) => {
  if (selectedCommentId.value && !nextComments.some(
    (comment) => comment.id === selectedCommentId.value
  )) {
    selectedCommentId.value = null
    collapsedCommentId.value = null
    resetLocalCommentScroll()
    commentStore.setActiveComment(null)
  }
})

watch(filePath, () => {
  commentStore.setActiveComment(null)
  selectedCommentId.value = null
  collapsedCommentId.value = null
  resetLocalCommentScroll()
  replyingId.value = null
  replyBodies.value = {}
  commentAnchors.value = []
  commentLayout.value = { positions: {}, height: 0 }
  hiddenCommentCardIds.value = new Set()
  void nextTick(bindSharedEditorScroller)
})

onMounted(() => {
  bindSharedEditorScroller()
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
  sharedEditorScroller?.removeEventListener('scroll', syncSharedScrollFromEditor)
  sharedEditorScroller?.removeEventListener('wheel', handleEditorWheel)
  sharedEditorScroller = null
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
  position: relative;
  z-index: 1;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: var(--annotamd-editor-tab-height, 28px);
  min-height: var(--annotamd-editor-tab-height, 28px);
  box-sizing: border-box;
  padding: 0 12px;
  box-shadow: 0 0 9px 2px rgb(0 0 0 / 10%);
}

.annotamd-comment-title {
  color: var(--annotamd-ink);
  font-size: 14px;
  font-weight: 650;
  line-height: 20px;
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
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0 8px;
}

.annotamd-comment-list::after {
  display: block;
  height: var(--annotamd-comment-stage-height);
  content: '';
}

.annotamd-comment-list.anchored .annotamd-comment-card[data-comment-id] {
  position: absolute;
  right: 8px;
  left: 8px;
  margin-bottom: 0;
  transition: border-color 120ms ease, background-color 120ms ease;
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

.annotamd-comment-card.selected {
  border-color: var(--annotamd-blue);
}

.annotamd-comment-card.local-scroll {
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(68, 76, 91, 0.38) transparent;
}

.annotamd-comment-card.local-scroll::-webkit-scrollbar {
  width: 6px;
  background: transparent;
}

.annotamd-comment-card.local-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.annotamd-comment-card.local-scroll::-webkit-scrollbar-thumb {
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(68, 76, 91, 0.38);
  background-clip: padding-box;
}

.annotamd-comment-card.local-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(68, 76, 91, 0.56);
  background-clip: padding-box;
}

.annotamd-comment-card.local-scroll .annotamd-comment-row {
  position: sticky;
  z-index: 2;
  top: 0;
  padding-bottom: 8px;
  border-radius: 9px 9px 0 0;
  background: inherit;
}

.annotamd-comment-card.resolved {
  opacity: 0.72;
}

.annotamd-comment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 10px 0;
}

.annotamd-comment-scope {
  min-width: 0;
  color: var(--annotamd-blue);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.annotamd-comment-card-actions,
.annotamd-comment-action-row,
.annotamd-message-actions {
  display: flex;
  gap: 4px;
}

.annotamd-comment-card-actions {
  flex: 0 0 auto;
  align-items: center;
}

.annotamd-comment-navigation {
  display: flex;
  gap: 0;
}

.annotamd-comment-card-actions button,
.annotamd-comment-action-row button,
.annotamd-message-actions button {
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--annotamd-blue);
  font-size: 12px;
  white-space: nowrap;
}

.annotamd-comment-card-actions button:hover,
.annotamd-comment-action-row button:hover,
.annotamd-message-actions button:hover {
  background: var(--annotamd-surface-blue);
  color: var(--annotamd-blue);
}

.annotamd-comment-card-actions button:disabled {
  background: transparent;
  color: #b5bac3;
  cursor: default;
}

.annotamd-comment-navigation button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  padding: 0;
}

.annotamd-comment-navigation svg {
  width: 15px;
  height: 15px;
}

.annotamd-composer-card textarea,
.annotamd-inline-editor {
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
.annotamd-inline-editor:focus {
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
.annotamd-reply-submit {
  padding: 0 12px;
  background: var(--annotamd-blue);
  color: #fff;
}

.annotamd-composer-actions button:disabled,
.annotamd-reply-submit:disabled {
  background: #edf1f7;
  color: #a0a6b0;
}

.annotamd-comment-card blockquote {
  overflow: hidden;
  margin: 8px 10px 0;
  padding: 7px 9px;
  border-left: 3px solid var(--annotamd-blue);
  background: var(--annotamd-surface-blue);
  color: var(--annotamd-text);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.annotamd-comment-card p {
  margin: 0;
  padding: 9px 10px 11px;
  color: var(--annotamd-text);
  font-size: 14px;
  line-height: 1.5;
}

.annotamd-thread-message {
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid var(--annotamd-border);
  border-radius: 7px;
  background: #fafbfc;
}

.annotamd-root-message {
  margin: 0 10px 10px;
  background: var(--annotamd-surface);
}

.annotamd-thread-message p {
  padding: 6px 0 7px;
  white-space: pre-wrap;
}

.annotamd-thread-message .annotamd-inline-editor {
  width: 100%;
  margin: 7px 0;
}

.annotamd-comment-card.compact .annotamd-thread-message p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.annotamd-comment-card.compact .annotamd-message-actions {
  display: none;
}

.annotamd-thread-toggle {
  height: 28px;
  margin: 0 10px 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--annotamd-blue);
  font-size: 12px;
  cursor: pointer;
}

.annotamd-thread-toggle:hover {
  text-decoration: underline;
}

.annotamd-comment-action-row .annotamd-thread-toggle {
  margin: 0;
}

.annotamd-message-actions {
  justify-content: flex-end;
  min-height: 24px;
}

.annotamd-message-author {
  display: inline-flex;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--annotamd-surface-blue);
  color: var(--annotamd-blue);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.annotamd-message-time {
  margin-left: 5px;
  color: var(--annotamd-muted);
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

.annotamd-replies {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 10px 10px;
}

.annotamd-reply-message.author-agent {
  background: #f7f9ff;
}

.annotamd-reply-message p {
  color: var(--annotamd-text);
  font-size: 13px;
}

.annotamd-reply-editor {
  margin: 0 10px 10px;
}

.annotamd-reply-editor textarea {
  display: block;
  width: 100%;
  min-height: 34px;
  max-height: 96px;
  box-sizing: border-box;
  padding: 6px 9px;
  overflow-y: hidden;
  resize: none;
  border: 1px solid var(--annotamd-border);
  border-radius: 6px;
  outline: none;
  background: var(--annotamd-surface);
  color: var(--annotamd-text);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}

.annotamd-reply-editor textarea:focus {
  border-color: var(--annotamd-blue);
  box-shadow: 0 0 0 2px rgba(51, 112, 255, 0.12);
}

.annotamd-comment-action-row {
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 10px;
}

.annotamd-reply-controls {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.annotamd-comment-action-row .annotamd-reply-cancel,
.annotamd-comment-action-row .annotamd-reply-submit {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--annotamd-border);
  border-radius: 5px;
}

.annotamd-comment-action-row .annotamd-reply-cancel {
  background: var(--annotamd-surface);
  color: var(--annotamd-text);
}

.annotamd-comment-action-row .annotamd-reply-submit {
  border-color: var(--annotamd-blue);
  background: var(--annotamd-blue);
  color: #fff;
}

.annotamd-comment-action-row .annotamd-reply-submit:disabled {
  border-color: #dfe3ea;
  background: #edf1f7;
  color: #a0a6b0;
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
