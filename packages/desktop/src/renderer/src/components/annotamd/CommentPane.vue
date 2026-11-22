<template>
  <aside class="annotamd-comment-pane">
    <header class="annotamd-comment-header">
      <div class="annotamd-comment-title">
        {{ t('annotamd.comments.titleWithCount', { count: selectionComments.length }) }}
      </div>
      <div class="annotamd-comment-header-actions">
        <details
          v-if="comments.length"
          ref="resolveAllMenu"
          class="annotamd-resolve-all"
          @toggle="handleResolveAllMenuToggle"
        >
          <summary
            :title="t('annotamd.comments.bulkResolve')"
            :aria-label="t('annotamd.comments.bulkResolve')"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="m3.5 6.5 1.7 1.7 3-3" />
              <path d="M11 7h9" />
              <path d="m3.5 12 1.7 1.7 3-3" />
              <path d="M11 12.5h9" />
              <path d="m3.5 17.5 1.7 1.7 3-3" />
              <path d="M11 18h9" />
            </svg>
          </summary>
          <div class="annotamd-resolve-all-popover">
            <button
              class="resolve-all"
              type="button"
              :disabled="hasRunningAgentTurn"
              @click.stop="resolveAllComments"
            >
              {{ resolveAllArmed
                ? t('annotamd.comments.resolveAllConfirm')
                : t('annotamd.comments.resolveAll') }}
            </button>
          </div>
        </details>
        <el-tooltip
          :content="t('annotamd.comments.closePane')"
          placement="bottom"
          :show-after="150"
        >
          <span class="annotamd-comment-tooltip-anchor">
            <button
              class="annotamd-pane-close"
              type="button"
              :aria-label="t('annotamd.comments.closePane')"
              @click="commentStore.setPaneVisible(false)"
            >
              <el-icon><Close /></el-icon>
            </button>
          </span>
        </el-tooltip>
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
      @pointerdown="handleAutoHideScrollbarPointerDown"
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
          @input="syncComposerDraftState"
          @keydown.meta.enter.prevent="submitComment"
          @keydown.ctrl.enter.prevent="submitComment"
        />
        <div class="annotamd-comment-action-row annotamd-composer-actions">
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
          emphasized: activeCommentId === comment.id || selectedCommentId === comment.id,
          selected: selectedCommentId === comment.id,
          compact: !isCommentExpanded(comment),
          'temporary-detached': comment.temporaryDetached,
          'detached-tray-card': comment.temporaryDetached,
          'local-scroll': localScrollCommentId === comment.id,
          'focus-reading': focusReadingCommentId === comment.id
        }"
        :style="commentCardStyle(comment)"
        @mouseenter="commentStore.setActiveComment(comment.id)"
        @mouseleave="clearActiveComment(comment.id)"
        @click="handleCommentCardClick(comment.id, $event)"
      >
        <div class="annotamd-comment-row">
          <span class="annotamd-comment-scope">
            {{ t(comment.temporaryDetached
              ? 'annotamd.comments.detachedTitle'
              : 'annotamd.comments.selectionScope') }}
          </span>
          <div class="annotamd-comment-card-actions">
            <div
              v-if="selectedCommentId === comment.id && !comment.temporaryDetached"
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
              type="button"
              :disabled="agentTurns.isRunning(comment.id)"
              @click="commentStore.deleteComment(filePath, comment.id)"
            >
              {{ t('annotamd.comments.markResolved') }}
            </button>
          </div>
        </div>

        <blockquote>{{ comment.quote }}</blockquote>
        <p
          v-if="comment.temporaryDetached"
          class="annotamd-detached-note"
        >
          {{ t('annotamd.comments.detachedDescription') }}
        </p>

        <div
          v-show="isCommentExpanded(comment) || !comment.replies.length"
          class="annotamd-thread-message annotamd-root-message"
        >
          <div class="annotamd-message-header">
            <div class="annotamd-message-meta">
              <span class="annotamd-message-author">
                {{ t('annotamd.comments.userAuthor') }}
              </span>
              <time
                class="annotamd-message-time"
                :datetime="new Date(comment.createdAt).toISOString()"
              >{{ formatMessageTime(comment.createdAt) }}</time>
            </div>
            <div class="annotamd-message-actions">
              <template v-if="editingId === comment.id">
                <button
                  type="button"
                  :disabled="!editBody.trim()"
                  @click="saveEdit(comment.id)"
                >
                  {{ t('annotamd.comments.save') }}
                </button>
                <button
                  type="button"
                  @click="cancelEdit"
                >
                  {{ t('annotamd.comments.cancel') }}
                </button>
              </template>
              <template v-else>
                <details class="annotamd-message-overflow">
                  <summary
                    role="button"
                    :title="t('annotamd.comments.moreActions')"
                    :aria-label="t('annotamd.comments.moreActions')"
                    @click.stop
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        cx="5"
                        cy="12"
                        r="1.6"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="1.6"
                      />
                      <circle
                        cx="19"
                        cy="12"
                        r="1.6"
                      />
                    </svg>
                  </summary>
                  <div class="annotamd-message-menu">
                    <button
                      type="button"
                      @click.stop="startCommentEdit(comment.id, comment.body)"
                    >
                      {{ t('annotamd.comments.edit') }}
                    </button>
                    <button
                      type="button"
                      :disabled="agentTurns.isRunning(comment.id)"
                      @click.stop="deleteComment(comment.id)"
                    >
                      {{ t('annotamd.comments.delete') }}
                    </button>
                  </div>
                </details>
              </template>
            </div>
          </div>
          <textarea
            v-if="editingId === comment.id"
            v-model="editBody"
            class="annotamd-inline-editor"
            rows="3"
          />
          <p v-else>
            {{ comment.body }}
          </p>
        </div>

        <div
          v-if="comment.replies.length"
          class="annotamd-replies"
        >
          <article
            v-for="reply in comment.replies"
            v-show="isCommentExpanded(comment) || reply.id === latestReplyId(comment)"
            :key="reply.id"
            :data-reply-id="reply.id"
            class="annotamd-thread-message annotamd-reply-message"
            :class="`author-${reply.author}`"
          >
            <div class="annotamd-message-header">
              <div class="annotamd-message-meta">
                <span class="annotamd-message-author">
                  {{ t(reply.author === 'agent'
                    ? 'annotamd.comments.agentAuthor'
                    : 'annotamd.comments.userAuthor') }}
                </span>
                <time
                  class="annotamd-message-time"
                  :datetime="new Date(reply.createdAt).toISOString()"
                >{{ formatMessageTime(reply.createdAt) }}</time>
              </div>
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
                  <button
                    type="button"
                    @click="cancelReplyEdit"
                  >
                    {{ t('annotamd.comments.cancel') }}
                  </button>
                </template>
                <template v-else>
                  <details class="annotamd-message-overflow">
                    <summary
                      role="button"
                      :title="t('annotamd.comments.moreActions')"
                      :aria-label="t('annotamd.comments.moreActions')"
                      @click.stop
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle
                          cx="5"
                          cy="12"
                          r="1.6"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="1.6"
                        />
                        <circle
                          cx="19"
                          cy="12"
                          r="1.6"
                        />
                      </svg>
                    </summary>
                    <div class="annotamd-message-menu">
                      <button
                        type="button"
                        @click.stop="startReplyEdit(reply.id, reply.body)"
                      >
                        {{ t('annotamd.comments.edit') }}
                      </button>
                      <button
                        type="button"
                        @click.stop="deleteReply(comment.id, reply.id)"
                      >
                        {{ t('annotamd.comments.delete') }}
                      </button>
                    </div>
                  </details>
                </template>
              </div>
            </div>
            <textarea
              v-if="editingReplyId === reply.id"
              v-model="editReplyBody"
              class="annotamd-inline-editor"
              rows="3"
            />
            <p v-else>
              {{ reply.body }}
            </p>
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
            @input="resizeReplyEditor(comment.id, $event)"
          />
        </div>

        <div
          v-if="isCommentExpanded(comment) &&
            (commentNeedsCollapse(comment) || replyingId === comment.id ||
              agentTurns.isRunning(comment.id))"
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
              :disabled="!(replyBodies[comment.id] ?? '').trim() || agentTurns.isRunning(comment.id)"
              @mousedown.prevent
              @click.stop="saveReply(comment.id, $event)"
            >
              {{ t('annotamd.comments.reply') }}
            </button>
          </div>
          <span
            v-if="agentTurns.isRunning(comment.id) && replyingId !== comment.id"
            class="annotamd-agent-turn-status"
          >
            {{ t('annotamd.comments.agentRunning') }}
          </span>
          <button
            v-if="agentTurns.isRunning(comment.id)"
            class="annotamd-agent-turn-stop"
            type="button"
            @click.stop="agentTurns.stop(comment.id)"
          >
            {{ t('annotamd.comments.agentStop') }}
          </button>
        </div>

        <p
          v-if="agentTurns.errorFor(comment.id)"
          class="annotamd-agent-turn-error"
        >
          {{ agentTurns.errorFor(comment.id) }}
        </p>
      </article>

      <div
        v-if="!selectionComments.length && !composerOpen"
        class="annotamd-empty-comments"
      >
        <div class="annotamd-empty-icon">
          ☰
        </div>
        <strong>{{ t('annotamd.comments.emptyTitle') }}</strong>
        <p>{{ t('annotamd.comments.emptyDescription') }}</p>
      </div>
    </section>

    <section
      v-if="modifiedComments.length && !focusReadingCommentId"
      class="annotamd-detached-tray"
      :class="{ open: detachedTrayOpen }"
      @click.stop
    >
      <div class="annotamd-detached-tray-header">
        <button
          class="annotamd-detached-tray-toggle"
          type="button"
          :aria-expanded="detachedTrayOpen"
          @click="detachedTrayOpen = !detachedTrayOpen"
        >
          <span>{{ t('annotamd.comments.detachedTrayTitle', {
            count: modifiedComments.length
          }) }}</span>
          <ArrowDown
            v-if="detachedTrayOpen"
            aria-hidden="true"
          />
          <ArrowUp
            v-else
            aria-hidden="true"
          />
        </button>
        <button
          class="annotamd-detached-tray-resolve"
          type="button"
          :disabled="hasRunningModifiedComment"
          @click="resolveModifiedComments"
        >
          {{ t('annotamd.comments.resolveModifiedShort') }}
        </button>
      </div>
      <div
        v-if="detachedTrayOpen"
        class="annotamd-detached-tray-list"
      >
        <button
          v-for="comment in modifiedComments"
          :key="comment.id"
          class="annotamd-detached-tray-item"
          type="button"
          @click="openDetachedComment(comment.id)"
        >
          <strong>{{ comment.quote }}</strong>
          <span>{{ latestCommentMessage(comment) }}</span>
        </button>
      </div>
    </section>
    <button
      v-if="firstCommentAnchor && !composerOpen && !focusReadingCommentId && !detachedTrayOpen"
      class="annotamd-comment-jump-first"
      type="button"
      :title="t('annotamd.comments.jumpToFirstComment')"
      :aria-label="t('annotamd.comments.jumpToFirstComment')"
      @click="jumpToFirstComment"
    >
      <ArrowDown
        v-if="firstCommentBelowViewport"
        aria-hidden="true"
      />
      <ArrowUp
        v-else
        aria-hidden="true"
      />
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useAgentTurnsStore } from '@/store/agentTurns'
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
import { useAutoHideScrollbar } from '@/composables/useAutoHideScrollbar'
import { ArrowDown, ArrowUp, Close } from '@element-plus/icons-vue'
import { formatCommentTimestamp } from '@/util/annotamdCommentTime'

