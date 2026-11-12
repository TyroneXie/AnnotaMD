import { app, BrowserWindow, ipcMain } from 'electron'
import { AppUpdater, type UpdateDownloadedEvent } from 'electron-updater'
import type { DownloadUpdateOptions } from 'electron-updater/out/AppUpdater'
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor'
import {
  prepareMacBundleUpdate, startMacBundleInstall, approveMacBundleInstall, type PreparedMacUpdate
} from './macBundleInstaller'

export class MacArchiveUpdater extends AppUpdater {
  private prepared: PreparedMacUpdate | null = null
  private restartRequested = false
  private readonly downloader: ElectronHttpExecutor

  constructor() {
    super(null)
    this.downloader = new ElectronHttpExecutor((info, callback) => this.emit('login', info, callback))
  }

  protected override async doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]> {
    const { info, provider } = options.updateInfoAndProvider
    const architecture = process.arch === 'arm64' || app.runningUnderARM64Translation ? 'arm64' : 'x86_64'
    const fileArchitecture = architecture === 'arm64' ? 'arm64' : 'x64'
    const file = provider.resolveFiles(info).find(file =>
      file.url.pathname.endsWith('.zip') && file.url.pathname.includes(`-${fileArchitecture}-`))
    if (!file) throw new Error('No AnnotaMD update is available for this Mac architecture.')
    return this.executeDownload({
      fileExtension: 'zip', fileInfo: file, downloadUpdateOptions: options,
      task: (destination, downloadOptions) => this.downloader.download(file.url, destination, downloadOptions),
      done: async(event: UpdateDownloadedEvent) => {
        this.prepared = await prepareMacBundleUpdate(
          event.downloadedFile, event.version, process.execPath, app.getPath('userData'), architecture)
        this.dispatchUpdateDownloaded(event)
      }
    })
  }

  override quitAndInstall(): void {
    if (!this.prepared || this.restartRequested) return
    this.restartRequested = true
    const update = this.prepared
    void startMacBundleInstall(update).then(child => {
      const cancel = (): void => {
        child.kill()
        this.restartRequested = false
        app.removeListener('will-quit', approve)
        ipcMain.removeListener('annotamd::window-close-cancelled', cancel)
      }
      const approve = (event: Electron.Event): void => {
        try {
          approveMacBundleInstall(update)
          ipcMain.removeListener('annotamd::window-close-cancelled', cancel)
        } catch (error) {
          event.preventDefault()
          cancel()
          this.dispatchError(error as Error)
          app.emit('activate')
        }
      }
      app.once('will-quit', approve)
      ipcMain.on('annotamd::window-close-cancelled', cancel)
      const windows = BrowserWindow.getAllWindows()
      if (windows.length === 0) app.quit()
      else for (const window of windows) window.close()
    }).catch(error => {
      this.restartRequested = false
      this.dispatchError(error)
    })
  }
}
