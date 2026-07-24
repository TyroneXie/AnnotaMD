import type { AnnotaMDAgentProfile } from './agentProfiles'

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
  profile: AnnotaMDAgentProfile
  promptTemplate: string
  sessionId?: string
}

export interface AnnotaMDAgentTurnResult {
  sessionId: string
  replyAdded: boolean
  documentChanged: boolean
}
