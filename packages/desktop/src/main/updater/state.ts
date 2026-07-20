import type { AppUpdateState } from '@shared/types/update'

export type AppUpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'download-started' }
  | { type: 'download-progress'; percent: number; transferred: number; total: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }
  | { type: 'unsupported' }

export const shouldAutomaticallyDownload = (
  enabled: boolean,
  state: AppUpdateState
): boolean => enabled && state.status === 'available'

export const reduceUpdateState = (
  current: AppUpdateState,
  event: AppUpdateEvent
): AppUpdateState => {
  switch (event.type) {
    case 'checking':
      return { ...current, status: 'checking', message: undefined, progress: undefined }
    case 'available':
      return {
        ...current,
        status: 'available',
        version: event.version,
        message: undefined,
        progress: undefined,
        transferred: undefined,
        total: undefined
      }
    case 'not-available':
      return {
        status: 'up-to-date',
        currentVersion: current.currentVersion
      }
    case 'download-started':
      return { ...current, status: 'downloading', progress: 0, message: undefined }
    case 'download-progress':
      return {
        ...current,
        status: 'downloading',
        progress: Math.max(0, Math.min(100, event.percent)),
        transferred: event.transferred,
        total: event.total,
        message: undefined
      }
    case 'downloaded':
      return {
        ...current,
        status: 'downloaded',
        version: event.version,
        progress: 100,
        message: undefined
      }
    case 'error':
      return { ...current, status: 'error', message: event.message, progress: undefined }
    case 'unsupported':
      return { status: 'unsupported', currentVersion: current.currentVersion }
  }
}
