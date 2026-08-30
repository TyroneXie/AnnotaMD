import { resolve } from 'node:path'
import type { AiApprovalDecision, AiPermissionMode } from '@shared/types/aiWorkspace'
import {
  AiRunStoppedError,
  aiHostError,
  type AiHost,
  type AiHostConfig,
  type AiHostConnectionResult,
  type AiHostEvent,
  type AiHostMessage,
  type AiHostModel,
  type AiHostRunRequest
} from './AiHost'
import { hashAgentDocument } from '../agentDocumentBridge/AgentDocumentScopeService'
import {
  createPiProcessEnvironment,
  inspectInstalledPi,
  type PiExecutableResolverOptions
} from '../piWorkspace/PiExecutableResolver'
import {
  decodePiBridgeEnvelope,
  encodePiBridgeEnvelope,
  PiRpcCompatibilityError,
  PiRpcProcessManager,
  type PiRpcAvailableModel,
  type PiRpcProcessOptions,
  type PiRpcSessionState
} from '../piWorkspace/PiRpcProcessManager'
import type { PiRuntimeReadiness } from '../piWorkspace/PiRuntimeTypes'

const BRIDGE_TITLE = 'annotamd.bridge.v1'
const SCOPE_ENVIRONMENT_KEY = 'ANNOTAMD_AGENT_SCOPE_TOKEN'
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

type JsonRecord = Record<string, unknown>

export interface PiHostAdapter extends AiHost {
  readonly kind: 'cli'
  readonly providers: readonly ['pi']
}

export interface PiAgentDocumentScopes {
  readDocument(scopeToken: string, params: Record<string, unknown>): Promise<unknown>
  editDocument(scopeToken: string, params: Record<string, unknown>): Promise<unknown>
  replaceDocument(scopeToken: string, params: Record<string, unknown>): Promise<unknown>
}

interface PiAgentRuntime {
  readonly currentState: PiRpcSessionState | undefined
  start(): Promise<{ readiness: PiRuntimeReadiness }>
  getAvailableModels(): Promise<PiRpcAvailableModel[]>
  getAvailableThinkingLevels(): Promise<string[]>
  prompt(message: string): Promise<void>
  abort(): Promise<void>
  respondToExtension(requestId: string, response: { value: string } | { cancelled: true }): void
  onMessage(listener: (message: unknown) => void): () => void
  onExit(listener: (error: Error) => void): () => void
  dispose(): void
}

type PiInspector = (
  forceRefresh?: boolean,
  options?: PiExecutableResolverOptions
) => Promise<PiRuntimeReadiness>

export interface PiAgentHostOptions {
  documentScopes: PiAgentDocumentScopes
  adapterPath: string | (() => string)
  inspectPi?: PiInspector
  createEnvironment?: typeof createPiProcessEnvironment
  createRuntime?: (options: PiRpcProcessOptions) => PiAgentRuntime
}

interface DocumentSnapshot {
  handleId: string
  documentId: string
  uri: string
  filePath?: string
  revision: number
  contentHash: string
  dirty: boolean
  markdown: string
}

interface MutationResult {
  revision: number
  contentHash: string
}

interface ActivePiRun {
  runId: string
  runtime: PiAgentRuntime
  emit: (event: AiHostEvent) => void
  scopeToken: string
  workspacePath: string
  text: string
  inputTokens?: number
  outputTokens?: number
  permissionMode: AiPermissionMode
  approvedToolCalls: Set<string>
  stopped: boolean
  settled: boolean
  resolve: () => void
  reject: (error: Error) => void
}

interface PendingPiApproval {
  runId: string
  available: Set<AiApprovalDecision>
  resolve: (approved: boolean) => void
}

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const stringValue = (
  record: JsonRecord,
  key: string,
  options: { allowEmpty?: boolean; maxBytes?: number } = {}
): string => {
  const value = record[key]
  if (typeof value !== 'string' || (!options.allowEmpty && value.length === 0)) {
    throw new PiRpcCompatibilityError(`Pi adapter request is missing ${key}.`)
  }
  if (Buffer.byteLength(value, 'utf8') > (options.maxBytes ?? MAX_DOCUMENT_BYTES)) {
    throw new PiRpcCompatibilityError(`Pi adapter field ${key} is too large.`)
  }
  return value
}

