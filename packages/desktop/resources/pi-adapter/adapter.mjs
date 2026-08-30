import { createHash, randomUUID } from 'node:crypto'

import {
  VERSION as PI_VERSION,
  createEditTool,
  createReadTool,
  createWriteTool
} from '@earendil-works/pi-coding-agent'

const PROTOCOL_VERSION = 1
const ADAPTER_VERSION = '1.0.0'
const BRIDGE_TITLE = 'annotamd.bridge.v1'
const WIRE_PREFIX = 'am1.'
const READY_PREFIX = 'ANNOTAMD_ADAPTER_READY:'
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
const MAX_WIRE_BYTES = 18 * 1024 * 1024
const MAX_WIRE_CHARS = Math.ceil((MAX_WIRE_BYTES * 4) / 3) + WIRE_PREFIX.length + 4
const MAX_PATH_BYTES = 32 * 1024
const MAX_ID_BYTES = 1024
const MAX_FEEDBACK_BYTES = 64 * 1024
const REQUIRED_TOOL_NAMES = ['read', 'edit', 'write']
const READ_ONLY_TOOL_NAMES = new Set(['read', 'grep', 'find', 'ls'])

class BridgeProtocolError extends Error {
  constructor(message) {
    super(`AnnotaMD bridge protocol error: ${message}`)
    this.name = 'BridgeProtocolError'
  }
}

class BridgeDecisionError extends Error {
  constructor(decision, message = '') {
    super(message || decision)
    this.name = 'BridgeDecisionError'
    this.decision = decision
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8')
}

function requireString(record, key, maxBytes, { allowEmpty = false } = {}) {
  const value = record[key]
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new BridgeProtocolError(`${key} must be a${allowEmpty ? '' : ' non-empty'} string`)
  }
  if (utf8Bytes(value) > maxBytes) {
    throw new BridgeProtocolError(`${key} exceeds the allowed size`)
  }
  return value
}

function requireHash(record, key) {
  const value = requireString(record, key, 64)
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new BridgeProtocolError(`${key} must be a lowercase SHA-256 digest`)
  }
  return value
}

function assertEnvelope(record, kind) {
  if (!isRecord(record)) {
    throw new BridgeProtocolError('response must be an object')
  }
  if (record.v !== PROTOCOL_VERSION) {
    throw new BridgeProtocolError(`unsupported protocol version: ${String(record.v)}`)
  }
  if (record.kind !== kind) {
    throw new BridgeProtocolError(`expected ${kind} response`)
  }
}

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function validateDocumentContent(content, fieldName) {
  if (typeof content !== 'string') {
    throw new BridgeProtocolError(`${fieldName} must be a string`)
  }
  if (utf8Bytes(content) > MAX_DOCUMENT_BYTES) {
    throw new BridgeProtocolError(`${fieldName} exceeds the 8 MiB document limit`)
  }
  return content
}

function encodeEnvelope(value) {
  const json = JSON.stringify(value)
  if (utf8Bytes(json) > MAX_WIRE_BYTES) {
    throw new BridgeProtocolError('request exceeds the bridge wire limit')
  }
  return `${WIRE_PREFIX}${Buffer.from(json, 'utf8').toString('base64url')}`
}

function encodeReadyPayload(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeEnvelope(value) {
  if (typeof value !== 'string' || !value.startsWith(WIRE_PREFIX)) {
    throw new BridgeProtocolError(`response must use the ${WIRE_PREFIX} base64url envelope`)
  }
  if (value.length > MAX_WIRE_CHARS) {
    throw new BridgeProtocolError('response exceeds the bridge wire limit')
  }

  const encoded = value.slice(WIRE_PREFIX.length)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new BridgeProtocolError('response contains invalid base64url data')
  }

  const decoded = Buffer.from(encoded, 'base64url')
  if (decoded.byteLength > MAX_WIRE_BYTES) {
    throw new BridgeProtocolError('response exceeds the bridge wire limit')
  }
  if (decoded.toString('base64url') !== encoded) {
    throw new BridgeProtocolError('response contains non-canonical base64url data')
  }

  let parsed
  try {
    parsed = JSON.parse(decoded.toString('utf8'))
  } catch {
    throw new BridgeProtocolError('response is not valid JSON')
  }
  if (!isRecord(parsed)) {
    throw new BridgeProtocolError('response must decode to an object')
  }
  return parsed
}

function currentSessionId(ctx) {
  const sessionId = ctx.sessionManager?.getSessionId?.()
  return typeof sessionId === 'string' ? sessionId : null
}

