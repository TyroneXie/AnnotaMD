export const COMMENT_DATA_MARKER = '评论数据（只读结果）：'

export const COMMENT_REVIEW_GUIDANCE = [
  '评论处理规则（必须执行）：',
  '1. 遍历所有评论线程。凡最后一条消息来自 Local（存储值 author=user）的线程都要处理；不得只看最新根评论。',
  '2. 直接使用返回数据中的 localEndingComments 作为待处理清单。resolved、根评论的 updatedAt 和数组顺序都不能代替“最后一条消息是 Local”这个判定。',
  '3. 逐条识别意图；读取全部评论不等于授权修改全部关联正文。',
  '4. 问题、讨论或征询意见：使用 annotamd_reply_comment 在原评论线程直接回答，不修改正文，默认保留为未解决。',
  '5. 明确的修改建议或改写要求：才使用 annotamd_apply_comment_edit 按 commentId 的真实锚点修改正文。',
  '6. 意图不清、信息不足或同时包含问题与潜在改动：先使用 annotamd_reply_comment 追问确认，不得猜测后改正文。',
  '7. 每次写操作后重新读取文档，再处理下一条；宣称“已全部回复”前必须重读并确认 localEndingCommentCount 为 0。'
].join('\n')

type JsonRecord = Record<string, unknown>

export interface LocalEndingComment {
  commentId: string
  quote: string
  latestLocalMessage: string
  lastMessageAt: number
  resolved: boolean
}

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const getComments = (value: JsonRecord): unknown[] | null => {
  if (Array.isArray(value.comments)) return value.comments
  if (isRecord(value.document) && Array.isArray(value.document.comments)) {
    return value.document.comments
  }
  return null
}

export const findLocalEndingComments = (value: unknown): LocalEndingComment[] => {
  if (!isRecord(value)) return []
  const comments = getComments(value)
  if (!comments) return []

  return comments.flatMap((rawComment): LocalEndingComment[] => {
    if (!isRecord(rawComment) || typeof rawComment.id !== 'string') return []
    const replies = Array.isArray(rawComment.replies)
      ? rawComment.replies.filter(isRecord)
      : []
    const lastReply = replies.at(-1)

    if (lastReply && lastReply.author !== 'user') return []

    const body = lastReply?.body ?? rawComment.body
    const createdAt = lastReply?.createdAt ?? rawComment.createdAt
    if (typeof body !== 'string' || typeof createdAt !== 'number') return []

    return [{
      commentId: rawComment.id,
      quote: typeof rawComment.quote === 'string' ? rawComment.quote : '',
      latestLocalMessage: body,
      lastMessageAt: createdAt,
      resolved: rawComment.resolved === true
    }]
  }).sort((left, right) => (
    right.lastMessageAt - left.lastMessageAt || left.commentId.localeCompare(right.commentId)
  ))
}

export const addCommentWorkflowSummary = (value: unknown): unknown => {
  if (!isRecord(value) || !getComments(value)) return value
  const localEndingComments = findLocalEndingComments(value)
  return {
    ...value,
    localEndingCommentCount: localEndingComments.length,
    localEndingComments
  }
}

export const formatCommentReviewResult = (value: unknown): string => {
  return `${COMMENT_REVIEW_GUIDANCE}\n\n${COMMENT_DATA_MARKER}\n${JSON.stringify(addCommentWorkflowSummary(value), null, 2)}`
}
