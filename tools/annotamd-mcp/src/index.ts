#!/usr/bin/env node
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'
import {
  discoverRunningBridge,
  getBridgeFileCandidates,
  type BridgeConfig
} from './bridgeDiscovery.js'
import { formatCommentReviewResult } from './commentWorkflow.js'

interface BridgeResponse {
  result?: unknown
  error?: string
}

const clientName = process.env.ANNOTAMD_CLIENT_NAME?.trim() || 'Agent'

const requestBridge = async(
  config: BridgeConfig,
  method: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<BridgeResponse> => {
  const response = await fetch(`http://127.0.0.1:${config.port}`, {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ method, params })
  })
  const payload = await response.json() as BridgeResponse
  if (!response.ok || payload.error) throw new Error(payload.error ?? `AnnotaMD bridge error ${response.status}`)
  return payload
}

const callBridge = async(method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
  const config = await discoverRunningBridge(getBridgeFileCandidates(), async(candidate) => {
    try {
      await requestBridge(
        candidate,
        'register_client',
        { name: clientName },
        AbortSignal.timeout(750)
      )
      return true
    } catch {
      return false
    }
  })
  if (!config) {
    throw new Error('未发现正在运行且已开启评论访问的 AnnotaMD。请打开 AnnotaMD，并在“设置 → Agent”中开启评论访问。')
  }
  const payload = await requestBridge(config, method, params)
  return payload.result
}

const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
})

const commentReviewResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: formatCommentReviewResult(value) }]
})

const server = new McpServer({
  name: 'annotamd',
  version: '0.1.0'
}, {
  instructions: [
    '当用户提到“根据文档中的评论修改文档”、处理批注或审阅意见时，主动使用 AnnotaMD MCP 查找并读取评论，无需用户明确说出 AnnotaMD。',
    'AnnotaMD MCP 为本地 Markdown 提供私有批注上下文，不限制你按原有文件权限读取正文。',
    '处理批注时先用 annotamd_list_inbox 发现待处理文档，再用 annotamd_read_document 阅读完整正文、当前 revision、精确锚点和线程回复。',
    '读取全部评论不等于授权修改全部关联正文。任何写操作前必须逐条识别意图：明确的修改建议才精确修改正文；问题、讨论或征询意见直接在线程中回复，默认保留为未解决；信息不足或存在歧义时先回复询问，不擅自修改。用户的明确要求优先。',
    '重复文字必须依靠 commentId 区分；修改正文时使用 annotamd_apply_comment_edit，不要搜索同名文本猜测位置。',
    'annotamd_apply_comment_edit 成功后会自动保留 Agent 处理回复并将评论标记为已解决，无需再次调用解决工具。',
    '所有写操作使用刚读取的 expectedRevision；过期时重新读取。需要沟通时在线程中回复。',
    '批注服务关闭时，你仍可使用自己的文件能力读取 Markdown，但无法访问 AnnotaMD SQLite 中的私有批注。'
  ].join('\n')
})

const touchBridge = async(): Promise<void> => {
  await callBridge('register_client', { name: clientName })
}

server.registerResource(
  'annotamd-comment-inbox',
  'annotamd://inbox',
  {
    title: 'AnnotaMD 评论收件箱',
    description: '所有未解决的本地 Markdown 批注。批注是正文的补充上下文，不限制 Agent 读取正文。',
    mimeType: 'application/json'
  },
  async() => ({
    contents: [{
      uri: 'annotamd://inbox',
      mimeType: 'application/json',
      text: JSON.stringify(await callBridge('inbox'), null, 2)
    }]
  })
)

server.registerResource(
  'annotamd-document',
  new ResourceTemplate('annotamd://documents/{documentId}', { list: undefined }),
  {
    title: 'AnnotaMD 文档与评论',
    description: '本地 Markdown 正文、当前 revision 和评论线程',
    mimeType: 'application/json'
  },
  async(uri, variables) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(await callBridge('read_document', {
        documentId: String(variables.documentId)
      }), null, 2)
    }]
  })
)

server.registerResource(
  'annotamd-document-comments',
  new ResourceTemplate('annotamd://documents/{documentId}/comments', { list: undefined }),
  {
    title: 'AnnotaMD 文档评论',
    description: '指定本地 Markdown 文档的评论和线程回复',
    mimeType: 'application/json'
  },
  async(uri, variables) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(await callBridge('list_comments', {
        documentId: String(variables.documentId)
      }), null, 2)
    }]
  })
)

server.registerTool('annotamd_read_document', {
  title: '读取带评论的本地 Markdown',
  description: '读取完整 Markdown 正文、revision、选区批注、全文批注及线程回复。返回结果会要求先逐条识别评论意图；读取不等于授权修改全部正文。后续写操作必须使用返回的 revision。',
  inputSchema: { documentId: z.string().min(1) }
}, async({ documentId }) => commentReviewResult(await callBridge('read_document', { documentId })))

