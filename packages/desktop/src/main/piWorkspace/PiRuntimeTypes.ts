export type PiRuntimeReadinessStatus =
  | 'initializing'
  | 'ready'
  | 'missing'
  | 'incompatible'
  | 'needs-auth'
  | 'error'

export interface PiRuntimeReadiness {
  status: PiRuntimeReadinessStatus
  version?: string
  executablePath?: string
  executableArgs?: string[]
  model?: string
  message?: string
  adapterProtocol?: number
}

export interface PiRuntimeSession {
  id: string
  title?: string
  sessionFile?: string
}