const numberValue = (record: JsonRecord, key: string): number => {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new PiRpcCompatibilityError(`Pi document response has an invalid ${key}.`)
  }
  return value
}

const asDocumentSnapshot = (value: unknown): DocumentSnapshot => {
  if (!isRecord(value)) {
    throw new PiRpcCompatibilityError('AnnotaMD returned an invalid document snapshot.')
  }
  const markdown = stringValue(value, 'markdown', { allowEmpty: true })
  const contentHash = stringValue(value, 'contentHash')
  if (contentHash !== hashAgentDocument(markdown)) {
    throw new PiRpcCompatibilityError('The live AnnotaMD document hash does not match its content.')
  }
  return {
    handleId: stringValue(value, 'handleId'),
    documentId: stringValue(value, 'documentId'),
    uri: stringValue(value, 'uri'),
    ...(typeof value.filePath === 'string' && value.filePath.length > 0
      ? { filePath: value.filePath }
      : {}),
    revision: numberValue(value, 'revision'),
    contentHash,
    dirty: value.dirty === true,
    markdown
  }
}

const asMutationResult = (value: unknown): MutationResult => {
  if (!isRecord(value)) {
    throw new PiRpcCompatibilityError('AnnotaMD returned an invalid document mutation result.')
  }
  return {
    revision: numberValue(value, 'revision'),
    contentHash: stringValue(value, 'contentHash')
  }
}

const extractText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap(item => (
    isRecord(item) && item.type === 'text' && typeof item.text === 'string'
      ? [item.text]
      : []
  )).join('')
}

const tokenValue = (record: JsonRecord, keys: readonly string[]): number | undefined => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER)
    }
  }
  return undefined
}

const addTokenCount = (current: number | undefined, next: number | undefined): number | undefined => (
  next === undefined ? current : Math.min((current ?? 0) + next, Number.MAX_SAFE_INTEGER)
)

const promptForMessages = (messages: readonly AiHostMessage[]): string => {
  const conversation = messages.map(message => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n')
  return [
    'You are running inside AnnotaMD.',
    'Use only the active read, edit, and write tools for document access.',
    'Do not use shell, grep, find, ls, or direct filesystem writes.',
    conversation
  ].filter(Boolean).join('\n\n')
}

const reasoningLevel = (config: AiHostConfig): string | undefined => {
  const configured = config.reasoningEffort?.trim()
  return configured || undefined
}

const configuredEnvironment = (config: AiHostConfig): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...config.environment }
  delete environment[SCOPE_ENVIRONMENT_KEY]
  if (config.executablePath?.trim()) {
    environment.ANNOTAMD_PI_PATH = config.executablePath.trim()
  }
  return environment
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

export class PiAgentHost implements PiHostAdapter {
  readonly kind = 'cli' as const
  readonly providers = ['pi'] as const

  private readonly documentScopes: PiAgentDocumentScopes
  private readonly adapterPath: () => string
  private readonly inspectPi: PiInspector
  private readonly createEnvironment: typeof createPiProcessEnvironment
  private readonly createRuntime: (options: PiRpcProcessOptions) => PiAgentRuntime
  private readonly active = new Map<string, ActivePiRun>()
  private readonly approvals = new Map<string, PendingPiApproval>()

  constructor(options: PiAgentHostOptions) {
    this.documentScopes = options.documentScopes
    const adapterPath = options.adapterPath
    this.adapterPath = typeof adapterPath === 'function' ? adapterPath : () => adapterPath
    this.inspectPi = options.inspectPi ?? inspectInstalledPi
    this.createEnvironment = options.createEnvironment ?? createPiProcessEnvironment
    this.createRuntime = options.createRuntime ?? (runtimeOptions => new PiRpcProcessManager(runtimeOptions))
  }

