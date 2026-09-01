import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  AI_REASONING_MESSAGE_TOOL,
  AI_RUN_SUMMARY_TOOL
} from '@shared/types/aiWorkspace'
import type {
  AiAttachment,
  AiApprovalResolveRequest,
  AiConfigSaveRequest,
  AiConfigSummary,
  AiCliDetectionRequest,
  AiCliDetectionResult,
  AiChangeSet,
  AiChangeSetResolveRequest,
  AiChangeSetResolveResult,
  AiChangeSetStatus,
  AiConnectionTestResult,
  AiConversation,
  AiConversationCreateRequest,
  AiMessage,
  AiModelInfo,
  AiReadiness,
  AiRetryRequest,
  AiSendRequest,
  AiSendResult,
  AiStopRequest,
  AiTemplate,
  AiTemplateSaveRequest,
  AiToolCall,
  AiWorkspaceEvent,
  AiWorkspacePreferences,
  AiWorkspaceSnapshot
} from '@shared/types/aiWorkspace'
import { aiApiProviderPreset } from '@shared/types/aiProviderPresets'
import { matchesAiConversationIdentity } from '@shared/types/aiConversationIdentity'
import {
  AiRunStoppedError,
  type AiHost,
  type AiHostConfig,
  type AiHostEvent,
  type AiHostMessage,
  type AiMcpLaunchSpec
} from './AiHost'
import type {
  AgentDocumentScopeInput,
  AgentDocumentSnapshot
} from '../agentDocumentBridge/AgentDocumentScopeService'
import { hashAgentDocument } from '../agentDocumentBridge/AgentDocumentScopeService'
import type {
  AgentDocumentTransactionRequest,
  AgentDocumentTransactionResult,
  AgentDocumentTurnSnapshot
} from '@shared/types/agentDocumentTransactions'
import type { AiStore, AiRuntimeConfig } from './AiStore'
import { detectCliExecutable } from './CliExecutableDetector'

export interface AiWorkspaceOwner {
  id: number
  send(channel: 'annotamd::ai::event', event: AiWorkspaceEvent): void
  isDestroyed?: () => boolean
}

export interface AiDocumentScopeController {
  issueScope(input: AgentDocumentScopeInput): string
  revokeScope(scopeToken: string): void
  revokeRun(runId: string): void
}

export type AiMcpLaunchSpecFactory = (
  scopeToken: string,
  provider: AiRuntimeConfig['provider']
) => AiMcpLaunchSpec

export interface AiDocumentTransactionProvider {
  getRunTransaction(runId: string): AgentDocumentTurnSnapshot | undefined
  forgetRun(runId: string): void
  request(
    windowId: number,
    request: AgentDocumentTransactionRequest
  ): Promise<AgentDocumentTransactionResult>
}

export interface AiWorkspaceServiceOptions {
  store: AiStore
  apiHost: AiHost
  cliHost: AiHost
  piHost: AiHost
  now?: () => number
  createId?: () => string
  documentScopes?: AiDocumentScopeController
  createMcpLaunchSpec?: AiMcpLaunchSpecFactory
  prepareAgentRun?: () => Promise<void>
  documentTransactions?: AiDocumentTransactionProvider
  agentWorkspacePath?: string
}

interface ActiveRun {
  conversationId: string
  turnId: string
  startedAt: number
  summaryMessageId: string
  assistantMessageId: string
  assistantMessagePersisted: boolean
  assistantSegmentClosed: boolean
  assistantSegmentText: string
  reasoningMessageId?: string
  reasoningText: string
  mode: AiConversation['mode']
  host: AiHost
  filePath?: string
  scopeToken?: string
  nativeDocument?: {
    windowId: number
    documentId: string
    documentUri: string
    filePath: string
    beforeMarkdown: string
    captured: boolean
  }
  externalTransaction?: AgentDocumentTurnSnapshot
  text: string
  tools: Map<string, { call: AiToolCall; messageId: string }>
  complete?: (completion: AiTurnCompletion) => void
}

export interface AiTurnCompletion {
  conversationId: string
  turnId: string
  assistantMessage: AiMessage
  status: 'completed' | 'failed' | 'cancelled'
  error?: string
}

const AI_IMAGE_ATTACHMENT_COUNT_MAX = 4
const AI_IMAGE_ATTACHMENT_BYTES_MAX = 5 * 1024 * 1024
const AI_IMAGE_ATTACHMENTS_TOTAL_BYTES_MAX = 12 * 1024 * 1024
const AI_TEXT_ATTACHMENT_COUNT_MAX = 8
const AI_TEXT_ATTACHMENT_CHARACTERS_MAX = 12_000
const AI_TEXT_ATTACHMENTS_TOTAL_CHARACTERS_MAX = 32_000
const AI_IMAGE_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
])

const safeAttachmentName = (value: string): string => {
  const name = value.trim().split(/[\\/]/).pop()?.trim() ?? ''
  if (!name || name.length > 180) throw new Error('Attachment name is invalid.')
  return name
}

