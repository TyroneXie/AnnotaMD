// Sandboxed preload: only `electron` can be required, and only a tiny subset of
// `process` is available (platform, versions, env). Everything else lives in
// the main process and is reached via IPC.
//
// All IPC traffic is funneled through the typed generics in
// `@shared/types/ipc` so channel names, argument tuples and return shapes
// are checked at the call site.

import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import pathe from 'pathe'

import type {
  IpcInvokeChannels,
  IpcSendChannels,
  IpcSyncChannels,
  IpcMainEventChannels,
  BootInfo
} from '@shared/types/ipc'

type RendererEventListener<K extends keyof IpcMainEventChannels> = (
  event: IpcRendererEvent,
  ...args: IpcMainEventChannels[K]
) => void

const invoke = <K extends keyof IpcInvokeChannels>(
  channel: K,
  ...args: IpcInvokeChannels[K]['args']
): Promise<IpcInvokeChannels[K]['ret']> => ipcRenderer.invoke(channel, ...args)

const send = <K extends keyof IpcSendChannels>(channel: K, ...args: IpcSendChannels[K]): void =>
  ipcRenderer.send(channel, ...args)

// One synchronous handshake at startup so the renderer can read platform/env
// without an `await` from inside Vue computed properties etc.
const bootInfo = ipcRenderer.sendSync('annotamd::boot-info') as BootInfo | undefined