  async listModels(config: AiHostConfig): Promise<AiHostModel[]> {
    this.assertProvider(config)
    const workspacePath = process.cwd()
    const runtime = await this.prepareRuntime(config, workspacePath, false)
    try {
      const { readiness } = await runtime.start()
      const [available, effortLevels] = await Promise.all([
        runtime.getAvailableModels(),
        runtime.getAvailableThinkingLevels()
      ])
      const models: AiHostModel[] = []
      const seen = new Set<string>()
      const add = (model: AiHostModel): void => {
        if (seen.has(model.id)) return
        seen.add(model.id)
        models.push(model)
      }
      add({
        id: 'default',
        displayName: readiness.model ? `Pi default (${readiness.model})` : 'Pi default',
        effortLevels
      })
      for (const model of available) {
        add({
          id: `${model.provider}/${model.id}`,
          displayName: model.name ?? `${model.provider}/${model.id}`,
          effortLevels
        })
      }
      return models
    } finally {
      runtime.dispose()
    }
  }

  async testConnection(config: AiHostConfig): Promise<AiHostConnectionResult> {
    const startedAt = Date.now()
    try {
      const models = await this.listModels(config)
      return {
        success: true,
        message: `Pi is ready (${models.length} model option${models.length === 1 ? '' : 's'}).`,
        latencyMs: Date.now() - startedAt
      }
    } catch (error) {
      return {
        success: false,
        message: errorMessage(error),
        latencyMs: Date.now() - startedAt
      }
    }
  }

  async run(request: AiHostRunRequest, emit: (event: AiHostEvent) => void): Promise<string> {
    this.assertProvider(request.config)
    if (this.active.has(request.runId)) {
      throw new Error(`Pi run ${request.runId} is already active.`)
    }
    const scopeToken = request.mcp?.env?.[SCOPE_ENVIRONMENT_KEY]?.trim()
    if (!scopeToken) {
      throw new Error('Pi Agent requires an AnnotaMD document scope token.')
    }
    const workspacePath = request.workspacePath?.trim() || process.cwd()
    let runtime: PiAgentRuntime | undefined
    let removeMessageListener: (() => void) | undefined
    let removeExitListener: (() => void) | undefined
    let active: ActivePiRun | undefined
    try {
      runtime = await this.prepareRuntime(request.config, workspacePath, true)
      const completion = new Promise<void>((resolveCompletion, rejectCompletion) => {
        active = {
          runId: request.runId,
          runtime: runtime!,
          emit,
          scopeToken,
          workspacePath,
          text: '',
          permissionMode: request.permissionMode ?? request.config.permissionMode ?? 'request',
          approvedToolCalls: new Set(),
          stopped: false,
          settled: false,
          resolve: resolveCompletion,
          reject: rejectCompletion
        }
      })
      this.active.set(request.runId, active!)
      removeMessageListener = runtime.onMessage((message) => {
        void this.handleRuntimeMessage(request.runId, active!, message).catch(error => {
          this.failRun(active!, error)
        })
      })
      removeExitListener = runtime.onExit(error => this.failRun(active!, error))
      emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
      const { readiness } = await runtime.start()
      if (readiness.status !== 'ready') {
        throw new Error(readiness.message ?? 'Pi has no active model.')
      }
      await runtime.prompt(promptForMessages(request.messages))
      await completion
      if (active!.stopped) throw new AiRunStoppedError()
      emit({ type: 'response-complete', runId: request.runId })
      emit({
        type: 'run-finished',
        runId: request.runId,
        ...(active!.inputTokens === undefined ? {} : { inputTokens: active!.inputTokens }),
        ...(active!.outputTokens === undefined ? {} : { outputTokens: active!.outputTokens })
      })
      return active!.text
    } catch (error) {
      if (error instanceof AiRunStoppedError || active?.stopped) {
        emit({ type: 'run-stopped', runId: request.runId })
        throw error instanceof AiRunStoppedError ? error : new AiRunStoppedError()
      }
      emit(aiHostError(request.runId, 'PI_AGENT_ERROR', error))
      throw error
    } finally {
      this.rejectApprovalsForRun(request.runId)
      removeMessageListener?.()
      removeExitListener?.()
      this.active.delete(request.runId)
      runtime?.dispose()
    }
  }