const normalizeAttachments = (items: readonly AiAttachment[] | undefined): AiAttachment[] => {
  if (!items?.length) return []
  const images = items.filter(item => item.kind === 'image')
  const texts = items.filter(item => item.kind === 'text')
  if (images.length > AI_IMAGE_ATTACHMENT_COUNT_MAX) {
    throw new Error(`A maximum of ${AI_IMAGE_ATTACHMENT_COUNT_MAX} images can be attached.`)
  }
  if (texts.length > AI_TEXT_ATTACHMENT_COUNT_MAX) {
    throw new Error(`A maximum of ${AI_TEXT_ATTACHMENT_COUNT_MAX} text files can be attached.`)
  }

  let imageBytes = 0
  let textCharacters = 0
  return items.map((item) => {
    const name = safeAttachmentName(item.name)
    if (item.kind === 'text') {
      if (typeof item.content !== 'string' || item.content.length > AI_TEXT_ATTACHMENT_CHARACTERS_MAX) {
        throw new Error(`Text attachment ${name} exceeds ${AI_TEXT_ATTACHMENT_CHARACTERS_MAX} characters.`)
      }
      textCharacters += item.content.length
      if (textCharacters > AI_TEXT_ATTACHMENTS_TOTAL_CHARACTERS_MAX) {
        throw new Error(`Text attachments exceed ${AI_TEXT_ATTACHMENTS_TOTAL_CHARACTERS_MAX} characters.`)
      }
      return { kind: 'text', name, content: item.content, truncated: Boolean(item.truncated) }
    }

    if (!AI_IMAGE_MEDIA_TYPES.has(item.mediaType)) {
      throw new Error(`Unsupported image type: ${item.mediaType}`)
    }
    const data = item.data.replace(/\s+/g, '')
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new Error(`Image attachment ${name} is not valid base64 data.`)
    }
    const bytes = Buffer.from(data, 'base64')
    if (bytes.length !== item.sizeBytes || bytes.length > AI_IMAGE_ATTACHMENT_BYTES_MAX) {
      throw new Error(`Image attachment ${name} exceeds the supported size limit.`)
    }
    imageBytes += bytes.length
    if (imageBytes > AI_IMAGE_ATTACHMENTS_TOTAL_BYTES_MAX) {
      throw new Error('Image attachments exceed the 12 MB total size limit.')
    }
    return { kind: 'image', name, mediaType: item.mediaType, data, sizeBytes: bytes.length }
  })
}

const titleFor = (text: string): string => {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? ''
  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine || 'New conversation'
}

const effortValue = (value: AiConversation['effort']): string | undefined => {
  if (!value || value.kind === 'provider-default') return undefined
  if (value.kind === 'preset') return value.id
  if (value.kind === 'integer') return String(value.value)
  if (value.kind === 'boolean') return String(value.value)
  return value.value
}

const safeText = (value: unknown): string => {
  if (typeof value === 'string') return value.slice(0, 32 * 1024)
  try {
    return JSON.stringify(value, null, 2).slice(0, 32 * 1024)
  } catch {
    return String(value).slice(0, 32 * 1024)
  }
}

export class AiWorkspaceService {
  private readonly store: AiStore
  private readonly apiHost: AiHost
  private readonly cliHost: AiHost
  private readonly piHost: AiHost
  private readonly now: () => number
  private readonly createId: () => string
  private readonly agentWorkspacePath?: string
  private documentScopes?: AiDocumentScopeController
  private createMcpLaunchSpec?: AiMcpLaunchSpecFactory
  private prepareAgentRun?: () => Promise<void>
  private documentTransactions?: AiDocumentTransactionProvider
  private readonly owners = new Map<number, AiWorkspaceOwner>()
  private readonly active = new Map<string, ActiveRun>()

  constructor(options: AiWorkspaceServiceOptions) {
    this.store = options.store
    this.apiHost = options.apiHost
    this.cliHost = options.cliHost
    this.piHost = options.piHost
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
    this.agentWorkspacePath = options.agentWorkspacePath
    this.documentScopes = options.documentScopes
    this.createMcpLaunchSpec = options.createMcpLaunchSpec
    this.prepareAgentRun = options.prepareAgentRun
    this.documentTransactions = options.documentTransactions
  }

  setDocumentScopeController(
    controller?: AiDocumentScopeController,
    createMcpLaunchSpec?: AiMcpLaunchSpecFactory,
    prepareAgentRun?: () => Promise<void>,
    documentTransactions?: AiDocumentTransactionProvider
  ): void {
    this.documentScopes = controller
    this.createMcpLaunchSpec = createMcpLaunchSpec
    this.prepareAgentRun = prepareAgentRun
    this.documentTransactions = documentTransactions
  }

  async getSnapshot(owner: AiWorkspaceOwner): Promise<AiWorkspaceSnapshot> {
    this.track(owner)
    const activeConversationId = this.store.getActiveConversationId()
    const configs = await this.store.listConfigSummaries()
    return {
      readiness: await this.getReadiness(),
      configs,
      conversations: this.store.listConversations(),
      ...(activeConversationId ? { activeConversationId } : {}),
      messages: activeConversationId ? this.store.listMessages(activeConversationId) : [],
      changeSets: activeConversationId ? this.store.listChangeSets(activeConversationId) : [],
      running: activeConversationId ? this.active.has(activeConversationId) : false,
      ...(activeConversationId && this.active.get(activeConversationId)
        ? { activeTurnId: this.active.get(activeConversationId)!.turnId }
        : {})
    }
  }

  async listConfigs(owner: AiWorkspaceOwner): Promise<AiConfigSummary[]> {
    this.track(owner)
    return await this.store.listConfigSummaries()
  }

  getPreferences(owner: AiWorkspaceOwner): AiWorkspacePreferences {
    this.track(owner)
    return this.store.getPreferences()
  }

  savePreferences(
    owner: AiWorkspaceOwner,
    preferences: AiWorkspacePreferences
  ): AiWorkspacePreferences {
    this.track(owner)
    return this.store.savePreferences(preferences)
  }

  async saveConfig(owner: AiWorkspaceOwner, request: AiConfigSaveRequest): Promise<AiConfigSummary> {
    this.track(owner)
    const summary = await this.store.saveConfig(request)
    this.emit({ type: 'readiness', readiness: await this.getReadiness() })
    return summary
  }

  async deleteConfig(owner: AiWorkspaceOwner, id: string): Promise<boolean> {
    this.track(owner)
    const deleted = await this.store.deleteConfig(id)
    if (deleted) this.emit({ type: 'readiness', readiness: await this.getReadiness() })
    return deleted
  }

  async detectCli(
    owner: AiWorkspaceOwner,
    request: AiCliDetectionRequest
  ): Promise<AiCliDetectionResult> {
    this.track(owner)
    return detectCliExecutable(request)
  }

