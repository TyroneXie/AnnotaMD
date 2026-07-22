#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'
import {
  discoverRunningBridge,
  getBridgeFileCandidates,
  type BridgeConfig
} from './bridgeDiscovery.js'
import { resolveClientIdentity } from './clientIdentity.js'

interface BridgeResponse {
  result?: unknown
  error?: string
}

const configuredClientName = process.env.ANNOTAMD_CLIENT_NAME?.trim()
let initialized = false

const clientIdentity = () => resolveClientIdentity(
  configuredClientName,
  server.server.getClientVersion()
)

const clientRegistration = (): Record<string, string> => {
  const identity = clientIdentity()
  return {
    name: identity.name,
    ...(identity.version ? { version: identity.version } : {})
  }
}

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
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? `AnnotaMD bridge error ${response.status}`)
  }
  return payload
}

const callBridge = async(method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
  const config = await discoverRunningBridge(getBridgeFileCandidates(), async(candidate) => {
    try {
      await requestBridge(
        candidate,
        'register_client',
        clientRegistration(),
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

const server = new McpServer({
  name: 'annotamd',
  version: '0.1.0'
}, {
  instructions: [
    '处理本地 Markdown 评论时，先按绝对 filePath 调用 annotamd_list_comments 获取全部轻量索引。',
    'Local 结尾线程通常等待处理；Agent 结尾线程仍是有效上下文，用户要求继续或需要实质性补充、纠错时可以继续读取和回复。',
    '根据任务和上下文预算，用 annotamd_get_comment 单条或分批读取完整线程；用户明确要求依据全部评论时必须覆盖全部 commentId。',
    '是否读取正文、读取哪些范围以及如何修改 Markdown，由当前 Agent 使用自身可用的文件能力决定。AnnotaMD MCP 不读取或编辑正文。',
    '问题、讨论、征询意见和歧义内容使用 annotamd_reply_comment；正文局部修改保留评论，只有整段批注选区被完全替换或删除时评论才随锚点自动消失，其他情况由用户决定何时解决。',
    '每次回复或修改 Markdown 后重新调用 annotamd_list_comments，避免使用已变化的评论索引和 revision。',
    '不要使用浏览器猜测评论内容或内部标识；批注服务不可用时明确说明无法读取 AnnotaMD 私有评论。'
  ].join('\n')
})

const touchBridge = async(): Promise<void> => {
  await callBridge('register_client', clientRegistration())
}

server.server.oninitialized = () => {
  initialized = true
  void touchBridge().catch(() => {})
}

server.registerTool('annotamd_list_comments', {
  title: '列出 Markdown 评论索引',
  description: '按绝对文件路径返回全部评论的轻量索引、精确锚点、最后作者、消息数和短预览，不返回完整线程或 Markdown 正文。Local 结尾表示通常等待处理，不代表 Agent 结尾线程可以被忽略。',
  inputSchema: { filePath: z.string().min(1) }
}, async({ filePath }) => result(await callBridge('list_comments', { filePath })))

server.registerTool('annotamd_get_comment', {
  title: '读取指定评论线程',
  description: '按 commentId 读取一条，或按 commentIds 分批读取多条完整评论线程。只返回请求的线程、所属文件和当前 revision；两种参数必须二选一。',
  inputSchema: {
    commentId: z.string().min(1).optional(),
    commentIds: z.array(z.string().min(1)).min(1).optional()
  }
}, async({ commentId, commentIds }) => {
  if ((commentId ? 1 : 0) + (commentIds ? 1 : 0) !== 1) {
    throw new Error('Provide exactly one of commentId or commentIds')
  }
  return result(await callBridge('get_comment', commentId ? { commentId } : { commentIds }))
})

server.registerTool('annotamd_reply_comment', {
  title: '回复评论',
  description: '以 Agent 身份在原线程回答问题、参与讨论、继续补充或追问歧义，不修改正文，也不改变解决状态。revision 过期时拒绝写入。',
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

const transport = new StdioServerTransport()
await server.connect(transport)
const heartbeat = setInterval(() => {
  if (initialized) void touchBridge().catch(() => {})
}, 10_000)
heartbeat.unref()