  async stop(runId: string): Promise<boolean> {
    const active = this.active.get(runId)
    if (!active) return false
    active.stopped = true
    this.rejectApprovalsForRun(runId)
    try {
      await active.runtime.abort()
    } catch {
      // Stopping remains successful even when Pi exits before acknowledging abort.
    }
    this.failRun(active, new AiRunStoppedError())
    return true
  }

  dispose(): void {
    for (const active of this.active.values()) {
      active.stopped = true
      this.rejectApprovalsForRun(active.runId)
      this.failRun(active, new AiRunStoppedError())
      active.runtime.dispose()
    }
    this.active.clear()
  }

  async resolveApproval(
    runId: string,
    approvalId: string,
    decision: AiApprovalDecision
  ): Promise<boolean> {
    const pending = this.approvals.get(approvalId)
    if (!pending || pending.runId !== runId || !pending.available.has(decision)) return false
    this.approvals.delete(approvalId)
    pending.resolve(decision !== 'deny')
    return true
  }

  private assertProvider(config: AiHostConfig): void {
    if (config.provider !== 'pi') {
      throw new Error(`PiAgentHost cannot run provider ${config.provider}.`)
    }
  }

  private async prepareRuntime(
    config: AiHostConfig,
    workspacePath: string,
    applySelection: boolean
  ): Promise<PiAgentRuntime> {
    const resolverOptions: PiExecutableResolverOptions = {
      environment: configuredEnvironment(config),
      currentDirectory: workspacePath
    }
    const readiness = await this.inspectPi(true, resolverOptions)
    if (readiness.status !== 'ready' || !readiness.executablePath || !readiness.version) {
      throw new Error(readiness.message ?? 'Pi is not installed or is incompatible with AnnotaMD.')
    }
    const environment = await this.createEnvironment(readiness.executablePath, resolverOptions)
    delete environment[SCOPE_ENVIRONMENT_KEY]
    return this.createRuntime({
      executablePath: readiness.executablePath,
      ...(readiness.executableArgs?.length ? { executableArgs: readiness.executableArgs } : {}),
      piVersion: readiness.version,
      workspacePath,
      adapterPath: this.adapterPath(),
      environment,
      noSession: true,
      ...(applySelection && config.model ? { model: config.model } : {}),
      ...(applySelection && reasoningLevel(config) ? { thinkingLevel: reasoningLevel(config) } : {})
    })
  }

  private async handleRuntimeMessage(
    runId: string,
    active: ActivePiRun,
    message: unknown
  ): Promise<void> {
    if (!isRecord(message) || active.settled) return
    if (message.type === 'extension_ui_request') {
      await this.handleExtensionRequest(active, message)
      return
    }
    if (message.type === 'message_update') {
      this.handleMessageUpdate(runId, active, message)
      return
    }
    if (message.type === 'message_end') {
      this.handleMessageEnd(runId, active, message)
      return
    }
    if (message.type === 'tool_execution_start') {
      active.emit({
        type: 'tool-started',
        runId,
        toolCallId: typeof message.toolCallId === 'string' ? message.toolCallId : 'pi-tool-call',
        toolName: typeof message.toolName === 'string' ? message.toolName : 'unknown',
        ...(message.args === undefined ? {} : { input: message.args })
      })
      return
    }
    if (message.type === 'tool_execution_end') {
      active.emit({
        type: 'tool-finished',
        runId,
        toolCallId: typeof message.toolCallId === 'string' ? message.toolCallId : 'pi-tool-call',
        toolName: typeof message.toolName === 'string' ? message.toolName : 'unknown',
        ...(message.result === undefined ? {} : { output: message.result }),
        isError: message.isError === true
      })
      return
    }
    if (message.type === 'agent_settled') {
      this.finishRun(active)
      return
    }
    if (message.type === 'error') {
      throw new Error(typeof message.message === 'string' ? message.message : 'Pi Agent failed.')
    }
  }

