export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  version?: string
  progress?: number
  transferred?: number
  total?: number
  message?: string
}