async function requestFromHost(ctx, signal, request) {
  if (ctx.mode !== 'rpc' || !ctx.hasUI) {
    throw new BridgeProtocolError('the adapter only operates with an attached Pi RPC host')
  }
  if (signal.aborted) {
    throw signal.reason ?? new Error('operation aborted')
  }

  const response = await ctx.ui.input(BRIDGE_TITLE, encodeEnvelope(request), { signal })
  if (response === undefined) {
    throw new BridgeProtocolError('the host cancelled or did not answer the request')
  }
  return decodeEnvelope(response)
}

async function requestSnapshot(ctx, signal, toolCallId, toolName, path) {
  if (utf8Bytes(path) > MAX_PATH_BYTES) {
    throw new BridgeProtocolError('path exceeds the allowed size')
  }

  const response = await requestFromHost(ctx, signal, {
    v: PROTOCOL_VERSION,
    kind: 'snapshot',
    sessionId: currentSessionId(ctx),
    toolCallId,
    toolName,
    path
  })
  assertEnvelope(response, 'snapshot')

  if (response.handled === false) {
    return { handled: false }
  }
  if (response.handled !== true) {
    throw new BridgeProtocolError('snapshot.handled must be a boolean')
  }

  const content = validateDocumentContent(response.content, 'snapshot.content')
  const contentHash = requireHash(response, 'contentHash')
  if (sha256(content) !== contentHash) {
    throw new BridgeProtocolError('snapshot content hash does not match its content')
  }

  return {
    handled: true,
    documentHandleId: requireString(response, 'documentHandleId', MAX_ID_BYTES),
    documentId: requireString(response, 'documentId', MAX_ID_BYTES),
    filePath: requireString(response, 'filePath', MAX_PATH_BYTES),
    content,
    contentHash
  }
}

async function requestProposalDecision(ctx, signal, toolCallId, toolName, path, snapshot, proposedContent) {
  const candidate = validateDocumentContent(proposedContent, 'proposal.proposedContent')
  const proposedHash = sha256(candidate)
  const proposalId = randomUUID()

  const response = await requestFromHost(ctx, signal, {
    v: PROTOCOL_VERSION,
    kind: 'proposal',
    proposalId,
    sessionId: currentSessionId(ctx),
    toolCallId,
    toolName,
    path,
    documentHandleId: snapshot.documentHandleId,
    documentId: snapshot.documentId,
    filePath: snapshot.filePath,
    baseHash: snapshot.contentHash,
    originalContent: snapshot.content,
    proposedContent: candidate,
    proposedHash
  })
  assertEnvelope(response, 'decision')

  if (response.proposalId !== proposalId) {
    throw new BridgeProtocolError('decision proposalId does not match the request')
  }

  switch (response.decision) {
    case 'accepted': {
      const appliedHash = requireHash(response, 'appliedHash')
      if (appliedHash !== proposedHash) {
        throw new BridgeProtocolError('accepted proposal hash does not match the proposed content')
      }
      return
    }
    case 'rejected':
      throw new BridgeDecisionError('rejected', 'The user rejected this document change.')
    case 'feedback': {
      const feedback = requireString(response, 'feedback', MAX_FEEDBACK_BYTES)
      throw new BridgeDecisionError('feedback', feedback)
    }
    case 'conflict': {
      const message =
        response.message === undefined
          ? 'The document changed before this proposal could be applied.'
          : requireString(response, 'message', MAX_FEEDBACK_BYTES)
      throw new BridgeDecisionError('conflict', message)
    }
    default:
      throw new BridgeProtocolError(`unsupported proposal decision: ${String(response.decision)}`)
  }
}

async function requestToolApproval(ctx, event) {
  const response = await requestFromHost(ctx, new AbortController().signal, {
    v: PROTOCOL_VERSION,
    kind: 'approval',
    sessionId: currentSessionId(ctx),
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input
  })
  assertEnvelope(response, 'approval-decision')
  return response.decision === 'accepted'
}

function routeCache(loader) {
  const routes = new Map()
  return async (path) => {
    let pending = routes.get(path)
    if (!pending) {
      pending = loader(path)
      routes.set(path, pending)
    }
    return pending
  }
}

function decisionResult(error, ctx) {
  if (!(error instanceof BridgeDecisionError)) {
    throw error
  }

  if (error.decision === 'rejected') {
    ctx.abort()
    return {
      content: [{ type: 'text', text: error.message }],
      details: undefined,
      terminate: true
    }
  }

  if (error.decision === 'feedback') {
    return {
      content: [{ type: 'text', text: `The change was not applied. User feedback: ${error.message}` }],
      details: undefined
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `The change was not applied because the document is stale: ${error.message} Re-read the document before proposing another change.`
      }
    ],
    details: undefined
  }
}

