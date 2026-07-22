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

  it('uses a compact one-line quote and removes reply connector lines', () => {
    expect(commentPane).toMatch(
      /\.annotamd-comment-card blockquote\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
    )
    expect(commentPane).toMatch(/\.annotamd-comment-list\s*\{[^}]*padding:\s*0 8px;/s)
    expect(commentPane).not.toMatch(/\.annotamd-replies\s*\{[^}]*border-left:/s)
    expect(documentFooter).not.toMatch(/\.annotamd-document-replies\s*\{[^}]*border-left:/s)
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
    expect(commentPane).toContain('@wheel="handleCommentCardWheel($event, comment)"')
    expect(commentPane).toContain('selectedCommentId.value !== comment.id')
    expect(commentPane).toContain('event.preventDefault()')
    expect(commentPane).toContain('@wheel.passive="handleCommentListWheel"')
    expect(commentPane).toContain('const handleCommentListWheel = (): void =>')
    expect(commentPane).not.toContain("addEventListener('wheel', handleEditorWheel")
    expect(commentPane).not.toContain('wheelTargetsLocalComment')
    expect(commentPane).not.toContain('card.scrollTop += delta')
    expect(commentPane).not.toContain('@mouseleave="handleCommentCardLeave(comment.id)"')
    expect(commentPane).toMatch(
      /\.annotamd-comment-card\.local-scroll\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-card\.local-scroll \.annotamd-comment-row\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s
    )
  })

  it('keeps the compact card header on one line in English', () => {
    const english = JSON.parse(read('packages/desktop/static/locales/en.json'))

    expect(english.annotamd.comments.selectionScope).toBe('Selection')
    expect(english.annotamd.comments.markResolved).toBe('Resolve')
    expect(english.annotamd.comments.restore).toBe('Reopen')
    expect(commentPane).toMatch(
      /\.annotamd-comment-scope\s*\{[^}]*white-space:\s*nowrap;/s
    )
    expect(commentPane).toMatch(
      /\.annotamd-comment-card-actions button,[\s\S]*?\.annotamd-message-actions button\s*\{[^}]*white-space:\s*nowrap;/s
    )
  })
})
