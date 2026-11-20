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
  /**
   * Extra environment required to launch the resolved executable. The bundled
   * Pi runtime is started through Electron itself, so it needs
   * ELECTRON_RUN_AS_NODE set before the child process exists.
   */
  launchEnvironment?: Record<string, string>
  model?: string
  message?: string
  adapterProtocol?: number
}

export interface PiRuntimeSession {
  id: string
  title?: string
  sessionFile?: string
}
