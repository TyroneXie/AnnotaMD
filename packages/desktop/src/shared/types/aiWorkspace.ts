import type {
  AgentDocumentTransactionResult,
  AgentDocumentTurnSnapshot
} from './agentDocumentTransactions'

export type AiWorkspaceMode = 'ask' | 'agent'

export type AiPermissionMode = 'request' | 'full-access'

export type AiApprovalDecision = 'allow-once' | 'allow-session' | 'deny'

export interface AiApprovalRequest {
  id: string
  runId: string
  conversationId: string
  provider: AiCliProviderId
  kind: string
  title: string
  detail?: string
  command?: string
  paths?: string[]
  options: AiApprovalDecision[]
  requestedAt: number
}

export interface AiApprovalResolveRequest {
  conversationId: string
  runId: string
  approvalId: string
  decision: AiApprovalDecision
}

export type AiConfigKind = 'api' | 'cli'

export type AiApiStyle =
  | 'chat-completions'
  | 'responses'
  | 'anthropic-messages'
  | 'gemini-generate-content'

export type AiApiAuthMethod = 'bearer' | 'api-key'

export type AiApiProviderId =
  | 'claude'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'minimax'
  | 'ollama'
  | 'anthropic-compatible'
  | 'openai-compatible'
  | 'custom'
  /** Legacy provider id kept so existing AnnotaMD configs remain readable. */
  | 'anthropic-messages'
export type AiCliProviderId =
  | 'codex'
  | 'claude-code'
  | 'opencode'
  | 'pi'
  | 'cursor-cli'
  | 'grok-cli'
  | 'codebuddy-cli'
  | 'qoder-cli'
export type AiProviderId = AiApiProviderId | AiCliProviderId

interface AiConfigInputBase {
  name: string
  kind: AiConfigKind
  provider: AiProviderId
}

export interface AiApiConfigInput extends AiConfigInputBase {
  kind: 'api'
  provider: AiApiProviderId
  baseUrl: string
  apiKey?: string
  defaultModelId?: string
  apiStyle?: AiApiStyle
  authMethod?: AiApiAuthMethod
}

export interface AiCliConfigInput extends AiConfigInputBase {
  kind: 'cli'
  provider: AiCliProviderId
  /** Optional absolute executable path. The Host owns fixed args and environment. */
  executablePath?: string
  /** Optional environment values passed only to the selected CLI process. */
  environment?: Record<string, string>
  defaultModelId?: string
  supportsNativeResume?: boolean
}

export type AiConfigInput = AiApiConfigInput | AiCliConfigInput

export interface AiConfigSaveRequest {
  id?: string
  input: AiConfigInput
  isDefault?: boolean
  enabled?: boolean
}

