import { randomBytes } from 'node:crypto'
import { chmodSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { AnnotaMDMcpStatus } from '@shared/types/comments'
import {
  broadcastCommentsChanged,
  getCommentService
} from '.'

interface BridgeRequest {
  method: string
  params?: Record<string, unknown>
}

interface ConnectedClient {
  lastSeenAt: number
  version?: string
  connected: boolean
}

let server: Server | null = null
let connectionPath = ''
let enabled = false
let clientCleanupTimer: NodeJS.Timeout | null = null
let bridgeTransition: Promise<void> = Promise.resolve()
const clients = new Map<string, ConnectedClient>()
const CLIENT_TTL_MS = 30_000

const broadcastMcpStatus = (): void => {
  const status = getAgentBridgeStatus()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('mt::comments::mcp-status-changed', status)
  }
}

const markStaleClientsDisconnected = (): boolean => {
  const cutoff = Date.now() - CLIENT_TTL_MS
  let changed = false
  for (const client of clients.values()) {
    if (client.connected && client.lastSeenAt < cutoff) {
      client.connected = false
      changed = true
    }
  }
  return changed
}

export const getAgentBridgeStatus = (): AnnotaMDMcpStatus => {
  markStaleClientsDisconnected()
  return {
    enabled,
    running: server !== null,
    clients: [...clients.entries()]
      .map(([name, client]) => ({ name, ...client }))
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

const commentIdsParam = (params: Record<string, unknown>): string[] => {
  const commentId = params.commentId
  const commentIds = params.commentIds
  const hasCommentId = typeof commentId === 'string' && commentId.length > 0
  const hasCommentIds = Array.isArray(commentIds)
    && commentIds.length > 0
    && commentIds.every((value) => typeof value === 'string' && value.length > 0)
  if (hasCommentId === hasCommentIds) {
    throw new Error('Provide exactly one of commentId or commentIds')
  }
  return hasCommentId ? [commentId] : [...commentIds as string[]]
}

const dispatch = async({ method, params = {} }: BridgeRequest): Promise<unknown> => {
  const service = getCommentService()
  switch (method) {
    case 'ping':
      return { application: 'AnnotaMD', pid: process.pid }
    case 'register_client': {
      const name = stringParam(params, 'name')
      const version = typeof params.version === 'string' && params.version.trim()
        ? params.version.trim()
        : undefined
      clients.set(name, { lastSeenAt: Date.now(), version, connected: true })
      broadcastMcpStatus()
      return getAgentBridgeStatus()
    }
    case 'list_comments': {
      const comments = service.listComments(stringParam(params, 'filePath'))
      if (!comments) throw new Error('Commented Markdown file not found')
      return comments
    }
    case 'get_comment':
      return service.getComments(commentIdsParam(params))
    case 'reply_comment': {
      const result = service.reply(
        stringParam(params, 'commentId'),
        stringParam(params, 'body'),
        'agent',
        numberParam(params, 'expectedRevision')
      )
      broadcastCommentsChanged(result.filePath)
      return result
    }
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
    for (const client of clients.values()) client.connected = false
    broadcastMcpStatus()
    throw error
  }

  clientCleanupTimer = setInterval(() => {
    if (markStaleClientsDisconnected()) broadcastMcpStatus()
  }, 5_000)
  clientCleanupTimer.unref()
  broadcastMcpStatus()
}

export const stopAgentBridgeServer = async(): Promise<void> => {
  enabled = false
  if (clientCleanupTimer) clearInterval(clientCleanupTimer)
  clientCleanupTimer = null
  const activeServer = server
  server = null
  if (activeServer) await new Promise<void>((resolve) => activeServer.close(() => resolve()))
  for (const client of clients.values()) client.connected = false
  if (connectionPath && existsSync(connectionPath)) unlinkSync(connectionPath)
  broadcastMcpStatus()
}

export const setAgentBridgeEnabled = async(nextEnabled: boolean): Promise<void> => {
  bridgeTransition = bridgeTransition
    .catch(() => {})
    .then(() => nextEnabled ? startAgentBridgeServer() : stopAgentBridgeServer())
  await bridgeTransition
}
