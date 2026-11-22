import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import log from 'electron-log'

export function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
      const development = new URL(process.env.ELECTRON_RENDERER_URL)
      return url.origin === development.origin && url.pathname === development.pathname
    }
    return url.protocol === 'file:' && fileURLToPath(url) === path.resolve(__dirname, '../renderer/index.html')
  } catch {
    return false
  }
}

export function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  const sender = event.sender
  const frame = event.senderFrame
  if (!sender || sender.isDestroyed() || !frame || frame !== sender.mainFrame ||
    !BrowserWindow.fromWebContents(sender) || !isTrustedRendererUrl(frame.url)) {
    throw new Error('Unauthorized IPC sender')
  }
}

// Install before importing modules that register handlers. Keep Electron's
// registration API so every existing and future renderer channel is guarded.
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => handle(channel, (event, ...args) => {
  assertTrustedSender(event)
  return handler(event, ...args)
})

type Listener = Parameters<typeof ipcMain.on>[1]
const on = ipcMain.on.bind(ipcMain)
const remove = ipcMain.removeListener.bind(ipcMain)
const listeners = new WeakMap<Listener, Map<string, Listener>>()
ipcMain.on = (channel, listener) => {
  let channels = listeners.get(listener)
  if (!channels) listeners.set(listener, channels = new Map())
  let guarded = channels.get(channel)
  if (!guarded) {
    guarded = (event: IpcMainEvent, ...args: unknown[]) => {
      // ipcMain.emit also carries in-process events whose first argument is
      // ordinary payload. Electron always supplies sender for renderer IPC.
      if (event && typeof event === 'object' && 'sender' in event) {
        try {
          assertTrustedSender(event)
        } catch {
          event.returnValue = null
          log.warn('Rejected untrusted IPC message', channel)
          return
        }
      } else {
        listener(event, ...args)
        return
      }
      try {
        void Promise.resolve(listener(event, ...args)).catch(error => log.warn('IPC action failed', channel, error))
      } catch (error) {
        event.returnValue = null
        log.warn('IPC action failed', channel, error)
      }
    }
    channels.set(channel, guarded)
  }
  return on(channel, guarded)
}
ipcMain.removeListener = (channel, listener) => remove(channel, listeners.get(listener)?.get(channel) ?? listener)
ipcMain.off = ipcMain.removeListener