const COMMENT_ANCHOR_VIEWPORT_RATIO = 0.28
const LOCAL_SCROLL_BOTTOM_GAP = 12
const LOCAL_SCROLL_MIN_HEIGHT = 180
const DETACHED_TRAY_RESERVED_HEIGHT = 48
const FOCUS_READING_MAX_HEIGHT_RATIO = 2 / 3

const editorStore = useEditorStore()
const commentStore = useAnnotaMDCommentsStore()
const agentTurns = useAgentTurnsStore()
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
const focusReadingCommentId = ref<string | null>(null)
const focusReadingMaxHeight = ref(0)
const focusReadingOriginalHeight = ref(0)
const detachedTrayOpen = ref(false)
const localScrollCommentId = ref<string | null>(null)
const localScrollMaxHeight = ref(0)
const composerTextarea = ref<HTMLTextAreaElement | null>(null)
const commentList = ref<HTMLElement | null>(null)
const resolveAllMenu = ref<HTMLDetailsElement | null>(null)
const resolveAllArmed = ref(false)
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
const {
  scrollbarVisible,
  revealScrollbar,
  handleScrollbarPointerDown: handleAutoHideScrollbarPointerDown
} = useAutoHideScrollbar()

const filePath = computed(() => currentFile.value?.pathname ?? '')
const comments = computed(() => commentStore.commentsForFile(filePath.value))
const selectionComments = computed(() => comments.value.filter((comment) => comment.scope === 'selection'))
const anchoredSelectionComments = computed(() => selectionComments.value.filter(
  (comment) => !comment.temporaryDetached
))
const modifiedComments = computed(() => selectionComments.value.filter(
  (comment) => comment.temporaryDetached
))
const hasRunningAgentTurn = computed(() => comments.value.some((comment) => (
  agentTurns.isRunning(comment.id)
)))
const hasRunningModifiedComment = computed(() => modifiedComments.value.some((comment) => (
  agentTurns.isRunning(comment.id)
)))
const orderedAnchoredCommentIds = computed(() => {
  const selectionIds = new Set(anchoredSelectionComments.value.map((comment) => comment.id))
  return commentAnchors.value
    .filter((anchor) => selectionIds.has(anchor.id) && anchor.bottom > anchor.top)
    .map((anchor) => anchor.id)
})
const firstCommentAnchor = computed(() => commentAnchors.value.find(
  (anchor) => anchor.id === orderedAnchoredCommentIds.value[0]
))
const firstCommentBelowViewport = computed(() => {
  const list = commentList.value
  const anchor = firstCommentAnchor.value
  return !!anchor && !!list && anchor.top >= list.getBoundingClientRect().bottom
})
const anchoredLayoutEnabled = computed(() =>
  Object.keys(commentLayout.value.positions).length > 0 || hiddenCommentCardIds.value.size > 0
)
const commentStageHeight = computed(() => (
  Math.max(sharedScrollHeight.value, commentLayout.value.height)
))