  private handleMessageUpdate(runId: string, active: ActivePiRun, message: JsonRecord): void {
    const messageValue = message.message
    if (isRecord(messageValue) && messageValue.role !== 'assistant') return
    const update = message.assistantMessageEvent
    if (!isRecord(update)) return
    if (update.type === 'error') {
      throw new Error(typeof update.error === 'string' ? update.error : 'Pi Agent response failed.')
    }
    if (typeof update.delta !== 'string' || update.delta.length === 0) return
    if (update.type === 'text_delta') {
      active.text += update.delta
      active.emit({ type: 'text-delta', runId, delta: update.delta })
    } else if (update.type === 'thinking_delta' || update.type === 'reasoning_delta') {
      active.emit({ type: 'reasoning-delta', runId, delta: update.delta })
    }
  }

  private handleMessageEnd(runId: string, active: ActivePiRun, event: JsonRecord): void {
    const message = event.message
    if (!isRecord(message) || message.role !== 'assistant') return
    const usage = message.usage
    if (isRecord(usage)) {
      active.inputTokens = addTokenCount(
        active.inputTokens,
        tokenValue(usage, ['input', 'inputTokens', 'input_tokens'])
      )
      active.outputTokens = addTokenCount(
        active.outputTokens,
        tokenValue(usage, ['output', 'outputTokens', 'output_tokens'])
      )
    }
    if (!active.text) {
      const content = extractText(message.content)
      if (content) {
        active.text = content
        active.emit({ type: 'text-delta', runId, delta: content })
      }
    }
    if (message.stopReason === 'error') {
      throw new Error(
        typeof message.errorMessage === 'string' ? message.errorMessage : 'Pi Agent response failed.'
      )
    }
  }

  private async handleExtensionRequest(active: ActivePiRun, request: JsonRecord): Promise<void> {
    const requestId = typeof request.id === 'string' ? request.id : undefined
    if (!requestId) return
    if (
      request.method !== 'input' ||
      request.title !== BRIDGE_TITLE ||
      typeof request.placeholder !== 'string'
    ) {
      if (request.method !== 'notify') active.runtime.respondToExtension(requestId, { cancelled: true })
      return
    }
    try {
      const envelope = decodePiBridgeEnvelope(request.placeholder)
      if (!isRecord(envelope) || envelope.v !== 1) {
        throw new PiRpcCompatibilityError('Pi adapter request has an invalid protocol version.')
      }
      if (envelope.kind === 'snapshot') {
        await this.respondToSnapshot(active, requestId, envelope)
      } else if (envelope.kind === 'proposal') {
        await this.applyProposal(active, requestId, envelope)
      } else if (envelope.kind === 'approval') {
        await this.respondToToolApproval(active, requestId, envelope)
      } else {
        throw new PiRpcCompatibilityError('Pi adapter request kind is unsupported.')
      }
    } catch (error) {
      active.runtime.respondToExtension(requestId, { cancelled: true })
      throw error
    }
  }

  private async respondToSnapshot(active: ActivePiRun, requestId: string, envelope: JsonRecord): Promise<void> {
    this.assertAdapterRoute(active, envelope)
    const toolCallId = stringValue(envelope, 'toolCallId')
    const toolName = stringValue(envelope, 'toolName')
    if (toolName !== 'read' && toolName !== 'edit' && toolName !== 'write') {
      throw new PiRpcCompatibilityError('Pi adapter snapshot tool is invalid.')
    }
    const requestedPath = stringValue(envelope, 'path')
    const snapshot = asDocumentSnapshot(await this.documentScopes.readDocument(active.scopeToken, {}))
    if (!snapshot.filePath) {
      throw new Error('Save the current document before using Pi read, edit, or write tools.')
    }
    const handlesCurrentDocument = (
      resolve(active.workspacePath, requestedPath) === resolve(snapshot.filePath)
    )
    const response = handlesCurrentDocument
      ? {
          v: 1,
          kind: 'snapshot',
          handled: true,
          documentHandleId: snapshot.handleId,
          documentId: snapshot.documentId,
          filePath: snapshot.filePath,
          content: snapshot.markdown,
          contentHash: snapshot.contentHash
        }
      : { v: 1, kind: 'snapshot', handled: false }
    active.runtime.respondToExtension(requestId, { value: encodePiBridgeEnvelope(response) })
  }

