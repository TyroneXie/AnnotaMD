import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { AnnotaMDAgentEditResult } from '@shared/types/comments'
import type { AnnotaMDMcpStatus } from '@shared/types/comments'
import {
  broadcastCommentsChanged,
  getCommentService
} from '.'

interface BridgeRequest {
  method: string
  params?: Record<string, unknown>
}

interface PendingEdit {
  resolve: (result: AnnotaMDAgentEditResult) => void
  timer: NodeJS.Timeout
}

let server: Server | null = null
let connectionPath = ''
let enabled = false
let handlersRegistered = false
let clientCleanupTimer: NodeJS.Timeout | null = null
let bridgeTransition: Promise<void> = Promise.resolve()
const pendingEdits = new Map<string, PendingEdit>()
const clients = new Map<string, number>()
const CLIENT_TTL_MS = 30_000

const broadcastMcpStatus = (): void => {
  const status = getAgentBridgeStatus()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('mt::comments::mcp-status-changed', status)
  }
}

const pruneClients = (): boolean => {
  const cutoff = Date.now() - CLIENT_TTL_MS
  let changed = false
  for (const [name, lastSeenAt] of clients) {
    if (lastSeenAt < cutoff) {
      clients.delete(name)
      changed = true
    }
  }
  return changed
}

export const getAgentBridgeStatus = (): AnnotaMDMcpStatus => {
  pruneClients()
  return {
    enabled,
    running: server !== null,
    clients: [...clients.entries()]
      .map(([name, lastSeenAt]) => ({ name, lastSeenAt }))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  }
}

const json = (response: ServerResponse, status: number, value: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

const readBody = async(request: IncomingMessage): Promise<BridgeRequest> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 1024 * 1024) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as BridgeRequest
}

const stringParam = (params: Record<string, unknown>, key: string): string => {
  const value = params[key]
  if (typeof value !== 'string' || !value) throw new Error(`Missing parameter: ${key}`)
  return value
}

const numberParam = (params: Record<string, unknown>, key: string): number => {
  const value = params[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Missing parameter: ${key}`)
  }
  return value
}

const requestRendererEdit = async(
  commentId: string,
  replacement: string,
  summary: string | undefined,
  expectedRevision: number
): Promise<AnnotaMDAgentEditResult> => {
  const thread = getCommentService().getComment(commentId)
  if (!thread) throw new Error(`Comment not found: ${commentId}`)
  if (thread.document.revision !== expectedRevision) {
    throw new Error(`Stale document revision: ${thread.document.revision}`)
  }
  const requestId = randomUUID()
  const result = new Promise<AnnotaMDAgentEditResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingEdits.delete(requestId)
      resolve({
        requestId,
        success: false,
        error: 'Open the commented document in AnnotaMD before applying an edit'
      })
    }, 10_000)
    pendingEdits.set(requestId, { resolve, timer })
  })
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('mt::comments::apply-edit', {
      requestId,
      commentId,
      filePath: thread.document.filePath,
      replacement,
      summary,
      expectedRevision
    })
  }
  return result
}

const dispatch = async({ method, params = {} }: BridgeRequest): Promise<unknown> => {
  const service = getCommentService()
  switch (method) {
    case 'register_client': {
      const name = stringParam(params, 'name')
      clients.set(name, Date.now())
      broadcastMcpStatus()
      return getAgentBridgeStatus()
    }
    case 'inbox':
      return service.listInbox()
    case 'read_document': {
      const document = service.loadByDocumentId(stringParam(params, 'documentId'))
      if (!document) throw new Error('Document not found')
      return { ...document, markdown: readFileSync(document.filePath, 'utf8') }
    }
    case 'list_comments': {
      const document = service.loadByDocumentId(stringParam(params, 'documentId'))
      if (!document) throw new Error('Document not found')
      return document
    }
    case 'get_comment': {
      const thread = service.getComment(stringParam(params, 'commentId'))
      if (!thread) throw new Error('Comment not found')
      return thread
    }
    case 'reply_comment': {
      const thread = service.reply(
        stringParam(params, 'commentId'),
        stringParam(params, 'body'),
        'agent',
        numberParam(params, 'expectedRevision')
      )
      broadcastCommentsChanged(thread.document.filePath)
      return thread
    }
    case 'resolve_comment': {
      const thread = service.setResolved(
        stringParam(params, 'commentId'),
        params.resolved !== false,
        numberParam(params, 'expectedRevision')
      )
      broadcastCommentsChanged(thread.document.filePath)
      return thread
    }
    case 'apply_comment_edit':
      return requestRendererEdit(
        stringParam(params, 'commentId'),
        stringParam(params, 'replacement'),
        typeof params.summary === 'string' && params.summary.trim()
          ? params.summary.trim()
          : undefined,
        numberParam(params, 'expectedRevision')
      )
    default:
      throw new Error(`Unknown bridge method: ${method}`)
  }
}

export const startAgentBridgeServer = async(): Promise<void> => {
  enabled = true
  if (server) {
    broadcastMcpStatus()
    return
  }
  const token = randomBytes(32).toString('hex')
  connectionPath = join(app.getPath('userData'), 'agent-bridge.json')
  const nextServer = createServer(async(request, response) => {
    if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) {
      json(response, 401, { error: 'Unauthorized' })
      return
    }
    try {
      json(response, 200, { result: await dispatch(await readBody(request)) })
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error)
      nextServer.once('error', onError)
      nextServer.listen(0, '127.0.0.1', () => {
        nextServer.off('error', onError)
        resolve()
      })
    })
    const address = nextServer.address()
    if (!address || typeof address === 'string') throw new Error('Agent bridge did not bind a port')
    writeFileSync(connectionPath, JSON.stringify({ port: address.port, token }), { mode: 0o600 })
    chmodSync(connectionPath, 0o600)
    server = nextServer
  } catch (error) {
    if (nextServer.listening) {
      await new Promise<void>((resolve) => nextServer.close(() => resolve()))
    }
    if (connectionPath && existsSync(connectionPath)) unlinkSync(connectionPath)
    server = null
    clients.clear()
    broadcastMcpStatus()
    throw error
  }

  if (!handlersRegistered) {
    handlersRegistered = true
    ipcMain.handle('mt::comments::apply-edit-result', (_event, result: AnnotaMDAgentEditResult) => {
      const pending = pendingEdits.get(result.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      pendingEdits.delete(result.requestId)
      pending.resolve(result)
    })
  }
  clientCleanupTimer = setInterval(() => {
    if (pruneClients()) broadcastMcpStatus()
  }, 5_000)
  clientCleanupTimer.unref()
  broadcastMcpStatus()
}

export const stopAgentBridgeServer = async(): Promise<void> => {
  enabled = false
  for (const pending of pendingEdits.values()) {
    clearTimeout(pending.timer)
    pending.resolve({ requestId: '', success: false, error: 'AnnotaMD is closing' })
  }
  pendingEdits.clear()
  if (clientCleanupTimer) clearInterval(clientCleanupTimer)
  clientCleanupTimer = null
  const activeServer = server
  server = null
  if (activeServer) await new Promise<void>((resolve) => activeServer.close(() => resolve()))
  clients.clear()
  if (connectionPath && existsSync(connectionPath)) unlinkSync(connectionPath)
  broadcastMcpStatus()
}

export const setAgentBridgeEnabled = async(nextEnabled: boolean): Promise<void> => {
  bridgeTransition = bridgeTransition
    .catch(() => {})
    .then(() => nextEnabled ? startAgentBridgeServer() : stopAgentBridgeServer())
  await bridgeTransition
}
