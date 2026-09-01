import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  AiApiAuthMethod,
  AiApiStyle,
  AiAttachment,
  AiApprovalDecision,
  AiPermissionMode
} from '@shared/types/aiWorkspace'

export type AiHostProvider =
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
  | 'anthropic-messages'
  | 'codex'
  | 'claude-code'
  | 'opencode'
  | 'pi'
  | 'cursor-cli'
  | 'grok-cli'
  | 'codebuddy-cli'
  | 'qoder-cli'

export type AiHostKind = 'api' | 'cli'

export interface AiHostConfig {
  id: string
  provider: AiHostProvider
  model?: string
  endpoint?: string
  executablePath?: string
  environment?: Record<string, string>
  secret?: string
  apiStyle?: AiApiStyle
  authMethod?: AiApiAuthMethod
  reasoningEffort?: string
  maxRetries?: number
  permissionMode?: AiPermissionMode
}

export interface AiHostMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiMcpLaunchSpec {
  command: string
  args: string[]
  env?: Record<string, string>
  enabledTools?: string[]
}

export interface AiHostRunRequest {
  runId: string
  conversationId: string
  config: AiHostConfig
  messages: AiHostMessage[]
  mode?: 'ask' | 'agent'
  workspacePath?: string
  additionalWorkspacePaths?: string[]
  workspaceProject?: {
    name: string
    idempotencyKey: string
  }
  activeDocument?: {
    documentId: string
    documentUri: string
    filePath?: string
  }
  permissionMode?: AiPermissionMode
  mcp?: AiMcpLaunchSpec
  attachments?: readonly AiAttachment[]
}

export interface AiHostModel {
  id: string
  displayName?: string
  effortLevels?: string[]
}

export interface AiHostConnectionResult {
  success: boolean
  message: string
  latencyMs?: number
}

export type AiHostEvent =
  | { type: 'run-started'; runId: string; conversationId: string }
  | { type: 'text-delta'; runId: string; delta: string }
  | { type: 'reasoning-delta'; runId: string; delta: string }
  | { type: 'tool-started'; runId: string; toolCallId: string; toolName: string; input?: unknown }
  | {
      type: 'approval-requested'
      runId: string
      approvalId: string
      provider: Extract<AiHostProvider, import('@shared/types/aiWorkspace').AiCliProviderId>
      kind: string
      title: string
      detail?: string
      command?: string
      paths?: string[]
      options: AiApprovalDecision[]
    }
  | {
    type: 'tool-finished'
    runId: string
    toolCallId: string
    toolName: string
    output?: unknown
    isError: boolean
  }
  | { type: 'response-complete'; runId: string }
  | { type: 'run-finished'; runId: string; inputTokens?: number; outputTokens?: number }
  | { type: 'run-stopped'; runId: string }
  | { type: 'run-error'; runId: string; code: string; message: string }

export interface AiHost {
  readonly kind: AiHostKind
  readonly providers: readonly AiHostProvider[]
  listModels(config: AiHostConfig): Promise<AiHostModel[]>
  testConnection(config: AiHostConfig): Promise<AiHostConnectionResult>
  run(request: AiHostRunRequest, emit: (event: AiHostEvent) => void): Promise<string>
  stop(runId: string): Promise<boolean>
  resolveApproval?(
    runId: string,
    approvalId: string,
    decision: AiApprovalDecision
  ): Promise<boolean>
  dispose(): void
}

export interface ActiveCliRun {
  child: ChildProcessWithoutNullStreams
  stopped: boolean
}

export class AiRunStoppedError extends Error {
  constructor() {
    super('AI run stopped')
    this.name = 'AiRunStoppedError'
  }
}

export const aiHostError = (
  runId: string,
  code: string,
  error: unknown
): AiHostEvent => ({
  type: 'run-error',
  runId,
  code,
  message: error instanceof Error ? error.message : String(error)
})