  private async applyProposal(
    active: ActivePiRun,
    requestId: string,
    envelope: JsonRecord
  ): Promise<void> {
    this.assertAdapterRoute(active, envelope)
    const proposalId = stringValue(envelope, 'proposalId')
    const toolCallId = stringValue(envelope, 'toolCallId')
    const toolName = stringValue(envelope, 'toolName')
    if (toolName !== 'edit' && toolName !== 'write') {
      throw new PiRpcCompatibilityError('Pi adapter proposal tool is invalid.')
    }
    const path = stringValue(envelope, 'path')
    const filePath = stringValue(envelope, 'filePath')
    const documentHandleId = stringValue(envelope, 'documentHandleId')
    const documentId = stringValue(envelope, 'documentId')
    const originalContent = stringValue(envelope, 'originalContent', { allowEmpty: true })
    const proposedContent = stringValue(envelope, 'proposedContent', { allowEmpty: true })
    const baseHash = stringValue(envelope, 'baseHash')
    const proposedHash = stringValue(envelope, 'proposedHash')
    const hashesMatch = (
      hashAgentDocument(originalContent) === baseHash &&
      hashAgentDocument(proposedContent) === proposedHash
    )
    const snapshot = asDocumentSnapshot(await this.documentScopes.readDocument(active.scopeToken, {}))
    const routeMatches = Boolean(snapshot.filePath) && (
      resolve(active.workspacePath, path) === resolve(snapshot.filePath!) &&
      resolve(filePath) === resolve(snapshot.filePath!) &&
      documentHandleId === snapshot.handleId &&
      documentId === snapshot.documentId &&
      baseHash === snapshot.contentHash &&
      originalContent === snapshot.markdown
    )
    if (!hashesMatch || !routeMatches) {
      this.respondConflict(active, requestId, proposalId, 'The active AnnotaMD document changed or no longer matches this proposal.')
      return
    }

    if (
      active.permissionMode === 'request' &&
      !active.approvedToolCalls.delete(toolCallId) &&
      !await this.requestProposalApproval(active, proposalId, toolName, filePath)
    ) {
      active.runtime.respondToExtension(requestId, {
        value: encodePiBridgeEnvelope({
          v: 1,
          kind: 'decision',
          proposalId,
          decision: 'rejected'
        })
      })
      return
    }

    try {
      const result = asMutationResult(toolName === 'edit'
        ? await this.documentScopes.editDocument(active.scopeToken, {
            handleId: snapshot.handleId,
            expectedRevision: snapshot.revision,
            expectedHash: snapshot.contentHash,
            edits: [{ oldText: originalContent, newText: proposedContent }]
          })
        : await this.documentScopes.replaceDocument(active.scopeToken, {
            handleId: snapshot.handleId,
            expectedRevision: snapshot.revision,
            expectedHash: snapshot.contentHash,
            markdown: proposedContent
          }))
      if (result.contentHash !== proposedHash) {
        throw new PiRpcCompatibilityError('AnnotaMD applied content does not match the Pi proposal.')
      }
      active.runtime.respondToExtension(requestId, {
        value: encodePiBridgeEnvelope({
          v: 1,
          kind: 'decision',
          proposalId,
          decision: 'accepted',
          appliedHash: result.contentHash
        })
      })
    } catch (error) {
      this.respondConflict(active, requestId, proposalId, errorMessage(error))
    }
  }

  private respondConflict(
    active: ActivePiRun,
    requestId: string,
    proposalId: string,
    message: string
  ): void {
    active.runtime.respondToExtension(requestId, {
      value: encodePiBridgeEnvelope({
        v: 1,
        kind: 'decision',
        proposalId,
        decision: 'conflict',
        message
      })
    })
  }

