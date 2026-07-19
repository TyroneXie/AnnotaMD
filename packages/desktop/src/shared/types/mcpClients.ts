export type AnnotaMDMcpClientId =
  | 'codex'
  | 'claude-code'

export interface AnnotaMDMcpClientState {
  id: AnnotaMDMcpClientId
  installed: boolean
  configured: boolean
  canAutoConfigure: boolean
  executable?: string
  error?: string
}

export interface AnnotaMDMcpClientConfigureResult {
  success: boolean
  message?: string
  client: AnnotaMDMcpClientState
}

export interface AnnotaMDMcpManualConfigResult {
  manualConfig: string
}
