import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  listeners: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  removed: vi.fn(),
  fromWebContents: vi.fn()
}))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: {
    handle: (name: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => mocks.handlers.set(name, handler),
    on: (name: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => mocks.listeners.set(name, listener),
    removeListener: mocks.removed
  }
}))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))
import { ipcMain } from 'electron'
import { assertTrustedSender, isTrustedRendererUrl } from 'main_renderer/security/ipc'

function event(url = 'http://localhost:5173/?type=editor') {
  const frame = { url }
  return { sender: { isDestroyed: () => false, mainFrame: frame }, senderFrame: frame } as unknown as IpcMainInvokeEvent
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
  mocks.fromWebContents.mockReturnValue({})
  mocks.removed.mockClear()
})
describe('renderer IPC trust boundary', () => {
  it('accepts only the exact application entry in a registered window main frame', () => {
    expect(() => assertTrustedSender(event())).not.toThrow()
    expect(() => assertTrustedSender(event('https://example.com/'))).toThrow('Unauthorized')
    expect(isTrustedRendererUrl('http://localhost:5173.evil.test/')).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5173/another.html')).toBe(false)
    expect(isTrustedRendererUrl('file:///etc/passwd')).toBe(false)
    const child = { ...event(), senderFrame: { url: event().senderFrame!.url } } as IpcMainInvokeEvent
    expect(() => assertTrustedSender(child)).toThrow('Unauthorized')
    mocks.fromWebContents.mockReturnValue(null)
    expect(() => assertTrustedSender(event())).toThrow('Unauthorized')
  })

  it('guards every invoke handler, including legacy non-prefixed names', () => {
    const action = vi.fn(() => 'done')
    ipcMain.handle('legacy-action', action)
    expect(() => mocks.handlers.get('legacy-action')!(event('https://evil.test/'))).toThrow('Unauthorized')
    expect(action).not.toHaveBeenCalled()
    expect(mocks.handlers.get('legacy-action')!(event())).toBe('done')
  })

  it('rejects untrusted send/sync events and preserves in-process events and listener removal', () => {
    const action = vi.fn()
    ipcMain.on('annotamd::example', action)
    const listener = mocks.listeners.get('annotamd::example')!
    listener(event('https://evil.test/'))
    expect(action).not.toHaveBeenCalled()
    listener(event())
    expect(action).toHaveBeenCalledTimes(1)
    ipcMain.off('annotamd::example', action)
    expect(mocks.removed).toHaveBeenCalledWith('annotamd::example', listener)
    ipcMain.on('internal-action', action)
    mocks.listeners.get('internal-action')!(42 as unknown as IpcMainInvokeEvent)
    expect(action).toHaveBeenLastCalledWith(42)
  })
})
