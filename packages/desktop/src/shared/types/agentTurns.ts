import type {
  AiChangeSet,
  AiDocumentContext,
  AiEffortSelection,
  AiPermissionMode
} from './aiWorkspace'
import type { AnnotaMDCommentRecord } from './comments'

export const LEGACY_AGENT_PROMPT_TEMPLATE = `你正在 AnnotaMD 中处理一条文档批注。

文档路径：
{{当前文档路径}}

评论 ID：
{{当前评论ID}}

被批注内容：
{{被批注原文}}

被批注内容前后上下文：
{{被批注前后上下文100字}}

当前评论线程：
{{当前评论线程}}

最新一条评论：
{{当前评论}}

请根据最新评论处理这条批注。需要修改正文时，可以直接编辑上述文档。`

export const DEFAULT_AGENT_PROMPT_TEMPLATE = `你正在 AnnotaMD 中处理一条 Markdown 文档批注。

文档路径：
{{当前文档路径}}

评论 ID：
{{当前评论ID}}

被批注原文：
{{被批注原文}}

被批注前后上下文：
{{被批注前后上下文100字}}

当前评论线程：
{{当前评论线程}}

用户最新消息：
{{当前评论}}

请以“用户最新消息”为本轮唯一直接任务，并结合被批注原文和评论线程判断如何处理。

处理规则：
1. 用户明确要求修改正文时，直接编辑文档中准确对应的内容，不要扩大修改范围。
2. 用户提出问题、要求解释或征求建议时，只在评论中回复，不要修改正文。
3. 意图不明确、存在多种合理改法或无法准确定位时，先提出一个简短问题，不要猜测修改。
4. 除非用户明确要求，否则不要处理文档中的其他评论。`

export const migrateAgentPromptTemplate = (value: string): string => (
  value === LEGACY_AGENT_PROMPT_TEMPLATE ? DEFAULT_AGENT_PROMPT_TEMPLATE : value
)

export const AGENT_PROMPT_VARIABLES = [
  '{{当前文档路径}}',
  '{{当前评论ID}}',
  '{{当前评论}}',
  '{{当前评论线程}}',
  '{{被批注原文}}',
  '{{被批注前后上下文100字}}',
  '{{当前文档所有评论}}'
] as const

export interface AnnotaMDAgentTurnRequest {
  filePath: string
  commentId: string
  latestMessage: string
  workspacePath: string
  document: AiDocumentContext
  conversationId?: string
  selection?: {
    configId?: string
    modelId?: string
    effort?: AiEffortSelection
    permissionMode?: AiPermissionMode
  }
}

export interface AnnotaMDAgentTurnResult {
  conversationId: string
  reply: string
  changeSet?: AiChangeSet
}

export const shouldRevealCommentAgentConversation = (
  result: AnnotaMDAgentTurnResult
): boolean => Boolean(result.changeSet)

/** Sent by the shared AI runtime as soon as a comment turn can be stopped. */
export interface AnnotaMDAgentTurnStartedEvent {
  commentId: string
  conversationId: string
  turnId: string
}

export interface AnnotaMDAgentTurnStopRequest {
  commentId: string
  conversationId: string
  turnId: string
}

export type AgentSessions = Record<string, Record<string, Record<string, string>>>

/** Reserved inside the legacy nested session map so old profile sessions remain untouched. */
export const UNIFIED_AGENT_CONVERSATION_KEY = 'annotamd-unified-ai'

export const cloneAgentSessions = (sessions: AgentSessions): AgentSessions => (
  Object.fromEntries(Object.entries(sessions).map(([filePath, comments]) => [
    filePath,
    Object.fromEntries(Object.entries(comments).map(([commentId, profiles]) => [
      commentId,
      { ...profiles }
    ]))
  ]))
)

const MAX_COMMENT_REPLY_CHARS = 2000

const formatCommentThread = (comment: AnnotaMDCommentRecord): string => [
  `Local：${comment.body}`,
  ...comment.replies.map((reply) => `${reply.author === 'agent' ? 'Agent' : 'Local'}：${reply.body}`)
].join('\n')

const annotatedRange = (
  markdown: string,
  comment: AnnotaMDCommentRecord
): { start: number; end: number } | null => {
  const quote = (comment.exactQuote ?? comment.quote).trim()
  if (!quote) return null
  const starts: number[] = []
  let cursor = 0
  while (cursor <= markdown.length - quote.length) {
    const start = markdown.indexOf(quote, cursor)
    if (start < 0) break
    starts.push(start)
    cursor = start + Math.max(quote.length, 1)
  }
  if (!starts.length) return null
  const blockIndex = comment.anchor?.path?.find((segment): segment is number => (
    typeof segment === 'number'
  ))
  const start = blockIndex == null || starts.length === 1
    ? starts[0]!
    : starts.reduce((best, candidate) => {
        const candidateBlock = markdown.slice(0, candidate).split(/\n\s*\n/).length - 1
        const bestBlock = markdown.slice(0, best).split(/\n\s*\n/).length - 1
        return Math.abs(candidateBlock - blockIndex) < Math.abs(bestBlock - blockIndex)
          ? candidate
          : best
      })
  return { start, end: start + quote.length }
}

const quoteContext = (
  markdown: string,
  comment: AnnotaMDCommentRecord,
  radius = 100
): string => {
  const range = annotatedRange(markdown, comment)
  if (!range) return ''
  return markdown.slice(
    Math.max(0, range.start - radius),
    Math.min(markdown.length, range.end + radius)
  )
}

/**
 * Comment turns intentionally use one fixed product prompt. Provider/model
 * selection belongs to the shared AI runtime; old per-CLI prompt/profile
 * preferences remain readable only for migration and are not executed here.
 */
export const buildCommentAgentPrompt = (
  filePath: string,
  comment: AnnotaMDCommentRecord,
  latestMessage: string,
  markdown: string
): string => `用户最新批注意见：${latestMessage.trim()}

你正在 AnnotaMD 中处理一条 Markdown 文档批注。

文档路径：${filePath}
评论 ID：${comment.id}
被批注原文：${comment.exactQuote ?? comment.quote}
被批注内容前后上下文：${quoteContext(markdown, comment)}

当前评论线程：
${formatCommentThread(comment)}

处理规则：
1. 以“用户最新批注意见”为本轮唯一直接任务，只处理当前评论。
2. 用户明确要求修改正文时，使用本轮提供的 AnnotaMD 文档工具直接精确修改；不要使用 shell 或通用文件写入。
3. 用户只是提问、要求解释或征求建议时，不要修改正文。
4. 意图不明确、无法准确定位或存在多种合理改法时，先提出一个简短问题，不要猜测修改。
5. 最终始终返回一条简短的纯文字答复，它会直接追加到当前 AnnotaMD 评论线程。不要使用 Markdown 标题、列表或代码块，不要描述思考过程。`

export const normalizeCommentAgentReply = (value: string): string => value
  .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
  .replace(/\u0000/g, '')
  .trim()
  .slice(0, MAX_COMMENT_REPLY_CHARS)
