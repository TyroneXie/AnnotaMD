import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { AppUpdateState } from '@shared/types/update'
import { isAppUpdateSupported } from './support'
import { reduceUpdateState, shouldAutomaticallyDownload, type AppUpdateEvent } from './state'

const updateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion()
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
  _browserWindow?: BrowserWindow | null
): Promise<AppUpdateState> => {
  if (!isAppUpdateSupported()) {
    return dispatch({ type: 'unsupported' })
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
  return snapshot()
}

export const downloadUpdate = async(): Promise<AppUpdateState> => {
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