const commentCardStyle = (comment: AnnotaMDComment | string): Record<string, string> => {
  const commentId = typeof comment === 'string' ? comment : comment.id
  if (typeof comment !== 'string' && comment.temporaryDetached &&
    focusReadingCommentId.value !== commentId) return {}
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
  if (focusReadingCommentId.value === commentId && focusReadingMaxHeight.value > 0) {
    style.maxHeight = `${focusReadingMaxHeight.value}px`
  }
  return style
}

const commentMessageCount = (comment: AnnotaMDComment): number => 1 + comment.replies.length

const latestReplyId = (comment: AnnotaMDComment): string | null => (
  comment.replies.at(-1)?.id ?? null
)

const latestCommentMessage = (comment: AnnotaMDComment): string => (
  comment.replies.at(-1)?.body ?? comment.body
)

const commentHasActiveInteraction = (comment: AnnotaMDComment): boolean => (
  editingId.value === comment.id ||
  replyingId.value === comment.id ||
  comment.replies.some((reply) => editingReplyId.value === reply.id)
)

const isCommentExpanded = (comment: AnnotaMDComment): boolean => (
  focusReadingCommentId.value === comment.id ||
  commentHasActiveInteraction(comment) ||
  (selectedCommentId.value === comment.id && collapsedCommentId.value !== comment.id)
)