export type AiConfigRecord = AiConfigInput & {
  id: string
  isDefault: boolean
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface AiConfigSummary {
  id: string
  name: string
  kind: AiConfigKind
  provider: AiProviderId
  isDefault: boolean
  enabled: boolean
  baseUrl?: string
  apiKeyConfigured?: boolean
  apiStyle?: AiApiStyle
  authMethod?: AiApiAuthMethod
  executablePath?: string
  environment?: Record<string, string>
  defaultModelId?: string
  supportsNativeResume?: boolean
}

export interface AiCliDetectionRequest {
  provider: AiCliProviderId
  executablePath?: string
  environment?: Record<string, string>
}

export interface AiCliDetectionResult {
  found: boolean
  provider: AiCliProviderId
  command: string
  executablePath?: string
  version?: string
  message: string
}

export interface AiModelInfo {
  id: string
  name?: string
  provider?: AiProviderId
  /** Provider-reported effort levels supported by this exact model. */
  effortLevels?: string[]
}

export interface AiConnectionTestResult {
  ok: boolean
  message: string
  version?: string
  models?: AiModelInfo[]
}

export type AiEffortSelection =
  | { kind: 'provider-default' }
  | { kind: 'preset'; id: string }
  | { kind: 'integer'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'text'; value: string }

export type AiReadinessStatus =
  | 'initializing'
  | 'ready'
  | 'missing'
  | 'needs-auth'
  | 'incompatible'
  | 'error'

export interface AiReadiness {
  status: AiReadinessStatus
  configId?: string
  modelId?: string
  version?: string
  message?: string
}

export type AiConversationStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AiConversation {
  id: string
  title: string
  mode: AiWorkspaceMode
  configId?: string
  provider?: AiProviderId
  modelId?: string
  effort?: AiEffortSelection
  permissionMode: AiPermissionMode
  templateIds: string[]
  workspacePath?: string
  nativeSessionId?: string
  nativeSessionFile?: string
  status: AiConversationStatus
  createdAt: number
  updatedAt: number
}

export interface AiConversationCreateRequest {
  title?: string
  mode: AiWorkspaceMode
  configId?: string
  modelId?: string
  effort?: AiEffortSelection
  permissionMode?: AiPermissionMode
  templateIds?: string[]
}

export interface AiConversationRenameRequest {
  conversationId: string
  title: string
}

export type AiMessageRole = 'user' | 'assistant' | 'tool' | 'system'
export type AiMessageStatus = 'streaming' | 'complete' | 'failed' | 'cancelled'

export interface AiMessage {
  id: string
  conversationId: string
  role: AiMessageRole
  content: string
  status: AiMessageStatus
  createdAt: number
  toolCallId?: string
  toolName?: string
}

export type AiToolState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface AiToolCall {
  id: string
  conversationId: string
  turnId: string
  name: string
  state: AiToolState
  summary?: string
  target?: string
  error?: string
}

export type AiChangeSetStatus =
  | 'applied-unreviewed'
  | 'kept'
  | 'rolled-back'
  | 'conflicted'

export interface AiChangeSet {
  id: string
  conversationId: string
  turnId: string
  documentId: string
  documentUri: string
  filePath?: string
  originalContent: string
  appliedContent: string
  status: AiChangeSetStatus
  additions: number
  deletions: number
  createdAt: number
  resolvedAt?: number
  message?: string
  transaction?: AgentDocumentTurnSnapshot
}

export interface AiChangeSetResolveRequest {
  changeSetId: string
  action: 'keep' | 'rollback'
}

export interface AiChangeSetResolveResult {
  changeSet: AiChangeSet
  transactionResult: AgentDocumentTransactionResult
}

export interface AiTemplate {
  id: string
  name: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface AiTemplateSaveRequest {
  id?: string
  name: string
  content: string
}

export interface AiWorkspaceSelection {
  mode: AiWorkspaceMode
  configId?: string
  modelId?: string
  effort?: AiEffortSelection
  permissionMode: AiPermissionMode
  templateIds: string[]
}

export interface AiDocumentContext {
  documentHandleId: string
  documentId: string
  documentUri: string
  filePath?: string
  markdown: string
  revision: number
  dirty: boolean
  contentHash?: string
  selectionText?: string
}

export interface AiTextAttachment {
  kind: 'text'
  name: string
  content: string
  truncated?: boolean
}

export interface AiImageAttachment {
  kind: 'image'
  name: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  /** Base64-encoded image bytes without a data URL prefix. */
  data: string
  sizeBytes: number
}

export type AiAttachment = AiTextAttachment | AiImageAttachment

export interface AiConversationContents {
  messages: AiMessage[]
  changeSets: AiChangeSet[]
}

export interface AiWorkspaceSnapshot {
  readiness: AiReadiness
  configs: AiConfigSummary[]
  conversations: AiConversation[]
  activeConversationId?: string
  messages: AiMessage[]
  changeSets: AiChangeSet[]
  running: boolean
  activeTurnId?: string
}

export const AI_MAX_API_RETRIES_MIN = 0
export const AI_MAX_API_RETRIES_MAX = 10
export const AI_MAX_API_RETRIES_DEFAULT = 2

export interface AiWorkspacePreferences {
  maxApiRetries: number
}

export interface AiSendRequest {
  conversationId?: string
  text: string
  selection: AiWorkspaceSelection
  workspacePath: string
  documentHandleId?: string
  documentId?: string
  documentUri?: string
  filePath?: string
  markdown?: string
  documentRevision?: number
  documentContentHash?: string
  documentDirty?: boolean
  selectionText?: string
  /** Attachments apply to this turn only and are not persisted in chat history. */
  attachments?: AiAttachment[]
}

export interface AiSendResult {
  conversationId: string
  turnId: string
  userMessageId: string
  assistantMessageId: string
}

export interface AiStopRequest {
  conversationId: string
  turnId?: string
}

export interface AiRetryRequest {
  conversationId: string
  messageId?: string
  turnId?: string
  workspacePath?: string
  documentHandleId?: string
  documentId?: string
  documentUri?: string
  filePath?: string
  markdown?: string
  documentRevision?: number
  documentContentHash?: string
  documentDirty?: boolean
  selectionText?: string
}

export type AiWorkspaceEvent =
  | { type: 'snapshot'; snapshot: AiWorkspaceSnapshot }
  | { type: 'readiness'; readiness: AiReadiness }
  | { type: 'conversation-created'; conversation: AiConversation }
  | { type: 'conversation-updated'; conversation: AiConversation }
  | { type: 'conversation-deleted'; conversationId: string }
  | {
      type: 'conversation-selected'
      conversationId: string
      messages: AiMessage[]
      changeSets: AiChangeSet[]
    }
  | { type: 'turn-started'; conversationId: string; turnId: string }
  | {
      type: 'message-delta'
      conversationId: string
      turnId: string
      messageId: string
      role: Extract<AiMessageRole, 'assistant' | 'tool'>
      delta: string
    }
  | { type: 'message'; conversationId: string; turnId?: string; message: AiMessage }
  | { type: 'tool'; conversationId: string; turnId: string; tool: AiToolCall }
  | { type: 'approval-requested'; approval: AiApprovalRequest }
  | {
      type: 'approval-resolved'
      conversationId: string
      turnId: string
      approvalId: string
      decision: AiApprovalDecision
    }
  | { type: 'change-set'; conversationId: string; turnId: string; changeSet: AiChangeSet }
  | { type: 'turn-finished'; conversationId: string; turnId: string }
  | {
      type: 'turn-error'
      conversationId: string
      turnId?: string
      message: string
      retryable: boolean
    }
