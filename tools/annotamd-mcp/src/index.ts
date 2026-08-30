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
const agentScopeToken = process.env.ANNOTAMD_AGENT_SCOPE_TOKEN?.trim()
const agentMutationsEnabled = process.env.ANNOTAMD_AGENT_MUTATIONS !== '0'
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

const callScopedBridge = async(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> => {
  if (!agentScopeToken) {
    throw new Error('当前 AnnotaMD MCP 进程没有文档 Agent 授权。')
  }
  return callBridge(method, { ...params, scopeToken: agentScopeToken })
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
    agentScopeToken
      ? agentMutationsEnabled
        ? '当前进程由 AnnotaMD 自定义 Agent 会话启动。通过 annotamd_get_context、annotamd_read_document、annotamd_edit_document、annotamd_replace_document 访问 Muya 实时正文。'
        : '当前进程由 AnnotaMD CLI Agent 会话启动。MCP 只补充未保存正文、选区和批注上下文；使用 CLI 自己的文件、shell 和其他原生工具修改已保存文件。'
      : '当前进程只提供评论能力，不读取或编辑 Markdown 正文。',
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

if (agentScopeToken) {
  server.registerTool('annotamd_get_context', {
    title: '读取 AnnotaMD Agent 上下文',
    description: '返回本次 Agent turn 被授权的活动文档 handle、虚拟 URI、revision、contentHash、保存状态和显式选区摘要，不返回未授权文件。',
    inputSchema: {}
  }, async() => result(await callScopedBridge('agent_get_context')))

  server.registerTool('annotamd_read_document', {
    title: '读取 Muya 实时文档',
    description: '按授权 handle 读取 Muya 当前实时 Markdown，而不是磁盘中的旧内容；返回的 revision 和 contentHash 必须原样用于下一次修改。',
    inputSchema: {
      handleId: z.string().min(1).optional()
    }
  }, async({ handleId }) => result(await callScopedBridge('agent_read_document', {
    ...(handleId ? { handleId } : {})
  })))

  if (agentMutationsEnabled) server.registerTool('annotamd_edit_document', {
    title: '精确修改 Muya 文档',
    description: '在指定 revision/hash 上执行一组唯一、非重叠的精确文本替换并立即更新 Muya。任何旧基线、重复目标或重叠编辑都会整次拒绝；成功后返回新的 revision/hash。',
    inputSchema: {
      handleId: z.string().min(1),
      expectedRevision: z.number().int().nonnegative(),
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
      edits: z.array(z.object({
        oldText: z.string().min(1),
        newText: z.string(),
        occurrence: z.number().int().positive().optional()
      })).min(1).max(100)
    }
  }, async({ handleId, expectedRevision, expectedHash, edits }) => result(
    await callScopedBridge('agent_edit_document', {
      handleId,
      expectedRevision,
      expectedHash,
      edits
    })
  ))

  if (agentMutationsEnabled) server.registerTool('annotamd_replace_document', {
    title: '替换 Muya 文档',
    description: '在指定 revision/hash 上用完整 canonical Markdown 立即替换本次授权文档。只适合无法表达为精确局部替换的修改。',
    inputSchema: {
      handleId: z.string().min(1),
      expectedRevision: z.number().int().nonnegative(),
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
      markdown: z.string()
    }
  }, async({ handleId, expectedRevision, expectedHash, markdown }) => result(
    await callScopedBridge('agent_replace_document', {
      handleId,
      expectedRevision,
      expectedHash,
      markdown
    })
  ))
}

const transport = new StdioServerTransport()
await server.connect(transport)
const heartbeat = setInterval(() => {
  if (initialized) void touchBridge().catch(() => {})
}, 10_000)
heartbeat.unref()