const commentNeedsCollapse = (comment: AnnotaMDComment): boolean => (
  commentMessageCount(comment) > 1 ||
  comment.body.length + comment.replies.reduce((total, reply) => total + reply.body.length, 0) > 180
)

const commentCardHeight = (commentId: string, fallback: number): number => {
  const measuredHeight = commentCardHeights.get(commentId) ?? fallback
  if (localScrollCommentId.value !== commentId || localScrollMaxHeight.value <= 0) {
    return measuredHeight
  }
  return Math.min(measuredHeight, localScrollMaxHeight.value)
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
  if (!list) return

  if (focusReadingCommentId.value) {
    focusReadingMaxHeight.value = Math.floor(
      list.clientHeight * FOCUS_READING_MAX_HEIGHT_RATIO
    )
  }

  syncObservedCommentCards(list)
  const listRect = list.getBoundingClientRect()
  const anchorById = new Map(commentAnchors.value.map((anchor) => [anchor.id, anchor]))
  const hiddenIds = new Set<string>()
  const savedBubbles = anchoredSelectionComments.value.flatMap((comment) => {
    const anchor = anchorById.get(comment.id)
    const height = commentCardHeight(comment.id, 120)
    return [{
      id: comment.id,
      anchorTop: anchor ? list.scrollTop + anchor.top - listRect.top : null,
      height
    }]
  })
  const bubbles = [...savedBubbles]
  if (composerOpen.value) {
    const anchor = anchorById.get(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID)
    // The draft is the active item. Put it before saved comments that share
    // the same anchor so it stays visible and those threads yield downward.
    bubbles.unshift({
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
    composerOpen.value ? ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID : selectedCommentId.value
  )
}

const resetLocalCommentScroll = (): void => {
  const previousCommentId = localScrollCommentId.value
  if (previousCommentId) {
    const previousCard = observedCommentCards.get(previousCommentId)
    if (previousCard) previousCard.scrollTop = 0
  }
  localScrollCommentId.value = null
  localScrollMaxHeight.value = 0
}

const ensureSelectedCommentViewport = (): void => {
  const commentId = selectedCommentId.value
  if (!commentId) return
  if (focusReadingCommentId.value === commentId) return
  if (localScrollCommentId.value === commentId) return
  if (localScrollCommentId.value) resetLocalCommentScroll()

  const comment = anchoredSelectionComments.value.find((item) => item.id === commentId)
  const list = commentList.value
  if (!comment || !list || !isCommentExpanded(comment)) return

  syncObservedCommentCards(list)
  const card = observedCommentCards.get(commentId)
  if (!card) return
  const listRect = list.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  const visibleCardTop = Math.max(cardRect.top, listRect.top)
  const availableHeight = Math.floor(
    listRect.bottom - visibleCardTop - LOCAL_SCROLL_BOTTOM_GAP -
    (modifiedComments.value.length ? DETACHED_TRAY_RESERVED_HEIGHT : 0)
  )
  if (availableHeight < LOCAL_SCROLL_MIN_HEIGHT || card.scrollHeight <= availableHeight + 1) return

  localScrollCommentId.value = commentId
  localScrollMaxHeight.value = availableHeight
}

const updateCommentBubbleLayout = (): void => {
  void nextTick().then(() => {
    ensureSelectedCommentViewport()
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

const handleCommentListWheel = (): void => {
  revealScrollbar()
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

const selectComment = async (
  commentId: string,
  forceAnchorPosition = false,
  scrollAnchor = true
): Promise<void> => {
  if (focusReadingCommentId.value && focusReadingCommentId.value !== commentId) {
    await exitFocusReading()
  }
  if (localScrollCommentId.value !== commentId) resetLocalCommentScroll()
  selectedCommentId.value = commentId
  collapsedCommentId.value = null
  commentStore.setActiveComment(commentId)
  await nextTick()
  recalculateCommentBubbleLayout()
  await nextTick()
  if (focusReadingCommentId.value === commentId) return
  if (scrollAnchor) scrollCommentAnchorIntoView(commentId, forceAnchorPosition)
}

const autoFitCommentForReading = async (commentId: string): Promise<void> => {
  ensureSelectedCommentViewport()
  await nextTick()
  if (selectedCommentId.value !== commentId || focusReadingCommentId.value === commentId) return

  const list = commentList.value
  const card = commentCardElement(commentId)
  if (!list || !card) return
  const maxHeight = Math.floor(list.clientHeight * FOCUS_READING_MAX_HEIGHT_RATIO)
  const contentIsClipped = card.scrollHeight > card.clientHeight + 1
  const cardHeight = card.getBoundingClientRect().height
  if (!contentIsClipped || cardHeight >= maxHeight - 1) return

  await enterFocusReading(commentId)
}

const handleCommentCardClick = (commentId: string, event: MouseEvent): void => {
  const target = event.target
  if (target instanceof Element && target.closest(
    'button, a, input, textarea, select, [contenteditable="true"]'
  )) return

  void selectComment(commentId, false, false).then(() => autoFitCommentForReading(commentId))
}

const toggleCommentExpanded = (comment: AnnotaMDComment): void => {
  if (commentHasActiveInteraction(comment)) return
  resetLocalCommentScroll()
  const preservedScrollTop = sharedEditorScroller?.scrollTop
  if (focusReadingCommentId.value === comment.id) {
    focusReadingCommentId.value = null
    focusReadingMaxHeight.value = 0
    focusReadingOriginalHeight.value = 0
  }
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

const commentCardElement = (commentId: string): HTMLElement | null => (
  observedCommentCards.get(commentId) ??
  [...(commentList.value?.querySelectorAll<HTMLElement>('[data-comment-id]') ?? [])]
    .find((card) => card.dataset.commentId === commentId) ?? null
)

const restoreSharedScrollTop = (scrollTop: number | undefined): void => {
  if (scrollTop == null) return
  if (sharedEditorScroller) sharedEditorScroller.scrollTop = scrollTop
  if (commentList.value) commentList.value.scrollTop = scrollTop
}

const alignFocusedCommentBottom = (commentId: string): void => {
  const list = commentList.value
  const card = commentCardElement(commentId)
  const comment = selectionComments.value.find((item) => item.id === commentId)
  if (!list || !card || !sharedEditorScroller || comment?.temporaryDetached) return

  const overflow = card.getBoundingClientRect().bottom -
    (list.getBoundingClientRect().bottom - LOCAL_SCROLL_BOTTOM_GAP)
  if (overflow <= 1) return

  restoreSharedScrollTop(Math.min(
    sharedEditorScroller.scrollTop + overflow,
    Math.max(0, sharedEditorScroller.scrollHeight - sharedEditorScroller.clientHeight)
  ))
}

const scrollCommentToLatestMessage = async (commentId: string): Promise<void> => {
  await nextTick()
  if (selectedCommentId.value === commentId) {
    ensureSelectedCommentViewport()
    await nextTick()
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (commentLayoutDisposed) return
    const card = commentCardElement(commentId)
    if (!card) return
    card.scrollTop = card.scrollHeight
    if (selectedCommentId.value === commentId) alignFocusedCommentBottom(commentId)
  }))
}

const enterFocusReading = async (commentId: string): Promise<void> => {
  if (focusReadingCommentId.value === commentId) return
  if (focusReadingCommentId.value) await exitFocusReading()
  const sourceCard = commentCardElement(commentId)
  const readingScrollTop = sourceCard?.scrollTop ?? 0
  focusReadingOriginalHeight.value = sourceCard?.getBoundingClientRect().height ?? 0
  resetLocalCommentScroll()
  selectedCommentId.value = commentId
  collapsedCommentId.value = null
  commentStore.setActiveComment(commentId)
  focusReadingCommentId.value = commentId
  detachedTrayOpen.value = false
  const list = commentList.value
  focusReadingMaxHeight.value = list
    ? Math.floor(list.clientHeight * FOCUS_READING_MAX_HEIGHT_RATIO)
    : 0
  await nextTick()
  recalculateCommentBubbleLayout()
  await nextTick()
  const card = commentCardElement(commentId)
  if (card) card.scrollTop = readingScrollTop
  alignFocusedCommentBottom(commentId)
}

const exitFocusReading = async (): Promise<void> => {
  const commentId = focusReadingCommentId.value
  if (!commentId) return
  const documentScrollTop = sharedEditorScroller?.scrollTop
  const readingScrollTop = commentCardElement(commentId)?.scrollTop ?? 0
  const comment = selectionComments.value.find((item) => item.id === commentId)
  const originalHeight = focusReadingOriginalHeight.value
  focusReadingCommentId.value = null
  focusReadingMaxHeight.value = 0
  focusReadingOriginalHeight.value = 0
  if (comment?.temporaryDetached) detachedTrayOpen.value = true
  await nextTick()
  recalculateCommentBubbleLayout()
  await nextTick()
  if (!comment?.temporaryDetached && originalHeight > 0) {
    localScrollCommentId.value = commentId
    localScrollMaxHeight.value = originalHeight
  } else {
    ensureSelectedCommentViewport()
  }
  await nextTick()
  recalculateCommentBubbleLayout()
  await nextTick()
  const card = commentCardElement(commentId)
  if (card && localScrollCommentId.value === commentId) card.scrollTop = readingScrollTop
  restoreSharedScrollTop(documentScrollTop)
}

const openDetachedComment = (commentId: string): void => {
  void enterFocusReading(commentId)
}

const handleFocusReadingKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !focusReadingCommentId.value) return
  void exitFocusReading()
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

const jumpToFirstComment = (): void => {
  const anchor = firstCommentAnchor.value
  if (anchor) void selectComment(anchor.id, true)
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
  sharedEditorScroller = next
  sharedEditorScroller?.addEventListener('scroll', syncSharedScrollFromEditor, { passive: true })
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

const handleResolveAllMenuToggle = (): void => {
  if (!resolveAllMenu.value?.open) resolveAllArmed.value = false
}

const closeMenuOnOutsidePointerDown = (
  menu: HTMLDetailsElement | null,
  target: EventTarget | null
): void => {
  if (!menu?.open || !(target instanceof Node) || menu.contains(target)) return
  menu.open = false
}

const handleHeaderMenusOutsidePointerDown = (event: PointerEvent): void => {
  const target = event.target
  closeMenuOnOutsidePointerDown(resolveAllMenu.value, target)
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null
  if (!targetElement?.closest('.annotamd-message-overflow')) {
    closeMessageMenus()
  }
}

const closeMessageMenus = (): void => {
  document
    .querySelectorAll<HTMLDetailsElement>('.annotamd-comment-pane .annotamd-message-overflow[open]')
    .forEach((menu) => {
      menu.open = false
    })
}

const resolveAllComments = async (): Promise<void> => {
  if (hasRunningAgentTurn.value) return
  if (!resolveAllArmed.value) {
    resolveAllArmed.value = true
    return
  }
  if (!filePath.value) return
  const removedIds = comments.value.map((comment) => comment.id)
  await commentStore.deleteAllComments(filePath.value)
  resolveAllArmed.value = false
  if (resolveAllMenu.value) resolveAllMenu.value.open = false
  if (selectedCommentId.value && removedIds.includes(selectedCommentId.value)) {
    selectedCommentId.value = null
    collapsedCommentId.value = null
    commentStore.setActiveComment(null)
  }
}

const resolveModifiedComments = async (): Promise<void> => {
  if (!filePath.value || !modifiedComments.value.length || hasRunningModifiedComment.value) return
  const removedIds = modifiedComments.value.map((comment) => comment.id)
  await commentStore.deleteComments(filePath.value, removedIds)
  detachedTrayOpen.value = false
  if (focusReadingCommentId.value && removedIds.includes(focusReadingCommentId.value)) {
    focusReadingCommentId.value = null
    focusReadingMaxHeight.value = 0
    focusReadingOriginalHeight.value = 0
  }
  if (selectedCommentId.value && removedIds.includes(selectedCommentId.value)) {
    selectedCommentId.value = null
    collapsedCommentId.value = null
    commentStore.setActiveComment(null)
  }
}

const openComposer = (): void => {
  composerOpen.value = true
  nextTick(() => {
    composerTextarea.value?.focus({ preventScroll: true })
    scrollCommentAnchorIntoView(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID)
  })
}

const syncComposerDraftState = (event: Event): void => {
  const textarea = event.currentTarget as HTMLTextAreaElement
  commentStore.setSelectionComposerHasDraft(Boolean(textarea.value.trim()))
}

const closeComposer = (): void => {
  composerOpen.value = false
  draftBody.value = ''
  commentStore.closeSelectionComposer()
  commentStore.clearComposerRequest()
}

const createSelectionComment = (): AnnotaMDComment | null => {
  if (!filePath.value || !draftBody.value.trim()) return null
  const addedComment = commentStore.addSelectionComment(filePath.value, draftBody.value)
  if (addedComment) {
    resetLocalCommentScroll()
    selectedCommentId.value = addedComment.id
    collapsedCommentId.value = null
    commentStore.setActiveComment(addedComment.id)
  }
  return addedComment
}

const submitComment = (): void => {
  if (!createSelectionComment()) return
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
  closeMessageMenus()
  cancelEdit()
  cancelReplyEdit()
  editingId.value = commentId
  editBody.value = body
}

const startReplyEdit = (replyId: string, body: string): void => {
  closeMessageMenus()
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
  closeMessageMenus()
  if (!filePath.value) return
  if (editingReplyId.value === replyId) cancelReplyEdit()
  commentStore.deleteReply(filePath.value, commentId, replyId)
}

const deleteComment = (commentId: string): void => {
  closeMessageMenus()
  if (!filePath.value) return
  commentStore.deleteComment(filePath.value, commentId)
}

const startReply = (id: string): void => {
  replyingId.value = id
}

const stopReply = (id: string): void => {
  if (replyingId.value === id) replyingId.value = null
}

const keepReplyEditorVisible = (
  commentId: string,
  textarea: HTMLTextAreaElement
): void => {
  void nextTick().then(() => {
    requestAnimationFrame(() => {
      if (!textarea.isConnected) return
      const card = commentCardElement(commentId)
      if (!card) return

      if (
        localScrollCommentId.value === commentId ||
        focusReadingCommentId.value === commentId
      ) {
        const actionRow = card.querySelector<HTMLElement>(
          ':scope > .annotamd-comment-action-row'
        )
        if (!actionRow) return
        const obscuredHeight = textarea.getBoundingClientRect().bottom -
          (actionRow.getBoundingClientRect().top - 8)
        if (obscuredHeight > 1) card.scrollTop += Math.ceil(obscuredHeight)
        return
      }

      alignFocusedCommentBottom(commentId)
    })
  })
}

const resizeReplyEditor = (commentId: string, event: Event): void => {
  const textarea = event.currentTarget as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`
  textarea.style.overflowY = textarea.scrollHeight > 96 ? 'auto' : 'hidden'
  updateCommentBubbleLayout()
  keepReplyEditorVisible(commentId, textarea)
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
    collapsedCommentId,
    focusReadingCommentId
  ],
  updateCommentBubbleLayout,
  { deep: true }
)

watch(selectionComments, (nextComments) => {
  if (focusReadingCommentId.value && !nextComments.some(
    (comment) => comment.id === focusReadingCommentId.value
  )) {
    focusReadingCommentId.value = null
    focusReadingMaxHeight.value = 0
    focusReadingOriginalHeight.value = 0
  }
  if (selectedCommentId.value && !nextComments.some(
    (comment) => comment.id === selectedCommentId.value
  )) {
    selectedCommentId.value = null
    collapsedCommentId.value = null
    resetLocalCommentScroll()
    commentStore.setActiveComment(null)
  }
  if (!nextComments.some((comment) => comment.temporaryDetached)) {
    detachedTrayOpen.value = false
  }
})

watch(
  () => ({
    filePath: filePath.value,
    threads: selectionComments.value.map((comment) => ({
      id: comment.id,
      replyIds: comment.replies.map((reply) => reply.id)
    }))
  }),
  (nextSnapshot, previousSnapshot) => {
    if (nextSnapshot.filePath !== previousSnapshot.filePath) return
    const previousById = new Map(
      previousSnapshot.threads.map((thread) => [thread.id, thread.replyIds])
    )
    for (const thread of nextSnapshot.threads) {
      const previousReplyIds = previousById.get(thread.id)
      if (previousReplyIds && thread.replyIds.length > previousReplyIds.length &&
        thread.replyIds.at(-1) !== previousReplyIds.at(-1)) {
        void scrollCommentToLatestMessage(thread.id)
      }
    }
  },
  { flush: 'post' }
)

watch(
  () => modifiedComments.value.map((comment) => comment.id),
  (nextIds, previousIds = []) => {
    const addedId = nextIds.find((id) => !previousIds.includes(id))
    if (addedId && selectedCommentId.value === addedId) {
      void enterFocusReading(addedId)
    }
  }
)

watch(filePath, () => {
  composerOpen.value = false
  draftBody.value = ''
  commentStore.closeSelectionComposer()
  commentStore.setActiveComment(null)
  selectedCommentId.value = null
  collapsedCommentId.value = null
  focusReadingCommentId.value = null
  focusReadingMaxHeight.value = 0
  focusReadingOriginalHeight.value = 0
  detachedTrayOpen.value = false
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
  document.addEventListener('keydown', handleFocusReadingKeydown)
  document.addEventListener('pointerdown', handleHeaderMenusOutsidePointerDown, true)
  document.addEventListener('click', handleHeaderMenusOutsidePointerDown, true)
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
  document.removeEventListener('keydown', handleFocusReadingKeydown)
  document.removeEventListener('pointerdown', handleHeaderMenusOutsidePointerDown, true)
  document.removeEventListener('click', handleHeaderMenusOutsidePointerDown, true)
  sharedEditorScroller?.removeEventListener('scroll', syncSharedScrollFromEditor)
  sharedEditorScroller = null
  bus.off('annotamd-comment-anchors', handleCommentAnchors)
  if (commentLayoutFrame != null) cancelAnimationFrame(commentLayoutFrame)
  commentLayoutFrame = null
  commentResizeObserver?.disconnect()
  commentResizeObserver = null
  observedCommentCards.clear()
  commentCardHeights.clear()
  commentStore.closeSelectionComposer()
  commentStore.setActiveComment(null)
})
</script>

<style scoped src="./CommentPane.css"></style>