  async listModels(owner: AiWorkspaceOwner, configId: string): Promise<AiModelInfo[]> {
    this.track(owner)
    const config = await this.requireConfig(configId)
    return (await this.hostFor(config).listModels(this.toHostConfig(config))).map(model => ({
      id: model.id,
      ...(model.displayName ? { name: model.displayName } : {}),
      ...(model.effortLevels?.length ? { effortLevels: model.effortLevels } : {}),
      provider: config.provider
    }))
  }

  async testConfig(owner: AiWorkspaceOwner, configId: string): Promise<AiConnectionTestResult> {
    this.track(owner)
    const config = await this.requireConfig(configId)
    const host = this.hostFor(config)
    const result = await host.testConnection(this.toHostConfig(config))
    return {
      ok: result.success,
      message: result.message,
      ...(result.success ? { models: await this.listModels(owner, configId).catch(() => []) } : {})
    }
  }

  createConversation(
    owner: AiWorkspaceOwner,
    request: AiConversationCreateRequest
  ): AiConversation {
    this.track(owner)
    const conversation = this.store.createConversation({
      ...request,
      title: request.title?.trim() || 'New conversation'
    })
    this.store.setActiveConversationId(conversation.id)
    this.emit({ type: 'conversation-created', conversation })
    this.emit({
      type: 'conversation-selected',
      conversationId: conversation.id,
      messages: [],
      changeSets: []
    })
    return conversation
  }

  listConversations(owner: AiWorkspaceOwner): AiConversation[] {
    this.track(owner)
    return this.store.listConversations()
  }

