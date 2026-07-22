import { BrowserWindow, ipcMain, shell, clipboard, nativeImage } from 'electron'
import type { Session } from 'electron'
import log from 'electron-log'
import * as plist from 'plist'
import {
  extractPageMetadata,
  getPageMetadataFallbackRequest,
  getPageTitleFallback,
  isUsablePageTitle
} from '../utils/pageTitle'
import type { PageMetadata } from '../utils/pageTitle'

const PAGE_METADATA_FETCH_TIMEOUT_MS = 4000
const PAGE_METADATA_RENDER_TIMEOUT_MS = 8000
const PAGE_METADATA_RENDER_SETTLE_MS = 1800
const PAGE_METADATA_CACHE_TTL_MS = 10 * 60 * 1000
const PAGE_METADATA_CACHE_MAX_ENTRIES = 200
const MAX_PAGE_METADATA_HTML_BYTES = 2 * 1024 * 1024

const EMPTY_PAGE_METADATA: PageMetadata = { title: '', icon: '' }
const pageMetadataCache = new Map<string, { metadata: PageMetadata; expiresAt: number }>()

const isWebUrl = (rawUrl: string): boolean => {
  try {
    const { protocol } = new URL(rawUrl)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const needsRenderedMetadata = (rawUrl: string, metadata: PageMetadata): boolean => {
  if (!isUsablePageTitle(metadata.title, rawUrl)) return true
  try {
    return new URL(rawUrl).pathname !== '/' && metadata.title.length <= 12
  } catch {
    return false
  }
}

const fallbackIcon = (rawUrl: string): string => {
  try {
    return new URL('/favicon.ico', rawUrl).toString()
  } catch {
    return ''
  }
}

const fetchPageMetadata = async(
  targetSession: Session,
  rawUrl: string,
  userAgent = ''
): Promise<PageMetadata> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PAGE_METADATA_FETCH_TIMEOUT_MS)
  try {
    const response = await targetSession.fetch(rawUrl, {
      method: 'GET',
      headers: userAgent ? { 'User-Agent': userAgent } : undefined,
      signal: controller.signal
    })
    const contentType = response.headers.get('content-type') ?? ''
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (!response.ok || !/text\/html/i.test(contentType)) return EMPTY_PAGE_METADATA
    if (contentLength > MAX_PAGE_METADATA_HTML_BYTES) return EMPTY_PAGE_METADATA

    const html = await response.text()
    return extractPageMetadata(html.slice(0, MAX_PAGE_METADATA_HTML_BYTES), response.url || rawUrl)
  } catch {
    return EMPTY_PAGE_METADATA
  } finally {
    clearTimeout(timeout)
  }
}

const renderPageMetadata = async(targetSession: Session, rawUrl: string): Promise<PageMetadata> => {
  return await new Promise<PageMetadata>((resolve) => {
    const previewWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        session: targetSession,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })
    const { webContents } = previewWindow
    let title = getPageTitleFallback(rawUrl)
    let icon = ''
    let finishTimer: ReturnType<typeof setTimeout> | undefined
    let loaded = false
    let settled = false

    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (finishTimer) clearTimeout(finishTimer)
      if (!previewWindow.isDestroyed()) previewWindow.destroy()
      resolve(title ? { title, icon: icon || fallbackIcon(rawUrl) } : EMPTY_PAGE_METADATA)
    }
    const scheduleFinish = (): void => {
      if (!loaded || !title) return
      if (finishTimer) clearTimeout(finishTimer)
      finishTimer = setTimeout(finish, PAGE_METADATA_RENDER_SETTLE_MS)
    }
    const acceptTitle = (value: string): void => {
      const normalized = value.replace(/\s+/g, ' ').trim()
      if (!isUsablePageTitle(normalized, rawUrl)) return
      title = normalized
      scheduleFinish()
    }
    const blockUnsafeNavigation = (event: Electron.Event, url: string): void => {
      if (!isWebUrl(url)) event.preventDefault()
    }
    const timeout = setTimeout(finish, PAGE_METADATA_RENDER_TIMEOUT_MS)

    webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    webContents.on('will-navigate', blockUnsafeNavigation)
    webContents.on('will-redirect', blockUnsafeNavigation)
    webContents.on('page-title-updated', (event, value) => {
      event.preventDefault()
      acceptTitle(value)
    })
    webContents.on('page-favicon-updated', (_event, favicons) => {
      icon = favicons.find(isWebUrl) ?? icon
      scheduleFinish()
    })
    webContents.on('did-finish-load', () => {
      loaded = true
      acceptTitle(webContents.getTitle())
      scheduleFinish()
    })
    const userAgent = webContents.getUserAgent().replace(/\sElectron\/\S+/i, '')
    void previewWindow.loadURL(rawUrl, { userAgent }).catch(finish)
  })
}

