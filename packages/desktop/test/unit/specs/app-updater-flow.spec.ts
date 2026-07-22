import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload?: unknown) => void>()
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    logger: null as unknown,
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler)
      return autoUpdater
    }),
    checkForUpdates: vi.fn<() => Promise<unknown>>(),
    downloadUpdate: vi.fn<() => Promise<string[]>>(),
    quitAndInstall: vi.fn()
  }

  return {
    handlers,
    autoUpdater,
    showMessageBox: vi.fn(),
    ipcHandle: vi.fn(),
    supported: { value: true },
    automaticInstallSupported: { value: true }
  }
})

vi.mock('electron', () => ({
  app: { getVersion: () => '2.13.0' },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showMessageBox: mocks.showMessageBox },
  ipcMain: { handle: mocks.ipcHandle }
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }))

vi.mock('../../../src/main/updater/support', () => ({
  isAppUpdateSupported: () => mocks.supported.value,
  isAutomaticUpdateInstallSupported: () => mocks.automaticInstallSupported.value
}))

vi.mock('../../../src/main/i18n', () => ({
  t: (key: string, params: Record<string, string> = {}) => {
    const messages: Record<string, string> = {
      'updates.title': 'Software update',
      'updates.upToDate': "You're using the latest version.",
      'updates.error': 'The update could not be completed. Try again.',
      'updates.unsupported': 'This package cannot update itself.',
      'updates.currentVersion': `Current version: ${params.version ?? ''}`,
      'common.ok': 'OK'
    }
    return messages[key] ?? key
  }
}))

const loadUpdater = async() => {
  vi.resetModules()
  const updater = await import('../../../src/main/updater')
  updater.registerAppUpdater()
  return updater
}

const manualWindow = {
  isDestroyed: () => false
} as BrowserWindow

describe('application updater flow', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.supported.value = true
    mocks.automaticInstallSupported.value = true
    mocks.showMessageBox.mockReset().mockResolvedValue({ response: 0 })
    mocks.ipcHandle.mockReset()
    mocks.autoUpdater.on.mockClear()
    mocks.autoUpdater.checkForUpdates.mockReset()
    mocks.autoUpdater.downloadUpdate.mockReset()
    mocks.autoUpdater.quitAndInstall.mockReset()
  })

  it('shows an explicit result when a manual check finds no update', async() => {
    mocks.autoUpdater.checkForUpdates.mockImplementation(async() => {
      mocks.handlers.get('update-not-available')?.({ version: '2.13.0' })
      return null
    })
    const updater = await loadUpdater()

    await expect(updater.checkForUpdates(manualWindow)).resolves.toMatchObject({
      status: 'up-to-date',
      currentVersion: '2.13.0'
    })
    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      manualWindow,
      expect.objectContaining({
        type: 'info',
        title: 'Software update',
        message: "You're using the latest version.",
        detail: 'Current version: 2.13.0'
      })
    )
  })

  it('keeps automatic startup checks silent when no update is available', async() => {
    mocks.autoUpdater.checkForUpdates.mockImplementation(async() => {
      mocks.handlers.get('update-not-available')?.({ version: '2.13.0' })
      return null
    })
    const updater = await loadUpdater()

    await updater.checkForUpdates()

    expect(mocks.showMessageBox).not.toHaveBeenCalled()
  })

  it('shows update errors from a manual check instead of failing silently', async() => {
    mocks.autoUpdater.checkForUpdates.mockRejectedValue(new Error('network offline'))
    const updater = await loadUpdater()

    await expect(updater.checkForUpdates(manualWindow)).resolves.toMatchObject({
      status: 'error',
      message: 'network offline'
    })
    expect(mocks.showMessageBox).toHaveBeenCalledWith(
      manualWindow,
      expect.objectContaining({
        type: 'error',
        message: 'The update could not be completed. Try again.',
        detail: 'network offline'
      })
    )
  })

  it('automatically downloads an available update and installs only on request', async() => {
    mocks.autoUpdater.checkForUpdates.mockImplementation(async() => {
      mocks.handlers.get('update-available')?.({ version: '2.14.0' })
      return null
    })
    mocks.autoUpdater.downloadUpdate.mockImplementation(async() => {
      mocks.handlers.get('download-progress')?.({ percent: 54, transferred: 54, total: 100 })
      mocks.handlers.get('update-downloaded')?.({ version: '2.14.0' })
      return ['/tmp/update.zip']
    })
    const updater = await loadUpdater()

    await updater.checkForUpdates()
    await vi.waitFor(() => {
      expect(updater.getUpdateState()).toMatchObject({
        status: 'downloaded',
        version: '2.14.0',
        progress: 100
      })
    })
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce()
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()

    updater.installDownloadedUpdate()
    await vi.waitFor(() => {
      expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })
  })

  it('does not download an update that the current package cannot install', async() => {
    mocks.automaticInstallSupported.value = false
    mocks.autoUpdater.checkForUpdates.mockImplementation(async() => {
      mocks.handlers.get('update-available')?.({ version: '2.14.0' })
      return null
    })
    const updater = await loadUpdater()

    await updater.checkForUpdates()

    expect(updater.getUpdateState()).toMatchObject({
      status: 'available',
      version: '2.14.0',
      manualInstallRequired: true
    })
    expect(mocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })
})