  renameConversation(
    owner: AiWorkspaceOwner,
    conversationId: string,
    title: string
  ): AiConversation {
    this.track(owner)
    if (!this.store.getConversation(conversationId)) {
      throw new Error(`AI conversation ${conversationId} was not found.`)
    }
    const normalizedTitle = title.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!normalizedTitle) throw new Error('Conversation title is required.')
    const conversation = this.store.renameConversation(conversationId, normalizedTitle)
    this.emit({ type: 'conversation-updated', conversation })
    return conversation
  }

  selectConversation(owner: AiWorkspaceOwner, id: string): AiMessage[] {
    this.track(owner)
    if (!this.store.getConversation(id)) throw new Error(`AI conversation ${id} was not found.`)
    this.store.setActiveConversationId(id)
    const messages = this.store.listMessages(id)
    this.emit({
      type: 'conversation-selected',
      conversationId: id,
      messages,
      changeSets: this.store.listChangeSets(id)
    })
    return messages
  }

  listChangeSets(owner: AiWorkspaceOwner, conversationId: string): AiChangeSet[] {
    this.track(owner)
    if (!this.store.getConversation(conversationId)) {
      throw new Error(`AI conversation ${conversationId} was not found.`)
    }
    return this.store.listChangeSets(conversationId)
  }

  recordChangeSet(changeSet: AiChangeSet): AiChangeSet {
    const stored = this.store.saveChangeSet(changeSet)
    this.emit({
      type: 'change-set',
      conversationId: stored.conversationId,
      turnId: stored.turnId,
      changeSet: stored
    })
    return stored
  }

  updateChangeSetStatus(
    id: string,
    status: AiChangeSetStatus,
    message?: string
  ): AiChangeSet {
    const stored = this.store.updateChangeSetStatus(id, status, message)
    this.emit({
      type: 'change-set',
      conversationId: stored.conversationId,
      turnId: stored.turnId,
      changeSet: stored
    })
    return stored
  }

  async resolveChangeSet(
    owner: AiWorkspaceOwner,
    request: AiChangeSetResolveRequest,
    windowId: number
  ): Promise<AiChangeSetResolveResult> {
    this.track(owner)
    const current = this.store.getChangeSet(request.changeSetId)
    if (!current) throw new Error(`AI change set ${request.changeSetId} was not found.`)
    if (!this.documentTransactions) throw new Error('The Agent document transaction bridge is not ready.')
    if (current.status !== 'applied-unreviewed') {
      throw new Error('This Agent document change has already been resolved.')
    }
    const transactionResult = await this.documentTransactions.request(windowId, {
      action: request.action,
      sessionId: current.conversationId,
      turnId: current.turnId,
      ...(current.transaction ? { transaction: current.transaction } : {})
    })
    let changeSet: AiChangeSet
    if (transactionResult.status === 'kept' || transactionResult.status === 'rolled-back') {
      changeSet = this.recordChangeSet({
        ...current,
        status: transactionResult.status,
        resolvedAt: this.now(),
        transaction: transactionResult.transaction,
        appliedContent: transactionResult.transaction.finalMarkdown
      })
    } else if (
      transactionResult.status === 'conflicted' ||
      transactionResult.status === 'stale' ||
      transactionResult.status === 'failed'
    ) {
      const detail = transactionResult.status === 'failed'
        ? transactionResult.message
        : transactionResult.reason
      changeSet = this.recordChangeSet({
        ...current,
        status: 'conflicted',
        resolvedAt: this.now(),
        message: detail
      })
    } else {
      throw new Error(`Unexpected document transaction result: ${transactionResult.status}`)
    }
    return { changeSet, transactionResult }
  }

  async deleteConversation(owner: AiWorkspaceOwner, id: string): Promise<boolean> {
    this.track(owner)
    const running = this.active.get(id)
    if (running) {
      throw new Error('Stop the running Agent turn before deleting this conversation.')
    }
    const pendingReview = this.store.listChangeSets(id).some(changeSet => (
      changeSet.status === 'applied-unreviewed'
    ))
    if (pendingReview) {
      throw new Error('Keep or roll back the Agent document changes before deleting this conversation.')
    }
    const deleted = this.store.deleteConversation(id)
    if (deleted) this.emit({ type: 'conversation-deleted', conversationId: id })
    return deleted
  }

  listTemplates(owner: AiWorkspaceOwner): AiTemplate[] {
    this.track(owner)
    return this.store.listTemplates()
  }

  saveTemplate(owner: AiWorkspaceOwner, request: AiTemplateSaveRequest): AiTemplate {
    this.track(owner)
    return this.store.saveTemplate(request)
  }

  deleteTemplate(owner: AiWorkspaceOwner, id: string): boolean {
    this.track(owner)
    return this.store.deleteTemplate(id)
  }

  async send(
    owner: AiWorkspaceOwner,
    request: AiSendRequest,
    windowId = owner.id,
    complete?: (completion: AiTurnCompletion) => void,
    started?: (result: AiSendResult) => void
  ): Promise<AiSendResult> {
    this.track(owner)
    const text = request.text.trim()
    if (!text) throw new Error('Message text is required.')
    const config = await this.requireConfig(
      request.selection.configId,
      request.selection.mode === 'ask' ? 'api' : 'cli'
    )
    if (request.selection.mode === 'ask' && config.kind !== 'api') {
      throw new Error('Ask mode requires an API model configuration.')
    }
    if (request.selection.mode === 'agent' && config.kind !== 'cli') {
      throw new Error('Agent mode requires a local CLI configuration.')
    }
    const attachments = normalizeAttachments(request.attachments)
    if (attachments.some(item => item.kind === 'image') && config.provider !== 'codex') {
      throw new Error('Image attachments are currently supported only by Codex CLI.')
    }
    if (request.selection.mode === 'agent' && request.documentUri) {
      const pending = this.store.findPendingChangeSetForDocument(request.documentUri)
      if (pending) {
        throw new Error(
          'Keep or roll back the pending Agent document changes before starting another Agent turn.'
        )
      }
    }
    if (request.selection.mode === 'agent' && request.documentDirty && request.filePath) {
      throw new Error('Save the current document before allowing a CLI Agent to modify it.')
    }

    let conversation = request.conversationId
      ? this.store.getConversation(request.conversationId)
      : undefined
    if (request.conversationId && !conversation) {
      throw new Error(`AI conversation ${request.conversationId} was not found.`)
    }
    const identity = {
      mode: request.selection.mode,
      configId: config.id,
      provider: config.provider,
      modelId: request.selection.modelId ?? config.defaultModelId,
      effort: request.selection.effort,
      permissionMode: request.selection.permissionMode ?? 'request',
      templateIds: request.selection.templateIds,
      workspacePath: request.workspacePath
    }
    const conversationHasMessages = conversation
      ? this.store.listMessages(conversation.id).length > 0
      : false
    if (conversation && conversationHasMessages && !matchesAiConversationIdentity(
      conversation,
      identity
    )) {
      conversation = undefined
    }
    if (conversation && this.active.has(conversation.id)) {
      throw new Error('This conversation already has a running turn.')
    }
    if (!conversation) {
      conversation = this.store.createConversation({
        title: titleFor(text),
        ...identity
      })
      this.emit({ type: 'conversation-created', conversation })
      this.emit({
        type: 'conversation-selected',
        conversationId: conversation.id,
        messages: [],
        changeSets: []
      })
    } else {
      conversation = this.store.saveConversation({
        ...conversation,
        title: this.store.listMessages(conversation.id).length === 0
          ? titleFor(text)
          : conversation.title,
        ...identity,
        status: 'idle',
        updatedAt: this.now()
      })
    }
    this.store.setActiveConversationId(conversation.id)

    const turnId = this.createId()
    let scopeToken: string | undefined
    let runRequest = request
    try {
      if (conversation.mode === 'agent') {
        if (!this.prepareAgentRun) throw new Error('AnnotaMD document Agent bridge is not ready.')
        await this.prepareAgentRun()
        if (
          request.filePath &&
          request.documentId &&
          request.documentUri &&
          request.markdown !== undefined &&
          this.documentTransactions
        ) {
          const started = await this.documentTransactions.request(windowId, {
            action: 'begin',
            sessionId: conversation.id,
            turnId,
            documentId: request.documentId,
            documentUri: request.documentUri,
            filePath: request.filePath
          })
          if (started.status !== 'started') {
            const reason = 'reason' in started ? started.reason : 'message' in started ? started.message : started.status
            throw new Error(`Could not create the Agent document checkpoint: ${reason}.`)
          }
          if (started.documentDirty) {
            await this.documentTransactions.request(windowId, {
              action: 'keep',
              sessionId: conversation.id,
              turnId
            })
            throw new Error('Save the current document before allowing a CLI Agent to modify it.')
          }
          runRequest = {
            ...request,
            markdown: started.transaction.beforeMarkdown,
            documentContentHash: hashAgentDocument(started.transaction.beforeMarkdown)
          }
        }
        scopeToken = this.issueDocumentScope(windowId, conversation.id, turnId, runRequest)
      }
      const mcp = scopeToken ? this.createMcpLaunchSpec!(scopeToken, config.provider) : undefined
      const userMessage = this.store.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: text,
        status: 'complete'
      })
      const startedAt = this.now()
      const summaryMessage = this.store.addMessage({
        conversationId: conversation.id,
        role: 'system',
        content: JSON.stringify({ durationMs: 0 }),
        status: 'streaming',
        toolName: AI_RUN_SUMMARY_TOOL
      })
      const assistantMessageId = this.createId()
      const host = this.hostFor(config)
      const active: ActiveRun = {
        conversationId: conversation.id,
        turnId,
        startedAt,
        summaryMessageId: summaryMessage.id,
        assistantMessageId,
        assistantMessagePersisted: false,
        assistantSegmentClosed: false,
        assistantSegmentText: '',
        reasoningText: '',
        mode: conversation.mode,
        host,
        ...(runRequest.filePath ? { filePath: runRequest.filePath } : {}),
        ...(scopeToken ? { scopeToken } : {}),
        ...(runRequest.filePath && runRequest.documentId && runRequest.documentUri && runRequest.markdown !== undefined
          ? {
              nativeDocument: {
                windowId,
                documentId: runRequest.documentId,
                documentUri: runRequest.documentUri,
                filePath: runRequest.filePath,
                beforeMarkdown: runRequest.markdown,
                captured: false
              }
            }
          : {}),
        text: '',
        tools: new Map(),
        ...(complete ? { complete } : {})
      }
      this.active.set(conversation.id, active)
      conversation = this.store.updateConversationStatus(conversation.id, 'running')
      this.emit({ type: 'conversation-updated', conversation })
      this.emit({ type: 'message', conversationId: conversation.id, turnId, message: userMessage })
      this.emit({ type: 'message', conversationId: conversation.id, turnId, message: summaryMessage })
      this.emit({ type: 'turn-started', conversationId: conversation.id, turnId })

      const result: AiSendResult = {
        conversationId: conversation.id,
        turnId,
        userMessageId: userMessage.id,
        assistantMessageId
      }
      started?.(result)

      const hostMessages = this.hostMessages(conversation)
      void this.runTurn(
        active,
        config,
        conversation,
        hostMessages,
        runRequest.workspacePath,
        mcp,
        attachments
      )
        .catch((error) => {
          this.emit({
            type: 'turn-error',
            conversationId: active.conversationId,
            turnId: active.turnId,
            message: error instanceof Error ? error.message : String(error),
            retryable: false
          })
        })
      return result
    } catch (error) {
      if (scopeToken) this.documentScopes?.revokeScope(scopeToken)
      this.documentScopes?.revokeRun(turnId)
      throw error
    }
  }

  async sendAndWait(
    owner: AiWorkspaceOwner,
    request: AiSendRequest,
    windowId = owner.id,
    started?: (result: AiSendResult) => void
  ): Promise<AiTurnCompletion> {
    return await new Promise<AiTurnCompletion>((resolve, reject) => {
      void this.send(owner, request, windowId, resolve, started).catch(reject)
    })
  }

  async stop(owner: AiWorkspaceOwner, request: AiStopRequest): Promise<boolean> {
    this.track(owner)
    const active = this.active.get(request.conversationId)
    if (!active || (request.turnId && request.turnId !== active.turnId)) return false
    if (active.scopeToken) {
      this.documentScopes?.revokeScope(active.scopeToken)
      active.scopeToken = undefined
    }
    return await active.host.stop(active.turnId)
  }

  async resolveApproval(
    owner: AiWorkspaceOwner,
    request: AiApprovalResolveRequest
  ): Promise<boolean> {
    this.track(owner)
    const active = this.active.get(request.conversationId)
    if (!active || active.turnId !== request.runId || !active.host.resolveApproval) return false
    const resolved = await active.host.resolveApproval(
      request.runId,
      request.approvalId,
      request.decision
    )
    if (resolved) {
      this.emit({
        type: 'approval-resolved',
        conversationId: request.conversationId,
        turnId: request.runId,
        approvalId: request.approvalId,
        decision: request.decision
      })
    }
    return resolved
  }

  async stopForDocument(filePath: string): Promise<number> {
    const matching = [...this.active.values()].filter(run => run.filePath === filePath)
    await Promise.all(matching.map(async(run) => {
      if (run.scopeToken) {
        this.documentScopes?.revokeScope(run.scopeToken)
        run.scopeToken = undefined
      }
      await run.host.stop(run.turnId)
    }))
    return matching.length
  }

  async retry(
    owner: AiWorkspaceOwner,
    request: AiRetryRequest,
    windowId = owner.id
  ): Promise<AiSendResult> {
    this.track(owner)
    const conversation = this.store.getConversation(request.conversationId)
    if (!conversation) throw new Error(`AI conversation ${request.conversationId} was not found.`)
    const messages = this.store.listMessages(conversation.id)
    const selectedIndex = request.messageId
      ? messages.findIndex(message => message.id === request.messageId)
      : messages.length - 1
    const before = selectedIndex >= 0 ? messages.slice(0, selectedIndex + 1) : messages
    const user = [...before].reverse().find(message => message.role === 'user')
    if (!user) throw new Error('There is no user message to retry.')
    return await this.send(owner, {
      conversationId: conversation.id,
      text: user.content,
      selection: {
        mode: conversation.mode,
        configId: conversation.configId,
        modelId: conversation.modelId,
        effort: conversation.effort,
        permissionMode: conversation.permissionMode,
        templateIds: conversation.templateIds
      },
      workspacePath: request.workspacePath ?? '',
      documentHandleId: request.documentHandleId,
      documentId: request.documentId,
      documentUri: request.documentUri,
      filePath: request.filePath,
      markdown: request.markdown,
      documentRevision: request.documentRevision,
      documentContentHash: request.documentContentHash,
      documentDirty: request.documentDirty,
      selectionText: request.selectionText
    }, windowId)
  }

  dispose(): void {
    for (const run of this.active.values()) {
      if (run.scopeToken) this.documentScopes?.revokeScope(run.scopeToken)
      void run.host.stop(run.turnId)
    }
    this.active.clear()
    this.apiHost.dispose()
    this.cliHost.dispose()
    this.piHost.dispose()
    this.store.close()
    this.owners.clear()
  }

  private async runTurn(
    active: ActiveRun,
    config: AiRuntimeConfig,
    conversation: AiConversation,
    messages: AiHostMessage[],
    workspacePath: string,
    mcp?: AiMcpLaunchSpec,
    attachments: readonly AiAttachment[] = []
  ): Promise<void> {
    try {
      const usesNativeCli = config.kind === 'cli' && config.provider !== 'pi'
      const cliWorkspacePath = usesNativeCli
        ? this.agentWorkspacePath?.trim() || workspacePath
        : workspacePath
      const additionalWorkspacePaths = usesNativeCli && workspacePath && workspacePath !== cliWorkspacePath
        ? [workspacePath]
        : []
      const result = await active.host.run({
        runId: active.turnId,
        conversationId: active.conversationId,
        config: this.toHostConfig(
          config,
          conversation.modelId,
          conversation.effort,
          conversation.permissionMode
        ),
        messages,
        mode: conversation.mode,
        workspacePath: cliWorkspacePath || undefined,
        ...(additionalWorkspacePaths.length ? { additionalWorkspacePaths } : {}),
        ...(usesNativeCli && this.agentWorkspacePath
          ? {
              workspaceProject: {
                name: 'AnnotaMD',
                idempotencyKey: 'annotamd-agent-workspace-v1'
              }
            }
          : {}),
        permissionMode: conversation.permissionMode,
        ...(mcp ? { mcp } : {}),
        ...(attachments.length ? { attachments } : {})
      }, event => this.onHostEvent(active, event))
      await this.captureNativeDocumentChange(active)
      if (!active.text && result) {
        active.text = result
        active.assistantSegmentText = result
      }
      const message = this.persistAssistantSegment(active, 'complete')
      this.finishReasoning(active, 'complete')
      this.persistRunSummary(active, 'complete')
      const updated = this.store.updateConversationStatus(conversation.id, 'completed')
      this.emit({ type: 'message', conversationId: conversation.id, turnId: active.turnId, message })
      this.emit({ type: 'conversation-updated', conversation: updated })
      this.emit({ type: 'turn-finished', conversationId: conversation.id, turnId: active.turnId })
      active.complete?.({
        conversationId: conversation.id,
        turnId: active.turnId,
        assistantMessage: message,
        status: 'completed'
      })
      active.complete = undefined
    } catch (error) {
      const stopped = error instanceof AiRunStoppedError
      const status = stopped ? 'cancelled' : 'failed'
      const message = this.persistAssistantSegment(active, status)
      this.finishReasoning(active, status)
      this.persistRunSummary(
        active,
        status,
        stopped ? undefined : error instanceof Error ? error.message : String(error)
      )
      const updated = this.store.updateConversationStatus(conversation.id, status)
      this.emit({ type: 'message', conversationId: conversation.id, turnId: active.turnId, message })
      this.emit({ type: 'conversation-updated', conversation: updated })
      if (stopped) {
        this.emit({ type: 'turn-finished', conversationId: conversation.id, turnId: active.turnId })
      } else {
        this.emit({
          type: 'turn-error',
          conversationId: conversation.id,
          turnId: active.turnId,
          message: error instanceof Error ? error.message : String(error),
          retryable: true
        })
      }
      active.complete?.({
        conversationId: conversation.id,
        turnId: active.turnId,
        assistantMessage: message,
        status,
        error: error instanceof Error ? error.message : String(error)
      })
      active.complete = undefined
    } finally {
      try {
        await this.captureNativeDocumentChange(active)
        this.persistRunChangeSet(active)
      } catch (error) {
        this.emit({
          type: 'turn-error',
          conversationId: active.conversationId,
          turnId: active.turnId,
          message: `The document change review could not be saved: ${
            error instanceof Error ? error.message : String(error)
          }`,
          retryable: false
        })
      } finally {
        this.active.delete(conversation.id)
        if (active.scopeToken) this.documentScopes?.revokeScope(active.scopeToken)
        this.documentScopes?.revokeRun(active.turnId)
        this.documentTransactions?.forgetRun(active.turnId)
      }
    }
  }

  private onHostEvent(active: ActiveRun, event: AiHostEvent): void {
    if (event.type === 'approval-requested') {
      this.emit({
        type: 'approval-requested',
        approval: {
          id: event.approvalId,
          runId: active.turnId,
          conversationId: active.conversationId,
          provider: event.provider,
          kind: event.kind,
          title: event.title,
          ...(event.detail ? { detail: event.detail } : {}),
          ...(event.command ? { command: event.command } : {}),
          ...(event.paths?.length ? { paths: event.paths } : {}),
          options: event.options,
          requestedAt: this.now()
        }
      })
      return
    }
    if (event.type === 'text-delta') {
      if (active.assistantSegmentClosed) {
        active.assistantMessageId = this.createId()
        active.assistantMessagePersisted = false
        active.assistantSegmentClosed = false
        active.assistantSegmentText = ''
      }
      active.text += event.delta
      active.assistantSegmentText += event.delta
      if (active.assistantMessagePersisted) {
        this.store.updateMessage(active.assistantMessageId, {
          content: active.assistantSegmentText
        })
      } else {
        this.store.addMessage({
          id: active.assistantMessageId,
          conversationId: active.conversationId,
          role: 'assistant',
          content: active.assistantSegmentText,
          status: 'streaming'
        })
        active.assistantMessagePersisted = true
      }
      this.emit({
        type: 'message-delta',
        conversationId: active.conversationId,
        turnId: active.turnId,
        messageId: active.assistantMessageId,
        role: 'assistant',
        delta: event.delta
      })
      return
    }
    if (event.type === 'reasoning-delta') {
      active.reasoningText += event.delta
      if (active.reasoningMessageId) {
        this.store.updateMessage(active.reasoningMessageId, { content: active.reasoningText })
      } else {
        const message = this.store.addMessage({
          conversationId: active.conversationId,
          role: 'system',
          content: active.reasoningText,
          status: 'streaming',
          toolName: AI_REASONING_MESSAGE_TOOL
        })
        active.reasoningMessageId = message.id
      }
      this.emit({
        type: 'message-delta',
        conversationId: active.conversationId,
        turnId: active.turnId,
        messageId: active.reasoningMessageId,
        role: 'system',
        delta: event.delta,
        toolName: AI_REASONING_MESSAGE_TOOL
      })
      return
    }
    if (event.type === 'tool-started') {
      if (active.assistantMessagePersisted && !active.assistantSegmentClosed) {
        const message = this.store.updateMessage(active.assistantMessageId, { status: 'complete' })
        active.assistantSegmentClosed = true
        this.emit({
          type: 'message',
          conversationId: active.conversationId,
          turnId: active.turnId,
          message
        })
      }
      const call: AiToolCall = {
        id: event.toolCallId,
        conversationId: active.conversationId,
        turnId: active.turnId,
        name: event.toolName,
        state: 'running',
        ...(event.input === undefined ? {} : { summary: safeText(event.input) })
      }
      const message = this.store.addMessage({
        conversationId: active.conversationId,
        role: 'tool',
        content: call.summary ?? '',
        status: 'streaming',
        toolCallId: call.id,
        toolName: call.name
      })
      active.tools.set(call.id, { call, messageId: message.id })
      this.emit({ type: 'tool', conversationId: active.conversationId, turnId: active.turnId, tool: call })
      this.emit({ type: 'message', conversationId: active.conversationId, turnId: active.turnId, message })
      return
    }
    if (event.type === 'tool-finished') {
      const current = active.tools.get(event.toolCallId)
      const call: AiToolCall = {
        ...(current?.call ?? {
          id: event.toolCallId,
          conversationId: active.conversationId,
          turnId: active.turnId,
          name: event.toolName
        }),
        state: event.isError ? 'failed' : 'succeeded',
        ...(event.isError ? { error: safeText(event.output) } : { summary: safeText(event.output) })
      }
      let message: AiMessage
      if (current) {
        message = this.store.updateMessage(current.messageId, {
          content: event.isError ? call.error ?? '' : call.summary ?? '',
          status: event.isError ? 'failed' : 'complete',
          toolName: call.name
        })
      } else {
        message = this.store.addMessage({
          conversationId: active.conversationId,
          role: 'tool',
          content: event.isError ? call.error ?? '' : call.summary ?? '',
          status: event.isError ? 'failed' : 'complete',
          toolCallId: call.id,
          toolName: call.name
        })
      }
      active.tools.set(call.id, { call, messageId: message.id })
      this.emit({ type: 'tool', conversationId: active.conversationId, turnId: active.turnId, tool: call })
      this.emit({ type: 'message', conversationId: active.conversationId, turnId: active.turnId, message })
    }
  }

  private persistAssistantSegment(
    active: ActiveRun,
    status: Extract<AiMessage['status'], 'complete' | 'failed' | 'cancelled'>
  ): AiMessage {
    if (active.assistantMessagePersisted) {
      return this.store.updateMessage(active.assistantMessageId, {
        content: active.assistantSegmentText,
        status
      })
    }
    const message = this.store.addMessage({
      id: active.assistantMessageId,
      conversationId: active.conversationId,
      role: 'assistant',
      content: active.assistantSegmentText,
      status
    })
    active.assistantMessagePersisted = true
    return message
  }

  private finishReasoning(
    active: ActiveRun,
    status: Extract<AiMessage['status'], 'complete' | 'failed' | 'cancelled'>
  ): void {
    if (!active.reasoningMessageId) return
    const message = this.store.updateMessage(active.reasoningMessageId, { status })
    this.emit({
      type: 'message',
      conversationId: active.conversationId,
      turnId: active.turnId,
      message
    })
  }

  private persistRunSummary(
    active: ActiveRun,
    status: Extract<AiMessage['status'], 'complete' | 'failed' | 'cancelled'>,
    error?: string
  ): void {
    const message = this.store.updateMessage(active.summaryMessageId, {
      content: JSON.stringify({
        durationMs: Math.max(0, this.now() - active.startedAt),
        ...(error ? { error } : {})
      }),
      status,
      toolName: AI_RUN_SUMMARY_TOOL
    })
    this.emit({
      type: 'message',
      conversationId: active.conversationId,
      turnId: active.turnId,
      message
    })
  }

  private hostMessages(conversation: AiConversation): AiHostMessage[] {
    const templates = new Map(this.store.listTemplates().map(template => [template.id, template]))
    const system = conversation.templateIds
      .map(id => templates.get(id)?.content)
      .filter((content): content is string => Boolean(content))
    const history = this.store.listMessages(conversation.id)
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .filter(message => message.content.length > 0)
      .reduce<AiHostMessage[]>((messages, message) => {
        const role = message.role as 'user' | 'assistant'
        const previous = messages.at(-1)
        if (role === 'assistant' && previous?.role === role) previous.content += `\n\n${message.content}`
        else messages.push({ role, content: message.content })
        return messages
      }, [])
    return [...system.map(content => ({ role: 'system' as const, content })), ...history]
  }

  private persistRunChangeSet(active: ActiveRun): void {
    if (active.mode !== 'agent') return
    const transaction = active.externalTransaction
      ?? this.documentTransactions?.getRunTransaction(active.turnId)
    if (!transaction || transaction.mutationCount === 0) return
    this.recordChangeSet({
      id: active.turnId,
      conversationId: active.conversationId,
      turnId: active.turnId,
      documentId: transaction.documentId,
      documentUri: transaction.documentUri,
      ...(transaction.filePath ? { filePath: transaction.filePath } : {}),
      originalContent: transaction.beforeMarkdown,
      appliedContent: transaction.finalMarkdown,
      status: transaction.status === 'kept'
        ? 'kept'
        : transaction.status === 'rolled-back'
          ? 'rolled-back'
          : 'applied-unreviewed',
      additions: transaction.diff.additions,
      deletions: transaction.diff.deletions,
      createdAt: this.now(),
      transaction
    })
  }

  private async captureNativeDocumentChange(active: ActiveRun): Promise<void> {
    const document = active.nativeDocument
    if (!document || document.captured || !this.documentTransactions) return
    let markdown: string
    try {
      markdown = readFileSync(document.filePath, 'utf8')
    } catch {
      return
    }
    if (markdown === document.beforeMarkdown) {
      const result = await this.documentTransactions.request(document.windowId, {
        action: 'keep',
        sessionId: active.conversationId,
        turnId: active.turnId
      })
      if (result.status !== 'kept') {
        const reason = 'reason' in result
          ? result.reason
          : 'message' in result
            ? result.message
            : result.status
        throw new Error(`Could not close the unchanged CLI document checkpoint: ${reason}.`)
      }
      document.captured = true
      return
    }
    const result = await this.documentTransactions.request(document.windowId, {
      action: 'mutate',
      sessionId: active.conversationId,
      turnId: active.turnId,
      documentId: document.documentId,
      documentUri: document.documentUri,
      filePath: document.filePath,
      expectedMarkdown: document.beforeMarkdown,
      nextMarkdown: markdown
    })
    if (result.status === 'applied') {
      active.externalTransaction = result.transaction
      document.captured = true
      return
    }
    const reason = 'reason' in result ? result.reason : 'message' in result ? result.message : result.status
    throw new Error(`Could not synchronize the CLI document change: ${reason}.`)
  }

  private issueDocumentScope(
    windowId: number,
    conversationId: string,
    turnId: string,
    request: AiSendRequest
  ): string {
    if (!this.documentScopes || !this.createMcpLaunchSpec) {
      throw new Error('AnnotaMD document Agent bridge is not ready.')
    }
    let document: AgentDocumentSnapshot | undefined
    const hasDocument = request.markdown !== undefined || request.documentHandleId !== undefined
    if (hasDocument) {
      if (
        !request.documentHandleId ||
        !request.documentId ||
        !request.documentUri ||
        request.markdown === undefined ||
        request.documentRevision === undefined
      ) {
        throw new Error('The live document identity, revision, and Markdown are required for Agent mode.')
      }
      document = {
        handleId: request.documentHandleId,
        documentId: request.documentId,
        uri: request.documentUri,
        ...(request.filePath ? { filePath: request.filePath } : {}),
        ...(request.workspacePath ? { workspacePath: request.workspacePath } : {}),
        revision: request.documentRevision,
        markdown: request.markdown,
        contentHash: request.documentContentHash ?? hashAgentDocument(request.markdown),
        dirty: request.documentDirty ?? false
      }
    }
    return this.documentScopes.issueScope({
      windowId,
      conversationId,
      runId: turnId,
      turnId,
      ...(document ? { document } : {}),
      ...(request.selectionText ? { selectionText: request.selectionText } : {})
    })
  }

  private async requireConfig(
    id?: string,
    expectedKind?: 'api' | 'cli'
  ): Promise<AiRuntimeConfig> {
    const config = id
      ? await this.store.getRuntimeConfig(id)
      : expectedKind
        ? await this.store.getRuntimeConfigForKind(expectedKind)
        : await this.store.getRuntimeConfig()
    if (!config || !config.enabled) throw new Error('Select an enabled AI configuration.')
    if (
      config.kind === 'api' &&
      aiApiProviderPreset(config.provider as import('@shared/types/aiWorkspace').AiApiProviderId)
        .requiresApiKey &&
      !config.secret
    ) throw new Error('The API key is not configured.')
    return config
  }

  private hostFor(config: AiRuntimeConfig): AiHost {
    if (config.provider === 'pi') return this.piHost
    return config.kind === 'api' ? this.apiHost : this.cliHost
  }

  private toHostConfig(
    config: AiRuntimeConfig,
    modelId = config.defaultModelId,
    effort?: AiConversation['effort'],
    permissionMode?: AiConversation['permissionMode']
  ): AiHostConfig {
    return {
      id: config.id,
      provider: config.provider,
      ...(modelId ? { model: modelId } : {}),
      ...(config.baseUrl ? { endpoint: config.baseUrl } : {}),
      ...(config.executablePath ? { executablePath: config.executablePath } : {}),
      ...(config.kind === 'cli' ? { environment: config.environment ?? {} } : {}),
      ...(config.secret ? { secret: config.secret } : {}),
      ...(config.kind === 'api'
        ? {
            apiStyle: config.apiStyle ?? aiApiProviderPreset(
              config.provider as import('@shared/types/aiWorkspace').AiApiProviderId
            ).apiStyle,
            authMethod: config.authMethod ?? aiApiProviderPreset(
              config.provider as import('@shared/types/aiWorkspace').AiApiProviderId
            ).authMethod,
            maxRetries: this.store.getPreferences().maxApiRetries
          }
        : {}),
      ...(effortValue(effort) ? { reasoningEffort: effortValue(effort) } : {}),
      ...(permissionMode ? { permissionMode } : {})
    }
  }

  private async getReadiness(): Promise<AiReadiness> {
    const configs = await this.store.listConfigSummaries()
    const usable = configs.find(config => (
      config.enabled && (
        config.kind === 'cli' ||
        !aiApiProviderPreset(config.provider as import('@shared/types/aiWorkspace').AiApiProviderId)
          .requiresApiKey ||
        config.apiKeyConfigured
      )
    ))
    if (!usable) {
      const apiWithoutKey = configs.find(config => (
        config.enabled &&
        config.kind === 'api' &&
        aiApiProviderPreset(config.provider as import('@shared/types/aiWorkspace').AiApiProviderId)
          .requiresApiKey
      ))
      return apiWithoutKey
        ? { status: 'needs-auth', configId: apiWithoutKey.id, message: 'Configure an API key.' }
        : { status: 'missing', message: 'Add an AI configuration to start.' }
    }
    return {
      status: 'ready',
      configId: usable.id,
      ...(usable.defaultModelId ? { modelId: usable.defaultModelId } : {})
    }
  }

  private track(owner: AiWorkspaceOwner): void {
    this.owners.set(owner.id, owner)
  }

  private emit(event: AiWorkspaceEvent): void {
    for (const [id, owner] of this.owners) {
      if (owner.isDestroyed?.()) {
        this.owners.delete(id)
        continue
      }
      owner.send('annotamd::ai::event', event)
    }
  }
}