const ipcWrapper = {
  send,
  sendSync: <K extends keyof IpcSyncChannels>(
    channel: K,
    ...args: IpcSyncChannels[K]['args']
  ): IpcSyncChannels[K]['ret'] => ipcRenderer.sendSync(channel, ...args),
  invoke,
  on: <K extends keyof IpcMainEventChannels>(
    channel: K,
    listener: RendererEventListener<K>
  ): (() => void) => {
    const subscription = (event: IpcRendererEvent, ...args: unknown[]): void => {
      listener(event, ...(args as IpcMainEventChannels[K]))
    }
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  once: <K extends keyof IpcMainEventChannels>(
    channel: K,
    listener: RendererEventListener<K>
  ): (() => void) => {
    const subscription = (event: IpcRendererEvent, ...args: unknown[]): void => {
      listener(event, ...(args as IpcMainEventChannels[K]))
    }
    ipcRenderer.once(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  removeAllListeners: (channel: keyof IpcMainEventChannels | string): void => {
    ipcRenderer.removeAllListeners(channel as string)
  }
}

const shellAPI = {
  openExternal: (url: string) => invoke('annotamd::shell::open-external', url),
  getLinkMetadata: (url: string) => invoke('annotamd::shell::get-link-metadata', url),
  showItemInFolder: (fullPath: string) => send('annotamd::shell::show-item', fullPath),
  openPath: (fullPath: string) => invoke('annotamd::shell::open-path', fullPath)
}

const clipboardAPI = {
  writeText: (text: string) => send('annotamd::clipboard::write-text', text),
  writeImage: (dataUrl: string) => send('annotamd::clipboard::write-image', dataUrl),
  readText: () => invoke('annotamd::clipboard::read-text'),
  guessFilePath: () => invoke('annotamd::clipboard::guess-file-path')
}

const webFrameAPI = {
  setZoomFactor: (factor: number): void => {
    if (typeof factor === 'number' && factor > 0) webFrame.setZoomFactor(factor)
  },
  setZoomLevel: (level: number): void => {
    if (typeof level === 'number') webFrame.setZoomLevel(level)
  }
}

const webUtilsAPI = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

const windowControlAPI = {
  minimize: () => send('annotamd::win::minimize'),
  maximize: () => send('annotamd::win::maximize'),
  unmaximize: () => send('annotamd::win::unmaximize'),
  toggleMaximize: () => send('annotamd::win::toggle-maximize'),
  close: () => send('annotamd::win::close'),
  setFullScreen: (flag: boolean) => send('annotamd::win::set-fullscreen', flag),
  toggleFullScreen: () => send('annotamd::win::toggle-fullscreen'),
  isMaximized: () => invoke('annotamd::win::is-maximized'),
  isFullScreen: () => invoke('annotamd::win::is-fullscreen'),
  popupMenu: (template: unknown, position?: { x: number; y: number }) =>
    send('annotamd::menu::popup', template as never, position),
  popupApplicationMenu: (position?: { x: number; y: number }) =>
    send('annotamd::menu::popup-application', position)
}

// These three predicates are pure path-string operations: implementing them
// in the preload keeps them synchronous so existing call sites like
// `tabs.find(t => isSamePathSync(t.pathname, ...))` keep returning the right
// item instead of a truthy Promise.
const MARKDOWN_EXTENSIONS = [
  'markdown',
  'mdown',
  'mkdn',
  'md',
  'mkd',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mdx',
  'text',
  'txt'
] as const

const hasMarkdownExtension = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false
  return MARKDOWN_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(`.${ext}`))
}

const isChildOfDirectory = (dir: string, child: string): boolean => {
  if (!dir || !child) return false
  const relative = pathe.relative(dir, child)
  return !!relative && !relative.startsWith('..') && !pathe.isAbsolute(relative)
}

const isSamePathSync = (pathA: string, pathB: string, isNormalized: boolean = false): boolean => {
  if (!pathA || !pathB) return false
  const a = isNormalized ? pathA : pathe.normalize(pathA)
  const b = isNormalized ? pathB : pathe.normalize(pathB)
  if (a.length !== b.length) return false
  if (a === b) return true
  if (a.toLowerCase() === b.toLowerCase()) {
    // Case-insensitive filesystem fallback — block briefly on a sync IPC
    // because callers (tab matching) need a boolean answer right now.
    try {
      return ipcRenderer.sendSync('annotamd::paths::is-same-sync', a, b)
    } catch {
      return false
    }
  }
  return false
}

const fileUtilsAPI = {
  isFile: (p: string) => invoke('annotamd::fs::is-file', p),
  isDirectory: (p: string) => invoke('annotamd::fs::is-directory', p),
  emptyDir: (p: string) => invoke('annotamd::fs::empty-dir', p),
  copy: (src: string, dest: string) => invoke('annotamd::fs::copy', src, dest),
  ensureDir: (p: string) => invoke('annotamd::fs::ensure-dir', p),
  outputFile: (p: string, data: string | Uint8Array) => invoke('annotamd::fs::output-file', p, data),
  move: (src: string, dest: string) => invoke('annotamd::fs::move', src, dest),
  stat: (p: string) => invoke('annotamd::fs::stat', p),
  writeFile: (p: string, data: string | Uint8Array) => invoke('annotamd::fs::write-file', p, data),
  readFile: (p: string, encoding?: string) => invoke('annotamd::fs::read-file', p, encoding),
  pathExists: (p: string) => invoke('annotamd::fs::path-exists', p),
  unlink: (p: string) => invoke('annotamd::fs::unlink', p),
  readdir: (p: string) => invoke('annotamd::fs::readdir', p),
  isExecutable: (p: string) => invoke('annotamd::fs::is-executable', p),
  // Pure-string predicates — synchronous, no IPC for the common case.
  isChildOfDirectory,
  hasMarkdownExtension,
  isSamePathSync,
  // isImageFile needs an fs.statSync; keep it async via IPC.
  isImageFile: (p: string) => invoke('annotamd::paths::is-image', p),
  MARKDOWN_INCLUSIONS: bootInfo?.MARKDOWN_INCLUSIONS || []
}

const commandAPI = {
  exists: (name: string) => invoke('annotamd::cmd::exists', name)
}

const i18nAPI = {
  loadTranslations: (language: string) => invoke('annotamd::i18n::load', language)
}

type RipgrepHandler = (payload: unknown) => void
const ripgrepAPI = {
  start: (req: unknown) => invoke('annotamd::rg::start', req),
  cancel: (searchId: string) => send('annotamd::rg::cancel', searchId),
  onMatch: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('annotamd::rg::match', sub)
    return () => ipcRenderer.removeListener('annotamd::rg::match', sub)
  },
  onProgress: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('annotamd::rg::progress', sub)
    return () => ipcRenderer.removeListener('annotamd::rg::progress', sub)
  },
  onDone: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('annotamd::rg::done', sub)
    return () => ipcRenderer.removeListener('annotamd::rg::done', sub)
  },
  onError: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('annotamd::rg::error', sub)
    return () => ipcRenderer.removeListener('annotamd::rg::error', sub)
  },
  onCancelled: (handler: RipgrepHandler) => {
    const sub = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
    ipcRenderer.on('annotamd::rg::cancelled', sub)
    return () => ipcRenderer.removeListener('annotamd::rg::cancelled', sub)
  }
}