export default function annotaMDPiAdapter(pi) {
  const initialCwd = process.cwd()
  const baseReadTool = createReadTool(initialCwd)
  const baseEditTool = createEditTool(initialCwd)
  const baseWriteTool = createWriteTool(initialCwd)

  pi.registerTool({
    ...baseReadTool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const initialPath = params.path
      const initialRoute = await requestSnapshot(ctx, signal, toolCallId, 'read', initialPath)
      if (!initialRoute.handled) {
        return baseReadTool.execute(toolCallId, params, signal, onUpdate)
      }
      const getRoute = routeCache(async (path) => {
        if (path === initialPath) return initialRoute
        const route = await requestSnapshot(ctx, signal, toolCallId, 'read', path)
        if (!route.handled) {
          throw new BridgeProtocolError('read target is not the current AnnotaMD document')
        }
        return route
      })
      const tool = createReadTool(ctx.cwd, {
        operations: {
          async access(path) {
            await getRoute(path)
          },
          async readFile(path) {
            const route = await getRoute(path)
            return Buffer.from(route.content, 'utf8')
          },
          async detectImageMimeType() {
            return null
          }
        }
      })
      return tool.execute(toolCallId, params, signal, onUpdate)
    }
  })

  pi.registerTool({
    ...baseEditTool,
    executionMode: 'sequential',
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const initialPath = params.path
      const initialRoute = await requestSnapshot(ctx, signal, toolCallId, 'edit', initialPath)
      if (!initialRoute.handled) {
        return baseEditTool.execute(toolCallId, params, signal, onUpdate)
      }
      const getRoute = routeCache(async (path) => {
        if (path === initialPath) return initialRoute
        const route = await requestSnapshot(ctx, signal, toolCallId, 'edit', path)
        if (!route.handled) {
          throw new BridgeProtocolError('edit target is not the current AnnotaMD document')
        }
        return route
      })
      const tool = createEditTool(ctx.cwd, {
        operations: {
          async access(path) {
            await getRoute(path)
          },
          async readFile(path) {
            const route = await getRoute(path)
            return Buffer.from(route.content, 'utf8')
          },
          async writeFile(path, content) {
            const route = await getRoute(path)
            await requestProposalDecision(ctx, signal, toolCallId, 'edit', path, route, content)
          }
        }
      })

      try {
        return await tool.execute(toolCallId, params, signal, onUpdate)
      } catch (error) {
        return decisionResult(error, ctx)
      }
    }
  })

  pi.registerTool({
    ...baseWriteTool,
    executionMode: 'sequential',
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const initialPath = params.path
      const initialRoute = await requestSnapshot(ctx, signal, toolCallId, 'write', initialPath)
      if (!initialRoute.handled) {
        return baseWriteTool.execute(toolCallId, params, signal, onUpdate)
      }
      const getRoute = routeCache(async (path) => {
        if (path === initialPath) return initialRoute
        const route = await requestSnapshot(ctx, signal, toolCallId, 'write', path)
        if (!route.handled) {
          throw new BridgeProtocolError('write target is not the current AnnotaMD document')
        }
        return route
      })
      const tool = createWriteTool(ctx.cwd, {
        operations: {
          async mkdir() {
            // The host applies accepted proposals; the adapter must not mutate the filesystem first.
          },
          async writeFile(path, content) {
            const route = await getRoute(path)
            await requestProposalDecision(ctx, signal, toolCallId, 'write', path, route, content)
          }
        }
      })

      try {
        return await tool.execute(toolCallId, params, signal, onUpdate)
      } catch (error) {
        return decisionResult(error, ctx)
      }
    }
  })

  pi.on('tool_call', async (event, ctx) => {
    if (
      READ_ONLY_TOOL_NAMES.has(event.toolName)
    ) return
    try {
      if (!await requestToolApproval(ctx, event)) {
        return { block: true, reason: 'The user denied this operation.' }
      }
    } catch (error) {
      return {
        block: true,
        reason: error instanceof Error ? error.message : 'The approval request failed.'
      }
    }
  })

  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'rpc') return
    const allTools = ctx.getAllTools()
    const activeTools = ctx.getActiveTools()
    const tools = Object.fromEntries(REQUIRED_TOOL_NAMES.map((name) => {
      const tool = allTools.find((candidate) => candidate.name === name)
      return [name, {
        sourceInfo: {
          path: typeof tool?.sourceInfo?.path === 'string' ? tool.sourceInfo.path : ''
        }
      }]
    }))
    const ready = encodeReadyPayload({
      adapterProtocol: PROTOCOL_VERSION,
      adapterVersion: ADAPTER_VERSION,
      piVersion: PI_VERSION,
      capabilities: ['snapshot-v1', 'proposal-v1', 'approval-v1', 'feedback-v1', 'abortable-input'],
      activeTools,
      tools,
      toolOwners: {
        read: 'annotamd-pi-adapter/v1',
        edit: 'annotamd-pi-adapter/v1',
        write: 'annotamd-pi-adapter/v1'
      }
    })
    ctx.ui.notify(`${READY_PREFIX}${ready}`, 'info')
  })
}
