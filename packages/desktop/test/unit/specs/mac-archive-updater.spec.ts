// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadUpdateOptions } from 'electron-updater/out/AppUpdater'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), start: vi.fn(), approve: vi.fn(), download: vi.fn(),
  close: vi.fn(), quit: vi.fn(), kill: vi.fn(),
  translated: false
}))

vi.mock('electron', async() => {
  const {EventEmitter} = await import('node:events')
  const app = Object.assign(new EventEmitter(), {
    getPath: () => '/tmp/annotamd-test-user-data', quit: mocks.quit
  })
  Object.defineProperty(app, 'runningUnderARM64Translation', {get: () => mocks.translated})
  return {app, ipcMain: new EventEmitter(), BrowserWindow: {getAllWindows: () => [{close: mocks.close}]}}
})
vi.mock('electron-updater', async() => {
  const {EventEmitter} = await import('node:events')
  return {AppUpdater: class extends EventEmitter {
    async executeDownload(options: any) {
      await options.task('/tmp/update.zip', {sha512: options.fileInfo.info.sha512})
      await options.done({downloadedFile: '/tmp/update.zip', version: options.downloadUpdateOptions.updateInfoAndProvider.info.version})
      return ['/tmp/update.zip']
    }
    dispatchUpdateDownloaded(event: unknown) { this.emit('update-downloaded', event) }
    dispatchError(error: Error) { this.emit('error', error) }
  }}
})
vi.mock('electron-updater/out/electronHttpExecutor', () => ({
  ElectronHttpExecutor: class { download = mocks.download }
}))
vi.mock('../../../src/main/updater/macBundleInstaller', () => ({
  prepareMacBundleUpdate: mocks.prepare, startMacBundleInstall: mocks.start, approveMacBundleInstall: mocks.approve
}))

import { app, ipcMain } from 'electron'
import { MacArchiveUpdater } from '../../../src/main/updater/macArchiveUpdater'

const options = (architectures = ['x64', 'arm64']) => ({
  updateInfoAndProvider: {
    info: {version: '2.20.0'},
    provider: {resolveFiles: () => architectures.map(arch => ({
      url: new URL(`https://github.com/TyroneXie/AnnotaMD/releases/download/v2.20.0/annotamd-mac-${arch}-2.20.0.zip`),
      info: {url: `annotamd-mac-${arch}-2.20.0.zip`, sha512: 'expected-checksum'}
    }))}
  }
}) as unknown as DownloadUpdateOptions

const download = (updater: MacArchiveUpdater, value = options()) =>
  (updater as unknown as {doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]>}).doDownloadUpdate(value)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.translated = false
  app.removeAllListeners()
  ipcMain.removeAllListeners()
  mocks.prepare.mockReset().mockResolvedValue({target: '/Applications/AnnotaMD.app', stage: '/Applications/.annotamd-update-test'})
  mocks.start.mockReset().mockResolvedValue({kill: mocks.kill})
  mocks.approve.mockReset()
  mocks.download.mockReset().mockResolvedValue('/tmp/update.zip')
  mocks.close.mockReset()
})

describe('manual macOS archive updates', () => {
  it('selects the matching architecture and preserves the checksum passed by the download executor', async() => {
    const updater = new MacArchiveUpdater()
    const downloaded = vi.fn()
    updater.on('update-downloaded', downloaded)
    await download(updater)
    expect(mocks.download.mock.calls[0][0].pathname).toContain(process.arch === 'arm64' ? '-arm64-' : '-x64-')
    expect(mocks.download.mock.calls[0][2]).toEqual({sha512: 'expected-checksum'})
    expect(mocks.prepare).toHaveBeenCalledBefore(downloaded)
    expect(downloaded).toHaveBeenCalledOnce()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('selects ARM64 when running under Rosetta', async() => {
    mocks.translated = true
    const descriptor = Object.getOwnPropertyDescriptor(process, 'arch')!
    Object.defineProperty(process, 'arch', {value: 'x64'})
    try {
      await download(new MacArchiveUpdater())
      expect(mocks.download.mock.calls[0][0].pathname).toContain('-arm64-')
    } finally {
      Object.defineProperty(process, 'arch', descriptor)
    }
  })

  it('does not report the update ready if bundle validation fails', async() => {
    mocks.prepare.mockRejectedValue(new Error('invalid signature'))
    const updater = new MacArchiveUpdater()
    const downloaded = vi.fn()
    updater.on('update-downloaded', downloaded)
    await expect(download(updater)).rejects.toThrow('invalid signature')
    expect(downloaded).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('rejects an update without a matching architecture before starting a download', async() => {
    await expect(download(new MacArchiveUpdater(), options(['unsupported']))).rejects.toThrow('architecture')
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('installs only after the restart click and the normal close flow reaches will-quit', async() => {
    const updater = new MacArchiveUpdater()
    await download(updater)
    app.emit('will-quit', {preventDefault: vi.fn()})
    expect(mocks.start).not.toHaveBeenCalled()
    updater.quitAndInstall()
    updater.quitAndInstall()
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(mocks.approve).not.toHaveBeenCalled()
    app.emit('will-quit', {preventDefault: vi.fn()})
    expect(mocks.approve).toHaveBeenCalledOnce()
  })

  it('cancels the helper when closing is cancelled and does not install on a later normal quit', async() => {
    const updater = new MacArchiveUpdater()
    await download(updater)
    updater.quitAndInstall()
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    ipcMain.emit('annotamd::window-close-cancelled')
    expect(mocks.kill).toHaveBeenCalledOnce()
    app.emit('will-quit', {preventDefault: vi.fn()})
    expect(mocks.approve).not.toHaveBeenCalled()
    updater.quitAndInstall()
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2))
  })

  it('keeps all windows open when the helper cannot start', async() => {
    mocks.start.mockRejectedValue(new Error('no disk space'))
    const updater = new MacArchiveUpdater()
    const error = vi.fn()
    updater.on('error', error)
    await download(updater)
    updater.quitAndInstall()
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
    expect(mocks.close).not.toHaveBeenCalled()
    expect(mocks.quit).not.toHaveBeenCalled()
  })
})