const resolvePageMetadata = async(targetSession: Session, rawUrl: string): Promise<PageMetadata> => {
  if (!isWebUrl(rawUrl)) return EMPTY_PAGE_METADATA
  const cached = pageMetadataCache.get(rawUrl)
  if (cached && cached.expiresAt > Date.now()) return cached.metadata
  if (cached) pageMetadataCache.delete(rawUrl)

  const immediateTitle = getPageTitleFallback(rawUrl)
  if (immediateTitle) {
    const metadata = { title: immediateTitle, icon: fallbackIcon(rawUrl) }
    pageMetadataCache.set(rawUrl, {
      metadata,
      expiresAt: Date.now() + PAGE_METADATA_CACHE_TTL_MS
    })
    return metadata
  }

  let staticMetadata = await fetchPageMetadata(targetSession, rawUrl)
  if (needsRenderedMetadata(rawUrl, staticMetadata)) {
    const fallbackRequest = getPageMetadataFallbackRequest(rawUrl)
    if (fallbackRequest) {
      const fallbackMetadata = await fetchPageMetadata(
        targetSession,
        fallbackRequest.url,
        fallbackRequest.userAgent
      )
      if (fallbackMetadata.title) staticMetadata = fallbackMetadata
    }
  }
  let metadata: PageMetadata
  if (!needsRenderedMetadata(rawUrl, staticMetadata)) {
    metadata = {
      title: staticMetadata.title,
      icon: staticMetadata.icon || fallbackIcon(rawUrl)
    }
  } else {
    const renderedMetadata = await renderPageMetadata(targetSession, rawUrl)
    metadata = renderedMetadata.title
      ? {
          title: renderedMetadata.title,
          icon: renderedMetadata.icon || staticMetadata.icon || fallbackIcon(rawUrl)
        }
      : staticMetadata.title
        ? { title: staticMetadata.title, icon: staticMetadata.icon || fallbackIcon(rawUrl) }
        : EMPTY_PAGE_METADATA
  }

  if (metadata.title) {
    if (pageMetadataCache.size >= PAGE_METADATA_CACHE_MAX_ENTRIES) {
      const oldestKey = pageMetadataCache.keys().next().value
      if (oldestKey) pageMetadataCache.delete(oldestKey)
    }
    pageMetadataCache.set(rawUrl, {
      metadata,
      expiresAt: Date.now() + PAGE_METADATA_CACHE_TTL_MS
    })
  }
  return metadata
}

export const registerShellHandlers = (): void => {
  ipcMain.handle('annotamd::shell::open-external', async(_e, url: string) => {
    try {
      await shell.openExternal(url)
      return true
    } catch (err) {
      log.error('shell.openExternal failed:', err)
      return false
    }
  })
  ipcMain.on('annotamd::shell::open-external', (_e, url: string) => {
    shell.openExternal(url).catch((err) => log.error('shell.openExternal failed:', err))
  })
  ipcMain.on('annotamd::shell::show-item', (_e, fullPath: string) => {
    try {
      shell.showItemInFolder(fullPath)
    } catch (err) {
      log.error('shell.showItemInFolder failed:', err)
    }
  })
  ipcMain.handle('annotamd::shell::open-path', async(_e, fullPath: string) => {
    try {
      return await shell.openPath(fullPath)
    } catch (err) {
      log.error('shell.openPath failed:', err)
      return String(err instanceof Error ? err.message : err)
    }
  })
  ipcMain.handle('annotamd::shell::get-link-metadata', async(event, rawUrl: string) => {
    try {
      return await resolvePageMetadata(event.sender.session, rawUrl)
    } catch (err) {
      log.warn('shell.getLinkMetadata failed:', err)
      return EMPTY_PAGE_METADATA
    }
  })

  ipcMain.on('annotamd::clipboard::write-text', (_e, text: string) => {
    try {
      clipboard.writeText(text)
    } catch (err) {
      log.error('clipboard.writeText failed:', err)
    }
  })
  ipcMain.on('annotamd::clipboard::write-image', (_e, dataUrl: string) => {
    try {
      const image = nativeImage.createFromDataURL(dataUrl)
      if (!image.isEmpty()) clipboard.writeImage(image)
    } catch (err) {
      log.error('clipboard.writeImage failed:', err)
    }
  })
  ipcMain.handle('annotamd::clipboard::read-text', () => {
    try {
      return clipboard.readText()
    } catch {
      return ''
    }
  })

  ipcMain.handle('annotamd::clipboard::guess-file-path', () => {
    try {
      if (process.platform === 'darwin') {
        if (clipboard.has('NSFilenamesPboardType')) {
          const parsed = plist.parse(clipboard.read('NSFilenamesPboardType'))
          return Array.isArray(parsed) && parsed.length ? parsed[0] : ''
        }
        return ''
      }
      if (process.platform === 'win32') {
        const raw = clipboard.read('FileNameW')
        const filePath = raw ? raw.replace(new RegExp(String.fromCharCode(0), 'g'), '') : ''
        return typeof filePath === 'string' ? filePath : ''
      }
      return ''
    } catch (err) {
      log.error('clipboard.guess-file-path failed:', err)
      return ''
    }
  })
}
