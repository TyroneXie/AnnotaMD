import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatCommentTimestamp } from '../../../src/renderer/src/util/annotamdCommentTime'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')
const commentPane = read('packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue')
const documentFooter = read(
  'packages/desktop/src/renderer/src/components/annotamd/DocumentCommentFooter.vue'
)
const commentStore = read('packages/desktop/src/renderer/src/store/annotamdComments.ts')

describe('Feishu-style comment messages', () => {
  it('shows each message own localized date and time', () => {
    const now = new Date(2026, 6, 22, 14, 0).getTime()
    const today = new Date(2026, 6, 22, 10, 25).getTime()
    const yesterday = new Date(2026, 6, 21, 10, 25).getTime()
    const older = new Date(2026, 6, 20, 10, 25).getTime()

    expect(formatCommentTimestamp(today, 'zh-CN', now)).toBe('今天 10:25')
    expect(formatCommentTimestamp(yesterday, 'zh-CN', now)).toBe('昨天 10:25')
    expect(formatCommentTimestamp(older, 'zh-CN', now)).toBe('7月20日 10:25')
    expect(commentPane).toContain('formatMessageTime(comment.createdAt)')
    expect(commentPane).toContain('formatMessageTime(reply.createdAt)')
    expect(documentFooter).toContain('formatMessageTime(comment.createdAt)')
    expect(documentFooter).toContain('formatMessageTime(reply.createdAt)')
  })

  it('lets every Local message edit and delete while keeping Agent messages read-only', () => {
    for (const component of [commentPane, documentFooter]) {
      expect(component).toContain('v-if="reply.author === \'user\'"')
      expect(component).toContain('startCommentEdit(comment.id, comment.body)')
      expect(component).toContain('startReplyEdit(reply.id, reply.body)')
      expect(component).toContain('deleteReply(comment.id, reply.id)')
      expect(component).not.toContain('canEditLatestMessage')
    }
    expect(commentStore).toMatch(
      /deleteReply\([\s\S]*?reply\.author !== 'user'[\s\S]*?comment\.replies = comment\.replies\.filter/
    )
  })

  it('permanently deletes a comment when the user marks it resolved', () => {
    for (const component of [commentPane, documentFooter]) {
      expect(component).toContain("commentStore.deleteComment(filePath, comment.id)")
      expect(component).not.toContain('commentStore.toggleResolved')
      expect(component).not.toContain("t('annotamd.comments.restore')")
    }
    expect(commentStore).not.toContain('toggleResolved(')
    expect(commentStore).not.toContain('completeAgentEdit(')
  })

  it('moves modified comments into a bottom tray with its own bulk action', () => {
    const chinese = JSON.parse(read('packages/desktop/static/locales/zh-CN.json'))

    expect(commentPane).toContain('class="annotamd-detached-tray"')
    expect(commentPane).toContain('class="annotamd-detached-tray-resolve"')
    expect(commentPane).toContain('@click="resolveModifiedComments"')
    expect(commentPane).toContain("(comment) => !comment.temporaryDetached")
    expect(commentPane).toContain('commentStore.deleteComments(filePath.value, removedIds)')
    expect(chinese.annotamd.comments.resolveModifiedShort).toBe('全部解决')
    expect(chinese.annotamd.comments.detachedTrayTitle).toContain('原文已修改')
    expect(chinese.annotamd.comments.bulkResolve).toBe('批量解决评论')
  })

  it('closes the bulk resolve menu when the user clicks elsewhere', () => {
    expect(commentPane).toContain(
      'const handleResolveAllOutsidePointerDown = (event: PointerEvent)'
    )
    expect(commentPane).toContain('menu.contains(target)')
    expect(commentPane).toContain('menu.open = false')
    expect(commentPane).toContain(
      "document.addEventListener('pointerdown', handleResolveAllOutsidePointerDown, true)"
    )
    expect(commentPane).toContain(
      "document.removeEventListener('pointerdown', handleResolveAllOutsidePointerDown, true)"
    )
  })

  it('automatically enlarges only clipped small comments up to two thirds of the pane', () => {
    expect(commentPane).not.toContain('class="annotamd-focus-reading-toggle"')
    expect(commentPane).toContain('const enterFocusReading = async(commentId: string)')
    expect(commentPane).toContain('const autoFitCommentForReading = async(commentId: string)')
    expect(commentPane).toContain('const FOCUS_READING_MAX_HEIGHT_RATIO = 2 / 3')
    expect(commentPane).toContain('card.scrollHeight > card.clientHeight + 1')
    expect(commentPane).toContain('cardHeight >= maxHeight - 1')
    expect(commentPane).toContain('selectComment(commentId, false, false)')
    expect(commentPane).toContain('alignFocusedCommentBottom(commentId)')
    expect(commentPane).toMatch(
      /alignFocusedCommentBottom[\s\S]*?restoreSharedScrollTop\(Math\.min\(/
    )
    expect(commentPane).toContain('if (focusReadingCommentId.value === commentId) return')
    expect(commentPane).toContain('target.closest(')
    expect(commentPane).toContain('button, a, input, textarea, select')
    expect(commentPane).not.toContain("'annotamd.comments.restoreReadingSize'")
    expect(commentPane).not.toContain('<ScaleToOriginal')
    expect(commentPane).toContain('focusReadingOriginalHeight.value =')
    expect(commentPane).toContain('localScrollMaxHeight.value = originalHeight')
    expect(commentPane).not.toContain('handleFocusReadingOutsidePointerDown')
    expect(commentPane).not.toContain('annotamd.comments.locateSource')
    expect(commentPane).not.toContain('<Close')
    expect(commentPane).toContain('if (focusReadingCommentId.value === comment.id)')
    expect(commentPane).toContain('focusReadingMaxHeight.value = 0')
    expect(commentPane).toContain("event.key !== 'Escape'")
    expect(commentPane).toMatch(
      /\.annotamd-comment-card\.focus-reading\.temporary-detached\s*\{[^}]*position:\s*fixed\s*!important;[^}]*height:\s*auto;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-card\.local-scroll,[\s\S]*?\.annotamd-comment-card\.focus-reading\s*\{[^}]*overflow-y:\s*auto;/s
    )
  })

  it('uses a compact one-line quote and removes reply connector lines', () => {
    expect(commentPane).toMatch(
      /\.annotamd-comment-card blockquote\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
    )
    expect(commentPane).toMatch(/\.annotamd-comment-list\s*\{[^}]*padding:\s*0 8px;/s)
    expect(commentPane).not.toMatch(/\.annotamd-replies\s*\{[^}]*border-left:/s)
    expect(documentFooter).not.toMatch(/\.annotamd-document-replies\s*\{[^}]*border-left:/s)
  })

  it('keeps storage details in Agent settings instead of repeating them in comment composers', () => {
    const chinese = JSON.parse(read('packages/desktop/static/locales/zh-CN.json'))
    const english = JSON.parse(read('packages/desktop/static/locales/en.json'))

    expect(documentFooter).not.toContain('annotamd-document-comments-header')
    expect(documentFooter).not.toContain("t('annotamd.comments.documentTitle')")
    expect(documentFooter).not.toContain("t('annotamd.comments.documentSummary'")
    expect(commentPane).not.toContain("t('annotamd.comments.excludeFromRenderedMarkdown')")
    expect(documentFooter).not.toContain("t('annotamd.comments.documentStorageDescription')")
    expect(chinese.preferences.agent.enableCommentsDescription).toContain('保存在本机')
    expect(english.preferences.agent.enableCommentsDescription).toContain('stored on this device')
  })

  it('keeps anchored cards in the scroll flow instead of hiding and animating their top', () => {
    expect(commentPane).not.toContain('if (anchor && !interactionActive')
    expect(commentPane).not.toContain('transition: top 120ms')
    expect(commentPane).toContain('Math.max(sharedScrollHeight.value, commentLayout.value.height)')
    expect(commentPane).toContain(
      'scrollCommentAnchorIntoView(ANNOTAMD_COMMENT_COMPOSER_ANCHOR_ID)'
    )
  })

  it('compacts inactive threads and expands the selected thread without a nested scrollbar', () => {
    expect(commentPane).toContain("compact: !isCommentExpanded(comment)")
    expect(commentPane).toContain('selectedCommentId.value === comment.id')
    expect(commentPane).toContain('class="annotamd-thread-toggle"')
    expect(commentPane).toContain(':aria-expanded="false"')
    expect(commentPane).toContain(':aria-expanded="true"')
    expect(commentPane).not.toContain('class="annotamd-reply-action"')
    expect(commentPane).toMatch(
      /class="annotamd-reply-editor"[\s\S]*?rows="1"[\s\S]*?@focus="startReply\(comment\.id\)"/
    )
    expect(commentPane).toContain('class="annotamd-reply-cancel"')
    expect(commentPane).toContain('class="annotamd-reply-submit"')
    expect(commentPane).toContain('@blur="stopReply(comment.id)"')
    expect(commentPane).toContain('@input="resizeReplyEditor"')
    expect(commentPane).toContain("Math.min(textarea.scrollHeight, 96)")
    expect(commentPane).toContain("replyingId.value = null")
    expect(commentPane).not.toMatch(/\.annotamd-comment-card\s*\{[^}]*overflow-y:\s*(auto|scroll)/s)
  })

  it('isolates wheel scrolling inside only the selected overlong thread', () => {
    expect(commentPane).toContain("'local-scroll': localScrollCommentId === comment.id")
    expect(commentPane).not.toContain('@wheel="handleCommentCardWheel($event, comment)"')
    expect(commentPane).not.toContain('event.preventDefault()')
    expect(commentPane).toContain('@wheel.passive="handleCommentListWheel"')
    expect(commentPane).toContain('const handleCommentListWheel = (): void =>')
    expect(commentPane).toContain('const ensureSelectedCommentViewport = (): void =>')
    expect(commentPane).toMatch(
      /updateCommentBubbleLayout[\s\S]*?nextTick[\s\S]*?ensureSelectedCommentViewport\(\)/
    )
    expect(commentPane).not.toContain("addEventListener('wheel', handleEditorWheel")
    expect(commentPane).not.toContain('wheelTargetsLocalComment')
    expect(commentPane).not.toContain('card.scrollTop += delta')
    expect(commentPane).toContain('if (previousCard) previousCard.scrollTop = 0')
    expect(commentPane).toContain('const toggleCommentExpanded = (comment: AnnotaMDComment): void =>')
    expect(commentPane).toMatch(/toggleCommentExpanded[\s\S]*?resetLocalCommentScroll\(\)/)
    expect(commentPane).not.toContain('@mouseleave="handleCommentCardLeave(comment.id)"')
    expect(commentPane).toMatch(
      /\.annotamd-comment-card\.local-scroll,[\s\S]*?\.annotamd-comment-card\.focus-reading\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-card\.local-scroll \.annotamd-comment-row,[\s\S]*?\.annotamd-comment-card\.focus-reading \.annotamd-comment-row\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s
    )
  })

  it('keeps the compact card header on one line in English', () => {
    const english = JSON.parse(read('packages/desktop/static/locales/en.json'))

    expect(english.annotamd.comments.selectionScope).toBe('Selection')
    expect(english.annotamd.comments.markResolved).toBe('Resolve')
    expect(commentPane).toMatch(
      /\.annotamd-comment-scope\s*\{[^}]*white-space:\s*nowrap;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-card-actions button,[\s\S]*?\.annotamd-message-actions button\s*\{[^}]*white-space:\s*nowrap;/s
    )
  })
})