server.registerTool('annotamd_list_comments', {
  title: '列出文档评论',
  description: '按 documentId 列出评论及其精确锚点和线程回复。必须先逐条识别意图：问题类回复评论，明确修改建议才修改正文，不清楚时先追问；不得默认批量修改所有评论关联正文。',
  inputSchema: { documentId: z.string().min(1) }
}, async({ documentId }) => commentReviewResult(await callBridge('list_comments', { documentId })))

server.registerTool('annotamd_list_inbox', {
  title: '列出待处理批注文档',
  description: '列出包含未解决 AnnotaMD 批注的本地文档。先用此工具发现待处理文档，再读取正文与完整批注。',
  inputSchema: {}
}, async() => result(await callBridge('inbox')))

server.registerTool('annotamd_get_comment', {
  title: '读取单条评论',
  description: '读取评论、所属文档和当前 revision，并先判断它是问题、明确修改建议还是需要追问的歧义内容。',
  inputSchema: { commentId: z.string().min(1) }
}, async({ commentId }) => commentReviewResult(await callBridge('get_comment', { commentId })))

server.registerTool('annotamd_reply_comment', {
  title: '回复评论',
  description: '回答问题、参与讨论、回应征询意见或追问歧义时，以 Agent 身份在原线程中回复，不修改正文。revision 过期时拒绝写入。',
  inputSchema: {
    commentId: z.string().min(1),
    body: z.string().min(1),
    expectedRevision: z.number().int().nonnegative()
  }
}, async({ commentId, body, expectedRevision }) => result(await callBridge('reply_comment', {
  commentId,
  body,
  expectedRevision
})))

server.registerTool('annotamd_apply_comment_edit', {
  title: '按评论精确修改正文',
  description: '仅在刚读取的评论被明确识别为修改建议或改写要求时调用；问题、讨论或歧义内容不得调用。由 AnnotaMD 根据 commentId 的真实锚点执行编辑，不搜索同名文本。成功后自动保留处理回复并将评论标记为已解决。文档需要在 AnnotaMD 中打开。',
  inputSchema: {
    commentId: z.string().min(1),
    replacement: z.string(),
    summary: z.string().min(1).optional().describe('面向用户的简短处理说明，显示在评论线程中'),
    expectedRevision: z.number().int().nonnegative()
  }
}, async({ commentId, replacement, summary, expectedRevision }) => result(await callBridge('apply_comment_edit', {
  commentId,
  replacement,
  summary,
  expectedRevision
})))

server.registerTool('annotamd_resolve_comment', {
  title: '解决或重新打开评论',
  description: '更新评论解决状态。revision 过期时拒绝写入。',
  inputSchema: {
    commentId: z.string().min(1),
    resolved: z.boolean().default(true),
    expectedRevision: z.number().int().nonnegative()
  }
}, async({ commentId, resolved, expectedRevision }) => result(await callBridge('resolve_comment', {
  commentId,
  resolved,
  expectedRevision
})))

server.registerPrompt('annotamd_comment_workflow', {
  title: '处理 AnnotaMD 批注',
  description: '教 Agent 正确读取完整 Markdown、理解批注并安全地回复或修改。'
}, async() => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: [
        '请处理 AnnotaMD 中的本地 Markdown 批注。',
        '1. 先调用 annotamd_list_inbox 查找有未解决批注的文档。',
        '2. 调用 annotamd_read_document，完整阅读 markdown 正文、选区批注、全文批注和线程回复；批注只是补充上下文，不代表只能读取批注。',
        '3. 用 commentId 区分重复文字上的不同批注，不要自行搜索同名文本来猜测位置。',
        '4. 读取全部评论不等于授权修改全部关联正文。在任何写操作前逐条判断意图：明确的修改建议才使用 annotamd_apply_comment_edit，并提供简短的处理说明；问题、讨论或征询意见使用 annotamd_reply_comment 回答，默认不解决；不明确时先回复询问，不擅自修改。',
        '5. 写操作使用刚读取到的 expectedRevision；revision 过期时重新读取，不要覆盖新内容。',
        '6. annotamd_apply_comment_edit 会自动将评论标记为已解决并保留处理记录，不要再次解决；仅回复的问题评论应保留，方便用户确认或追问。',
        '如果 AnnotaMD MCP 批注服务关闭，仍可按你原有的文件权限读取 Markdown，但不能读取 AnnotaMD 私有批注。'
      ].join('\n')
    }
  }]
}))

const transport = new StdioServerTransport()
await server.connect(transport)
void touchBridge().catch(() => {})
const heartbeat = setInterval(() => {
  void touchBridge().catch(() => {})
}, 10_000)
heartbeat.unref()
