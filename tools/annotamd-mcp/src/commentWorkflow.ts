export const COMMENT_DATA_MARKER = '评论数据（只读结果）：'

export const COMMENT_REVIEW_GUIDANCE = [
  '处理规则（必须在任何写操作前逐条执行）：',
  '1. 先识别每条评论的意图；读取全部评论不等于授权修改全部关联正文。',
  '2. 问题、讨论或征询意见：使用 annotamd_reply_comment 在原评论线程直接回答，不修改正文，默认保留为未解决。',
  '3. 明确的修改建议或改写要求：才使用 annotamd_apply_comment_edit 按 commentId 的真实锚点修改正文。',
  '4. 意图不清、信息不足或同时包含问题与潜在改动：先使用 annotamd_reply_comment 追问确认，不得猜测后改正文。'
].join('\n')

export const formatCommentReviewResult = (value: unknown): string => {
  return `${COMMENT_REVIEW_GUIDANCE}\n\n${COMMENT_DATA_MARKER}\n${JSON.stringify(value, null, 2)}`
}
