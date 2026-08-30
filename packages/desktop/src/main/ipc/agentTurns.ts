import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { dirname } from 'node:path'
import type {
  AnnotaMDAgentTurnRequest,
  AnnotaMDAgentTurnStartedEvent,
  AnnotaMDAgentTurnStopRequest
} from '@shared/types/agentTurns'
import {
  buildCommentAgentPrompt,
  normalizeCommentAgentReply
} from '@shared/types/agentTurns'
import { getAiWorkspaceService } from '../ai'
import type { AiWorkspaceOwner } from '../ai/AiWorkspaceService'
import { getCommentService } from '../comments'

const activeCommentTurns = new Map<string, AnnotaMDAgentTurnStartedEvent>()

const activeTurnKey = (sender: WebContents, commentId: string): string => (
  `${sender.id}:${commentId}`
)

const asOwner = (sender: WebContents): AiWorkspaceOwner => ({
  id: sender.id,
  send: (channel, event) => sender.send(channel, event),
  isDestroyed: () => sender.isDestroyed()
})

const windowIdFor = (sender: WebContents): number => {
  const window = BrowserWindow.fromWebContents(sender)
  if (!window) throw new Error('发送批注前需要打开 AnnotaMD 编辑器窗口')
  return window.id
}

export const runUnifiedCommentAgentTurn = async(
  sender: WebContents,
  request: AnnotaMDAgentTurnRequest
) => {
  const latestMessage = request.latestMessage.trim()
  if (!request.filePath || !request.commentId || !latestMessage) {
    throw new Error('发送给 Agent 的评论信息不完整')
  }
  if (
    !request.document.documentHandleId ||
    !request.document.documentId ||
    !request.document.documentUri ||
    request.document.filePath !== request.filePath
  ) {
    throw new Error('当前批注与活动文档不匹配')
  }

  const commentService = getCommentService()
  const thread = commentService.getComment(request.commentId)
  if (!thread || thread.document.filePath !== request.filePath) {
    throw new Error('当前评论不存在或不属于该文档')
  }

  const key = activeTurnKey(sender, request.commentId)
  try {
    const service = getAiWorkspaceService()
    const owner = asOwner(sender)
    const completion = await service.sendAndWait(owner, {
      ...(request.conversationId ? { conversationId: request.conversationId } : {}),
      text: buildCommentAgentPrompt(
        request.filePath,
        thread.comment,
        latestMessage,
        request.document.markdown
      ),
      selection: {
        mode: 'agent',
        configId: request.selection?.configId,
        modelId: request.selection?.modelId,
        effort: request.selection?.effort,
        permissionMode: request.selection?.permissionMode ?? 'request',
        templateIds: []
      },
      workspacePath: request.workspacePath || dirname(request.filePath),
      documentHandleId: request.document.documentHandleId,
      documentId: request.document.documentId,
      documentUri: request.document.documentUri,
      filePath: request.filePath,
      markdown: request.document.markdown,
      documentRevision: request.document.revision,
      documentContentHash: request.document.contentHash,
      documentDirty: request.document.dirty,
      selectionText: thread.comment.exactQuote ?? thread.comment.quote
    }, windowIdFor(sender), (turn) => {
      const started: AnnotaMDAgentTurnStartedEvent = {
        commentId: request.commentId,
        conversationId: turn.conversationId,
        turnId: turn.turnId
      }
      activeCommentTurns.set(key, started)
      sender.send('annotamd::agent-turns::started', started)
    })

    if (completion.status !== 'completed') {
      throw new Error(completion.error || (completion.status === 'cancelled'
        ? 'Agent 处理已停止'
        : 'Agent 处理失败'))
    }
    const reply = normalizeCommentAgentReply(completion.assistantMessage.content)
    if (!reply) throw new Error('Agent 没有返回可显示的评论内容')
    const changeSet = service.listChangeSets(owner, completion.conversationId)
      .find(candidate => candidate.turnId === completion.turnId)
    return {
      conversationId: completion.conversationId,
      reply,
      ...(changeSet ? { changeSet } : {})
    }
  } finally {
    activeCommentTurns.delete(key)
  }
}

export const stopUnifiedCommentAgentTurn = async(
  sender: WebContents,
  request: AnnotaMDAgentTurnStopRequest
): Promise<boolean> => {
  const active = activeCommentTurns.get(activeTurnKey(sender, request.commentId))
  if (
    !active ||
    active.conversationId !== request.conversationId ||
    active.turnId !== request.turnId
  ) return false
  return await getAiWorkspaceService().stop(asOwner(sender), {
    conversationId: active.conversationId,
    turnId: active.turnId
  })
}

export const registerAgentTurnHandlers = (): void => {
  ipcMain.handle(
    'annotamd::agent-turns::run',
    (event, request: AnnotaMDAgentTurnRequest) => runUnifiedCommentAgentTurn(event.sender, request)
  )
  ipcMain.handle(
    'annotamd::agent-turns::stop',
    (event, request: AnnotaMDAgentTurnStopRequest) => stopUnifiedCommentAgentTurn(event.sender, request)
  )
}
