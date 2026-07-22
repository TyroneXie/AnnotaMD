import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import log from 'electron-log'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { AppUpdateState } from '@shared/types/update'
import { t } from '../i18n'
import { isAppUpdateSupported, isAutomaticUpdateInstallSupported } from './support'
import { reduceUpdateState, shouldAutomaticallyDownload, type AppUpdateEvent } from './state'

const updateSupported = isAppUpdateSupported()
const updateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  ...(updateSupported && !isAutomaticUpdateInstallSupported()
    ? { manualInstallRequired: true }
    : {})
}

let registered = false
let startupTimer: NodeJS.Timeout | null = null
let automaticDownloadsEnabled = true

const snapshot = (): AppUpdateState => ({ ...updateState })

const broadcast = (): void => {
  const state = snapshot()
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send('annotamd::update:state', state)
    }
  }
}

const dispatch = (event: AppUpdateEvent): AppUpdateState => {
  Object.assign(updateState, reduceUpdateState(updateState, event))
  broadcast()
  return snapshot()
}

const setError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error || 'Unknown update error')
  log.error('Application update failed:', message)
  dispatch({ type: 'error', message })
}

const showManualCheckResult = async(
  browserWindow: BrowserWindow | null | undefined,
  state: AppUpdateState
): Promise<void> => {
  if (!browserWindow || browserWindow.isDestroyed()) return

  let type: 'info' | 'error'
  let message: string
  let detail: string
  switch (state.status) {
    case 'up-to-date':
      type = 'info'
      message = t('updates.upToDate')
      detail = t('updates.currentVersion', { version: state.currentVersion })
      break
    case 'error':
      type = 'error'
      message = t('updates.error')
      detail = state.message ?? ''
      break
    case 'unsupported':
      type = 'info'
      message = t('updates.unsupported')
      detail = t('updates.currentVersion', { version: state.currentVersion })
      break
    default:
      return
  }

  try {
    await dialog.showMessageBox(browserWindow, {
      type,
      title: t('updates.title'),
      message,
      detail,
      buttons: [t('common.ok')],
      defaultId: 0,
      noLink: true
    })
  } catch (error) {
    log.error('Failed to show application update result:', error)
  }
}

const bindUpdaterEvents = (): void => {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = log

  autoUpdater.on('checking-for-update', () => {
    dispatch({ type: 'checking' })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    dispatch({ type: 'available', version: info.version })
    if (shouldAutomaticallyDownload(automaticDownloadsEnabled, updateState)) {
      void downloadUpdate()
    }
  })
  autoUpdater.on('update-not-available', () => {
    dispatch({ type: 'not-available' })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    dispatch({
      type: 'download-progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    dispatch({ type: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', setError)
}

export const getUpdateState = (): AppUpdateState => snapshot()

export const checkForUpdates = async(
  browserWindow?: BrowserWindow | null
): Promise<AppUpdateState> => {
  if (!isAppUpdateSupported()) {
    const state = dispatch({ type: 'unsupported' })
    await showManualCheckResult(browserWindow, state)
    return state
  }
  if (updateState.status === 'checking' || updateState.status === 'downloading') {
    return snapshot()
  }

  dispatch({ type: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    setError(error)
  }
  const state = snapshot()
  await showManualCheckResult(browserWindow, state)
  return state
}

export const downloadUpdate = async(): Promise<AppUpdateState> => {
  if (updateState.manualInstallRequired) return snapshot()
  if (updateState.status === 'downloading' || updateState.status === 'downloaded') {
    return snapshot()
  }
  if (updateState.status !== 'available' && !(updateState.status === 'error' && updateState.version)) {
    return snapshot()
  }

  dispatch({ type: 'download-started' })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    setError(error)
  }
  return snapshot()
}

export const installDownloadedUpdate = (): AppUpdateState => {
  if (updateState.status === 'downloaded') {
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }
  return snapshot()
}

export const setAutomaticUpdateDownloads = (enabled: boolean): void => {
  automaticDownloadsEnabled = enabled
  if (shouldAutomaticallyDownload(enabled, updateState)) {
    void downloadUpdate()
  }
}

export const registerAppUpdater = (): void => {
  if (registered) return
  registered = true
  bindUpdaterEvents()

  if (!isAppUpdateSupported()) {
    Object.assign(updateState, reduceUpdateState(updateState, { type: 'unsupported' }))
  }

  ipcMain.handle('annotamd::update:get-state', () => getUpdateState())
  ipcMain.handle('annotamd::update:check', () => checkForUpdates())
  ipcMain.handle('annotamd::update:download', () => downloadUpdate())
  ipcMain.handle('annotamd::update:install', () => installDownloadedUpdate())
}

export const scheduleStartupUpdateCheck = (delayMs = 4000): void => {
  if (!isAppUpdateSupported() || startupTimer) return
  startupTimer = setTimeout(() => {
    startupTimer = null
    void checkForUpdates()
  }, delayMs)
  startupTimer.unref()
}

export { isAppUpdateSupported }
