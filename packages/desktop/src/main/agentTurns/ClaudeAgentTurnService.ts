import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import diff from 'fast-diff'
import type {
  AnnotaMDAgentTurnRequest,
  AnnotaMDAgentTurnResult
} from '@shared/types/agentTurns'
import { DEFAULT_AGENT_PROMPT_TEMPLATE } from '@shared/types/agentTurns'
import type { AnnotaMDCommentRecord } from '@shared/types/comments'
import { parseAgentCommand } from '@shared/types/agentProfiles'
import { broadcastCommentsChanged, getCommentService } from '../comments'

const TURN_TIMEOUT_MS = 10 * 60 * 1000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const MAX_COMMENT_REPLY_CHARS = 2000

interface ClaudeJsonResult {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  session_id?: string
  message?: {
    id?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }
}

export const buildClaudeTurnArgs = (
  configuredArgs: string[],
  sessionId: string,
  resume: boolean
): string[] => {
  const args = [...configuredArgs]
  if (!args.includes('-p') && !args.includes('--print')) args.push('-p')
  const outputFormatIndex = args.findIndex((arg) => (
    arg === '--output-format' || arg.startsWith('--output-format=')
  ))
  if (outputFormatIndex < 0) {
    args.push('--output-format', 'stream-json')
  } else if (args[outputFormatIndex] === '--output-format') {
    args[outputFormatIndex + 1] = 'stream-json'
  } else {
    args[outputFormatIndex] = '--output-format=stream-json'
  }
  if (!args.includes('--verbose')) args.push('--verbose')
  if (!args.includes('--permission-mode')) args.push('--permission-mode', 'auto')
  args.push(...(resume ? ['--resume', sessionId] : ['--session-id', sessionId]))
  return args
}

const FIXED_OUTPUT_INSTRUCTIONS = `

—— AnnotaMD 固定输出要求 ——
你已经获得处理当前批注所需的上下文，不要依赖 AnnotaMD MCP 读取或回复评论。
你的最终输出会直接作为一条 AnnotaMD 评论显示。只输出简短的纯文字结果，不要使用 Markdown、标题、列表、代码块，也不要描述思考过程或工具调用过程。一般不超过 300 个汉字或 600 个字符。
如果只需要编辑正文，可以不输出最终内容；如果输出，请直接给出要显示在评论里的文字。`

const formatCommentThread = (comment: AnnotaMDCommentRecord): string => [
  `Local：${comment.body}`,
  ...comment.replies.map((reply) => `${reply.author === 'agent' ? 'Agent' : 'Local'}：${reply.body}`)
].join('\n')

const formatAllComments = (comments: AnnotaMDCommentRecord[]): string => comments.length
  ? comments.map((comment, index) => [
      `评论 ${index + 1}（${comment.id}）`,
      `被批注内容：${comment.exactQuote ?? comment.quote}`,
      formatCommentThread(comment)
    ].join('\n')).join('\n\n')
  : '无'

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

const wholeRangeDeleted = (
  before: string,
  after: string,
  range: { start: number; end: number }
): boolean => {
  let oldOffset = 0
  let deletedLength = 0
  for (const [kind, text] of diff(before, after)) {
    if (kind === diff.INSERT) continue
    const nextOffset = oldOffset + text.length
    if (kind === diff.DELETE) {
      deletedLength += Math.max(
        0,
        Math.min(nextOffset, range.end) - Math.max(oldOffset, range.start)
      )
    }
    oldOffset = nextOffset
  }
  return deletedLength >= range.end - range.start
}

export const buildClaudeTurnPrompt = (
  promptTemplate: string,
  filePath: string,
  comment: AnnotaMDCommentRecord,
  latestMessage: string,
  markdown: string,
  allComments: AnnotaMDCommentRecord[]
): string => {
  const variables: Record<string, string> = {
    '{{当前文档路径}}': filePath,
    '{{当前评论ID}}': comment.id,
    '{{当前评论}}': latestMessage,
    '{{当前评论线程}}': formatCommentThread(comment),
    '{{被批注原文}}': comment.exactQuote ?? comment.quote,
    '{{被批注前后上下文100字}}': quoteContext(markdown, comment),
    '{{当前文档所有评论}}': formatAllComments(allComments)
  }
  let prompt = (promptTemplate.trim() || DEFAULT_AGENT_PROMPT_TEMPLATE)
  for (const [variable, value] of Object.entries(variables)) {
    prompt = prompt.split(variable).join(value)
  }
  return `${prompt.trim()}${FIXED_OUTPUT_INSTRUCTIONS}`
}

export const parseClaudeTurnOutput = (stdout: string): { result: string; sessionId?: string } => {
  let payloads: ClaudeJsonResult[]
  try {
    payloads = stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ClaudeJsonResult)
  } catch {
    throw new Error('Claude Code 返回了无法解析的结果')
  }
  const finalPayload = [...payloads].reverse().find((payload) => payload.type === 'result')
    ?? payloads.at(-1)
  if (!finalPayload) throw new Error('Claude Code 没有返回结果')
  if (finalPayload.is_error || finalPayload.subtype === 'error') {
    throw new Error(finalPayload.result?.trim() || 'Claude Code 处理失败')
  }
  const assistantMessages = new Map<string, string>()
  payloads.forEach((payload, index) => {
    if (payload.type !== 'assistant') return
    const text = payload.message?.content
      ?.filter((content) => content.type === 'text' && content.text)
      .map((content) => content.text)
      .join('') ?? ''
    if (!text) return
    const messageId = payload.message?.id ?? `message-${index}`
    assistantMessages.set(messageId, `${assistantMessages.get(messageId) ?? ''}${text}`)
  })
  const assistantText = [...assistantMessages.values()].filter(Boolean).at(-1)
  return {
    result: (finalPayload.result?.trim() || assistantText || '')
      .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, MAX_COMMENT_REPLY_CHARS),
    sessionId: finalPayload.session_id
  }
}