  private async requestProposalApproval(
    active: ActivePiRun,
    proposalId: string,
    toolName: 'edit' | 'write',
    filePath: string
  ): Promise<boolean> {
    const approvalId = `${active.runId}:pi:${proposalId}`
    return await new Promise<boolean>(resolveApproval => {
      const available = new Set<AiApprovalDecision>(['allow-once', 'deny'])
      this.approvals.set(approvalId, {
        runId: active.runId,
        available,
        resolve: resolveApproval
      })
      active.emit({
        type: 'approval-requested',
        runId: active.runId,
        approvalId,
        provider: 'pi',
        kind: toolName,
        title: toolName === 'edit'
          ? 'Pi requests permission to edit the document'
          : 'Pi requests permission to write the document',
        paths: [filePath],
        options: [...available]
      })
    })
  }

  private async respondToToolApproval(
    active: ActivePiRun,
    requestId: string,
    envelope: JsonRecord
  ): Promise<void> {
    this.assertAdapterRoute(active, envelope)
    const toolCallId = stringValue(envelope, 'toolCallId')
    const toolName = stringValue(envelope, 'toolName')
    const input = isRecord(envelope.input) ? envelope.input : {}
    const command = typeof input.command === 'string' ? input.command : undefined
    const path = ['path', 'filePath', 'file_path'].flatMap(key => (
      typeof input[key] === 'string' ? [input[key] as string] : []
    ))[0]
    const approved = active.permissionMode === 'full-access' || await this.requestToolApproval(
      active,
      toolCallId,
      toolName,
      command,
      path
    )
    if (approved) active.approvedToolCalls.add(toolCallId)
    active.runtime.respondToExtension(requestId, {
      value: encodePiBridgeEnvelope({
        v: 1,
        kind: 'approval-decision',
        decision: approved ? 'accepted' : 'rejected'
      })
    })
  }

  private async requestToolApproval(
    active: ActivePiRun,
    toolCallId: string,
    toolName: string,
    command?: string,
    path?: string
  ): Promise<boolean> {
    const approvalId = `${active.runId}:pi-tool:${toolCallId}`
    return await new Promise<boolean>(resolveApproval => {
      const available = new Set<AiApprovalDecision>(['allow-once', 'deny'])
      this.approvals.set(approvalId, {
        runId: active.runId,
        available,
        resolve: resolveApproval
      })
      active.emit({
        type: 'approval-requested',
        runId: active.runId,
        approvalId,
        provider: 'pi',
        kind: toolName,
        title: `Pi requests permission to use ${toolName}`,
        ...(command ? { command } : {}),
        ...(path ? { paths: [path] } : {}),
        options: [...available]
      })
    })
  }

  private rejectApprovalsForRun(runId: string): void {
    for (const [approvalId, pending] of this.approvals) {
      if (pending.runId !== runId) continue
      this.approvals.delete(approvalId)
      pending.resolve(false)
    }
  }

  private assertAdapterRoute(active: ActivePiRun, envelope: JsonRecord): void {
    const sessionId = stringValue(envelope, 'sessionId')
    const activeSessionId = active.runtime.currentState?.sessionId
    if (activeSessionId && sessionId !== activeSessionId) {
      throw new PiRpcCompatibilityError('Pi adapter request belongs to another session.')
    }
  }

  private finishRun(active: ActivePiRun): void {
    if (active.settled) return
    active.settled = true
    active.resolve()
  }

  private failRun(active: ActivePiRun, error: unknown): void {
    if (active.settled) return
    active.settled = true
    active.reject(error instanceof Error ? error : new Error(String(error)))
  }
}

/** Temporary adapter kept until the desktop bootstrap supplies PiAgentHost dependencies. */
export class UnavailablePiHostAdapter implements PiHostAdapter {
  readonly kind = 'cli' as const
  readonly providers = ['pi'] as const

  async listModels(): Promise<AiHostModel[]> {
    return []
  }

  async testConnection(): Promise<AiHostConnectionResult> {
    return { success: false, message: 'Pi host is not connected yet.' }
  }

  async run(): Promise<string> {
    throw new Error('Pi host is not connected yet.')
  }

  async stop(): Promise<boolean> {
    return false
  }

  dispose(): void {}
}