const uploaderAPI = {
  uploadImage: (req: unknown) => invoke('annotamd::uploader::upload', req)
}

const fontsAPI = {
  list: () => invoke('annotamd::fonts::list')
}

const electronAPI = {
  ipcRenderer: ipcWrapper,
  shell: shellAPI,
  clipboard: clipboardAPI,
  webFrame: webFrameAPI,
  webUtils: webUtilsAPI,
  process: {
    platform: bootInfo?.platform || process.platform,
    arch: bootInfo?.arch,
    versions: bootInfo?.versions || {},
    env: bootInfo?.env || {},
    resourcesPath: bootInfo?.paths?.resources,
    cwd: bootInfo?.paths?.cwd
  },
  paths: bootInfo?.paths || {},
  isUpdatable: !!bootInfo?.isUpdatable,
  windowControl: windowControlAPI
}

// Expose a Node-`path`-compatible API to the renderer. `pathe` is a
// cross-platform reimplementation that always uses `/` separators and works
// inside a sandboxed renderer.
const pathAPI = {
  basename: (...args: Parameters<typeof pathe.basename>) => pathe.basename(...args),
  dirname: (...args: Parameters<typeof pathe.dirname>) => pathe.dirname(...args),
  extname: (...args: Parameters<typeof pathe.extname>) => pathe.extname(...args),
  join: (...args: string[]) => pathe.join(...args),
  resolve: (...args: string[]) => pathe.resolve(...args),
  relative: (...args: Parameters<typeof pathe.relative>) => pathe.relative(...args),
  isAbsolute: (...args: Parameters<typeof pathe.isAbsolute>) => pathe.isAbsolute(...args),
  normalize: (...args: Parameters<typeof pathe.normalize>) => pathe.normalize(...args),
  parse: (...args: Parameters<typeof pathe.parse>) => pathe.parse(...args),
  format: (...args: Parameters<typeof pathe.format>) => pathe.format(...args),
  sep: pathe.sep,
  delimiter: pathe.delimiter
  // Note: `pathe.posix` / `pathe.win32` are intentionally not exposed.
  // Each contains a self-reference (`pathe.posix.posix === pathe.posix`),
  // which breaks structured cloning inside `contextBridge.exposeInMainWorld`.
  // No code in this repo reads `window.path.posix` / `window.path.win32`.
}

// Bundled third-party packages occasionally read `process.platform` at module
// load time (e.g. @hfelix/electron-localshortcut/src/utils.js). Expose a
// minimal browser-safe `process` global so those imports don't throw before
// the Vue app can mount.
const processShim = {
  platform: bootInfo?.platform || process.platform,
  arch: bootInfo?.arch,
  versions: bootInfo?.versions || {},
  env: bootInfo?.env || {},
  resourcesPath: bootInfo?.paths?.resources,
  cwd: () => bootInfo?.paths?.cwd,
  // Some libraries call `process.nextTick`; map it to the microtask queue.
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    Promise.resolve().then(() => fn(...args))
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('process', processShim)
  contextBridge.exposeInMainWorld('rgPath', bootInfo?.paths?.ripgrepBinary || '')
  contextBridge.exposeInMainWorld('fileUtils', fileUtilsAPI)
  contextBridge.exposeInMainWorld('path', pathAPI)
  contextBridge.exposeInMainWorld('commandExists', commandAPI)
  contextBridge.exposeInMainWorld('i18nUtils', i18nAPI)
  contextBridge.exposeInMainWorld('ripgrep', ripgrepAPI)
  contextBridge.exposeInMainWorld('uploader', uploaderAPI)
  contextBridge.exposeInMainWorld('fonts', fontsAPI)
} catch (error) {
  console.error(error)
}