const runClaude = (
  command: string,
  args: string[],
  cwd: string,
  prompt: string,
  filePath: string
): Promise<{ stdout: string; stderr: string }> => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  activeChildren.add(child)
  activeChildrenByDocument.set(filePath, child)
  let stdout = ''
  let stderr = ''
  let outputBytes = 0
  let settled = false

  const finish = (callback: () => void): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    activeChildren.delete(child)
    if (activeChildrenByDocument.get(filePath) === child) {
      activeChildrenByDocument.delete(filePath)
    }
    callback()
  }
  const append = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
    outputBytes += chunk.byteLength
    if (outputBytes > MAX_OUTPUT_BYTES) {
      child.kill()
      finish(() => reject(new Error('Claude Code 输出过大，任务已停止')))
      return
    }
    if (target === 'stdout') stdout += chunk.toString('utf8')
    else stderr += chunk.toString('utf8')
  }

  child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
  child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))
  child.once('error', (error) => finish(() => reject(error)))
  child.once('close', (code) => finish(() => {
    // Claude reports structured API/auth failures on stdout with a non-zero exit code.
    // Let the JSON parser surface that useful message when it is available.
    if (code === 0 || stdout.trim()) resolve({ stdout, stderr })
    else reject(new Error(stderr.trim() || `Claude Code 已退出（${code ?? 'unknown'}）`))
  }))
  const timer = setTimeout(() => {
    child.kill()
    finish(() => reject(new Error('Claude Code 处理超时')))
  }, TURN_TIMEOUT_MS)
  timer.unref()
  child.stdin.end(prompt)
})

const activeChildren = new Set<ChildProcessWithoutNullStreams>()
const activeChildrenByDocument = new Map<string, ChildProcessWithoutNullStreams>()
const runningDocuments = new Set<string>()
const cancelledDocuments = new Set<string>()

export const stopAllAgentTurns = (): void => {
  for (const child of activeChildren) child.kill()
  activeChildren.clear()
  activeChildrenByDocument.clear()
  runningDocuments.clear()
  cancelledDocuments.clear()
}

export const stopAgentTurnForDocument = (filePath: string): void => {
  const child = activeChildrenByDocument.get(filePath)
  if (!child) return
  cancelledDocuments.add(filePath)
  child.kill()
}

export const runClaudeAgentTurn = async(
  request: AnnotaMDAgentTurnRequest
): Promise<AnnotaMDAgentTurnResult> => {
  if (request.profile.kind !== 'claude-code') {
    throw new Error('当前版本只支持通过 Claude Code 发送 Agent 评论')
  }
  if (!request.filePath || !request.commentId || !request.latestMessage.trim()) {
    throw new Error('发送给 Agent 的评论信息不完整')
  }
  if (runningDocuments.has(request.filePath)) {
    throw new Error('当前文档已有 Agent 正在处理评论')
  }

  const commentService = getCommentService()
  const before = commentService.getComment(request.commentId)
  if (!before || before.document.filePath !== request.filePath) {
    throw new Error('当前评论不存在或不属于该文档')
  }

  runningDocuments.add(request.filePath)
  cancelledDocuments.delete(request.filePath)
  const sessionId = request.sessionId || randomUUID()
  const markdownBefore = readFileSync(request.filePath, 'utf8')
  try {
    const [command, ...configuredArgs] = parseAgentCommand(request.profile.command)
    if (!command) throw new Error('Agent 完整命令不能为空')
    const { stdout } = await runClaude(
      command,
      buildClaudeTurnArgs(configuredArgs, sessionId, Boolean(request.sessionId)),
      dirname(request.filePath),
      buildClaudeTurnPrompt(
        request.promptTemplate,
        request.filePath,
        before.comment,
        request.latestMessage,
        markdownBefore,
        commentService.load(request.filePath, markdownBefore).comments
      ),
      request.filePath
    )
    if (cancelledDocuments.has(request.filePath)) {
      throw new Error('文档已关闭，Agent 处理已停止')
    }
    const parsed = parseClaudeTurnOutput(stdout)
    const markdownAfter = readFileSync(request.filePath, 'utf8')
    const documentChanged = markdownAfter !== markdownBefore
    const rangeBefore = annotatedRange(markdownBefore, before.comment)
    const selectionWasReplaced = rangeBefore != null && wholeRangeDeleted(
      markdownBefore,
      markdownAfter,
      rangeBefore
    )
    let current = commentService.getComment(request.commentId)
    if (before.comment.scope === 'selection' && documentChanged && (
      !current || selectionWasReplaced
    )) {
      current = commentService.preserveTemporaryDetached(request.filePath, before.comment)
    }
    if (!current) throw new Error('Claude Code 处理期间当前评论已被删除')
    const newReplies = current.comment.replies.slice(before.comment.replies.length)
    let replyAdded = newReplies.some((reply) => reply.author === 'agent')
    const outputAlreadyAdded = newReplies.some((reply) => (
      reply.author === 'agent' && reply.body.trim() === parsed.result
    ))
    if (parsed.result && !outputAlreadyAdded) {
      commentService.reply(
        request.commentId,
        parsed.result,
        'agent',
        current.document.revision
      )
      replyAdded = true
    }
    if (!replyAdded && !documentChanged) {
      throw new Error('Claude Code 没有返回内容，也没有修改当前文档')
    }
    broadcastCommentsChanged(request.filePath)
    return { sessionId: parsed.sessionId ?? sessionId, replyAdded, documentChanged }
  } finally {
    runningDocuments.delete(request.filePath)
    cancelledDocuments.delete(request.filePath)
  }
}
