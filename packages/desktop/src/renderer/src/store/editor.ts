import { getRootFolderFromState, adjustTrailingNewlines, createApplicationMenuState, createSelectionFormatState, createBufferedEditorState } from './editorStateHelpers'
export { createSelectionFormatState } from './editorStateHelpers'
import equal from 'deep-equal'
import bus from '../bus'
import { getUniqueId, deepClone } from '../util'
import listToTree, { type ListItem, type TreeNode } from '../util/listToTree'
import {
  createDocumentState,
  getOptionsFromState,
  getBlankFileState,
  defaultFileState
} from './help'
import notice from '../services/notification'
import {
  FileEncodingCommand,
  LineEndingCommand,
  QuickOpenCommand,
  TrailingNewlineCommand
} from '../commands'
import { defineStore } from 'pinia'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import { useLayoutStore } from './layout'
import { useMainStore } from '.'
import { t } from '../i18n'
import { debouncedSendBufferedState, sendBufferedState } from './bufferedState'
import { listenForEditorBootstrap } from '../editorBootstrap'
import type {
  IFileState,
  FileNotification,
  LineEnding,
  MarkdownDocument,
  PageOptions,
  TabOptions
} from '@shared/types/files'

// ----------------------------------------------------------------------------
// Local helper types
// ----------------------------------------------------------------------------

interface TocItem extends ListItem {
  slug?: string
  githubSlug?: string
  content?: string
  lvl: number | null
}

type TocTreeNode = TreeNode<TocItem>

export interface RestoreWarning {
  tabId?: string | null
  pathname?: string
  msg: string
  showConfirm?: boolean
  style?: string
  exclusiveType?: string
}

interface PushTabNotificationPayload {
  tabId: string
  msg: string
  showConfirm?: boolean
  style?: string
  exclusiveType?: string
  action?: FileNotification['action']
}

interface FileChangePayload {
  pathname: string
  data: {
    isMixedLineEndings?: boolean
    lineEnding?: LineEnding | string
    adjustLineEndingOnSave?: boolean
    trimTrailingNewline?: number
    encoding?: IFileState['encoding']
    markdown: string
    filename: string
  }
}

interface FormatLinkClickPayload {
  // muya's getLinkInfo yields `href: null` when the rendered link carries no
  // usable href (e.g. an unsupported protocol stripped by sanitizeHyperlink).
  data: { href: string | null; [key: string]: unknown }
  dirname: string
}

interface ExportPayload {
  type: string
  content?: string
  pageOptions?: PageOptions
}

interface AutoSavePayload {
  id: string
  filename: string
  pathname: string
  markdown: string
  options: ReturnType<typeof getOptionsFromState>
}

interface ContentChangePayload {
  id: string
  markdown: string
  wordCount?: IFileState['wordCount']
  cursor?: unknown
  muyaIndexCursor?: unknown
  history?: IFileState['history']
  toc?: TocItem[]
  blocks?: unknown
}

interface DerivedDocumentStatePayload {
  id: string
  markdown: string
  wordCount: IFileState['wordCount']
  toc?: TocItem[]
}

export interface AffiliationEntry {
  type: string
  functionType?: string
  listType?: string
  listItemType?: string
  isLooseListItem?: boolean
  [key: string]: unknown
}

export interface SelectionChange {
  start: { key: string; offset: number; block?: { text?: string; functionType?: string }; type?: string }
  end: { key: string; offset: number; block?: { functionType?: string }; type?: string }
  affiliation?: AffiliationEntry[]
  hasFrontMatter?: boolean
}

export interface SelectionFormat {
  type: string
  [key: string]: unknown
}

export interface ProjectStoreLike {
  projectTree: { pathname?: string } | null
}

// ----------------------------------------------------------------------------
// State shape
// ----------------------------------------------------------------------------

export interface EditorState {
  currentFile: IFileState | null
  tabs: IFileState[]
  tabIdToIndex: Record<string, number>
  listToc: TocItem[]
  toc: TocTreeNode[]
}

const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const AUTO_SAVE_DELAY = 1000

const clearMissingOnDiskState = (tab: IFileState): void => {
  tab.isMissingOnDisk = false
  const notificationIndex = tab.notifications.findIndex(
    (notification) => notification.exclusiveType === 'file_changed'
  )
  if (notificationIndex >= 0) {
    tab.notifications.splice(notificationIndex, 1)
  }
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    currentFile: null,
    tabs: [],
    tabIdToIndex: {},
    listToc: [], // Used for equal check and for searching for the correct github-slug to jump to
    toc: []
  }),

  actions: {
    updateTabIdToIndex(): void {
      this.tabIdToIndex = this.tabs.reduce<Record<string, number>>((map, tab, index) => {
        map[tab.id] = index
        return map
      }, {})
    },

    CREATE_BUFFERED_STATE(): ReturnType<typeof createBufferedEditorState> {
      return createBufferedEditorState(this.$state)
    },

    RESTORE_BUFFERED_STATE(state: unknown): void {
      const rawState = state as { editor?: unknown; project?: unknown; layout?: unknown } | null
      const editorInput = rawState?.editor ?? state
      const bufferedEditorState = createBufferedEditorState(editorInput)
      if (!bufferedEditorState) {
        console.error('RESTORE_BUFFERED_STATE: Invalid editor buffer state.')
        return
      }

      const oldIdToNewId: Record<string, string> = {}
      const tabs: IFileState[] = bufferedEditorState.tabs.map((tab) => {
        const fileState = createDocumentState(tab as unknown as Record<string, unknown>)
        oldIdToNewId[tab.id] = fileState.id
        return fileState
      })

      const currentFileId = bufferedEditorState.currentFileId
        ? oldIdToNewId[bufferedEditorState.currentFileId]
        : undefined
      const currentFile: IFileState | null = tabs.find((tab) => tab.id === currentFileId) ?? null

      const projectStore = useProjectStore()
      const layoutStore = useLayoutStore()

      projectStore.RESTORE_BUFFERED_STATE(rawState?.project)
      layoutStore.RESTORE_BUFFERED_STATE(rawState?.layout)
      this.$patch((s) => {
        s.tabs = tabs
        s.currentFile = currentFile
        s.tabIdToIndex = {}
        s.listToc = []
        s.toc = []
      })

      this.updateTabIdToIndex()
      window.DIRNAME = currentFile?.pathname ? window.path.dirname(currentFile.pathname) : ''
      this.UPDATE_LINE_ENDING_MENU()

      for (const warning of bufferedEditorState.restoreWarnings) {
        const restoredTabId = warning.tabId ? oldIdToNewId[warning.tabId] : null
        const tab = restoredTabId
          ? this.tabs.find((t) => t.id === restoredTabId)
          : this.tabs.find((t) =>
            window.fileUtils.isSamePathSync(t.pathname, warning.pathname ?? '')
          )

        if (!tab) continue

        this.pushTabNotification({
          tabId: tab.id,
          msg: warning.msg,
          showConfirm: warning.showConfirm,
          style: warning.style,
          exclusiveType: warning.exclusiveType
        })
      }
    },

    /**
     * Copies the specified heading's github-slug to the clipboard.
     * @param key The heading-id to copy.
     */
    copyGithubSlug(key: string): void {
      const item = this.listToc.find((i) => i.slug === key)

      if (item) {
        window.electron.clipboard.writeText(`#${item.githubSlug}`)
        notice.notify({
          title: t('store.editor.anchorLinkCopied'),
          type: 'primary',
          time: 2000,
          showConfirm: false
        })
      } else {
        console.warn(t('store.editor.tocItemNotFound', { key }))
      }
    },

    /**
     * Update scroll position for the currentFile
     */
    updateScrollPosition(id: string, scrollTop: number): void {
      if (!(id in this.tabIdToIndex)) {
        console.warn('updateScrollPosition: Cannot find tab index for id:', id)
        return
      }

      const tab = this.tabs[this.tabIdToIndex[id]]
      if (tab) {
        tab.scrollTop = scrollTop
      }
      debouncedSendBufferedState()
    },

    /**
     * Push a tab specific notification on stack that never disappears.
     */
    pushTabNotification(data: PushTabNotificationPayload): void {
      const defaultAction: FileNotification['action'] = () => {}
      const { tabId, msg } = data
      const action = data.action || defaultAction
      const showConfirm = data.showConfirm || false
      const style = data.style || 'info'
      // Whether only one notification should exist.
      const exclusiveType = data.exclusiveType || ''

      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) {
        console.error(t('store.editor.tabNotFound'))
        return
      }

      const { notifications } = tab

      // Remove the old notification if only one should exist.
      if (exclusiveType) {
        const index = notifications.findIndex((n) => n.exclusiveType === exclusiveType)
        if (index >= 0) {
          // Reorder current notification
          notifications.splice(index, 1)
        }
      }

      // Push new notification on stack.
      notifications.push({
        msg,
        showConfirm,
        style,
        exclusiveType,
        action
      })
    },

    loadChange(change: FileChangePayload): void {
      const { tabs, currentFile } = this
      const { data, pathname } = change
      const {
        isMixedLineEndings,
        lineEnding,
        adjustLineEndingOnSave,
        trimTrailingNewline,
        encoding,
        markdown,
        filename
      } = data
      // Create a new document and update few entires later.
      const newFileState = createDocumentState({
        markdown,
        filename,
        pathname,
        encoding,
        lineEnding,
        adjustLineEndingOnSave,
        trimTrailingNewline
      })

      const tab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
      if (!tab) {
        // The tab may be closed in the meanwhile.
        console.error('loadChange: Cannot find tab in tab list.')
        notice.notify({
          title: t('store.editor.errorLoadingTabTitle'),
          message: t('store.editor.errorLoadingTabMessage'),
          type: 'error',
          time: 20000,
          showConfirm: false
        })
        return
      }

      // Backup few entries that we need to restore later.
      const oldId = tab.id
      const oldNotifications = tab.notifications
      // Preserve scroll across external reload so the editor stays put.
      const oldScrollTop = tab.scrollTop
      let oldHistory: IFileState['history'] | null = null
      const histIndex = tab.history.index
      if (histIndex >= 0 && tab.history.stack.length >= 1) {
        const entry = tab.history.stack[histIndex]
        if (entry) {
          // Allow to restore the old document.
          oldHistory = {
            stack: [entry],
            index: 0
          }
        }

        // Free reference from array
        tab.history.index--
        tab.history.stack.pop()
      }

      // Update file content and restore some entries.
      Object.assign(tab, newFileState)
      tab.id = oldId
      tab.notifications = oldNotifications
      clearMissingOnDiskState(tab)
      tab.scrollTop = oldScrollTop
      if (oldHistory) {
        tab.history = oldHistory
      }

      if (isMixedLineEndings && typeof lineEnding === 'string') {
        this.pushTabNotification({
          tabId: tab.id,
          msg: t('store.editor.mixedLineEndingsNormalized', {
            name: filename,
            lineEnding: lineEnding.toUpperCase()
          }),
          showConfirm: false,
          style: 'info',
          exclusiveType: ''
        })
      }

      // Reload the editor if the tab is currently opened.
      if (currentFile && pathname === currentFile.pathname) {
        // save current state first
        this.currentFile = tab
        const { id, cursor, history, scrollTop, muyaIndexCursor } = tab // Should not use blocks history as this is loaded from disk
        bus.emit('file-changed', {
          id,
          markdown,
          muyaIndexCursor,
          cursor,
          renderCursor: true,
          history,
          scrollTop,
          // External disk reload: the engine handler records the new content as a
          // single invertible undo boundary (replaceContent) instead of clearing
          // history (setContent), so the first undo restores the pre-reload doc.
          isReload: true
        })
      }
      debouncedSendBufferedState()
    },

    FORMAT_LINK_CLICK({ data, dirname }: FormatLinkClickPayload): void {
      // Check if the link starts with a #, that is a local anchor link.
      if (data.href && data.href[0] === '#') {
        const anchorSlug = data.href.substring(1)
        if (!anchorSlug) return

        // Find the block with the anchor slug from the TOC
        for (const item of this.listToc) {
          if (item.githubSlug === anchorSlug) {
            // Scroll to the corresponding element that matches this github-slug
            bus.emit('scroll-to-header', item.slug)
            return
          }
        }

        // Fall back to a non-heading target: a custom `<a id="...">` (or any
        // element with a matching id) rendered in the document.
        const anchorElement = document.getElementById(anchorSlug)
        if (anchorElement) {
          bus.emit('scroll-to-anchor-element', anchorElement)
        }

        return
      }

      window.electron.ipcRenderer.send('annotamd::format-link-click', { data, dirname })
    },

    LISTEN_SCREEN_SHOT(): void {
      window.electron.ipcRenderer.on('annotamd::screenshot-captured', (_, filePath) => {
        bus.emit('screenshot-captured', filePath)
      })
    },

    // image path auto complement
    ASK_FOR_IMAGE_AUTO_PATH(src: string): Promise<string[]> {
      if (!this.currentFile) return Promise.resolve([])
      const { pathname } = this.currentFile
      if (pathname) {
        let rs: (value: string[]) => void = () => {}
        const promise = new Promise<string[]>((resolve) => {
          rs = resolve
        })
        const id = getUniqueId()
        // Dynamic IPC channel — not part of the static IpcMainEventChannels contract.
        ;(
          window.electron.ipcRenderer.once as (
            channel: string,
            listener: (event: unknown, files: string[]) => void
          ) => void
        )(`annotamd::response-of-image-path-${id}`, (_: unknown, files: string[]) => {
          rs(files)
        })
        window.electron.ipcRenderer.send('annotamd::ask-for-image-auto-path', {
          pathname,
          src,
          id,
          currentFile: deepClone(this.currentFile)
        })
        return promise
      } else {
        return Promise.resolve([])
      }
    },

    SEARCH(value: IFileState['searchMatches']): void {
      if (!this.currentFile) return
      this.currentFile.searchMatches = deepClone(value) // deep clone to trigger state changes
    },

    SHOW_IMAGE_DELETION_URL(deletionUrl: string): void {
      notice
        .notify({
          title: t('store.editor.imageDeletionUrlTitle'),
          message: t('store.editor.imageDeletionUrlMessage', { url: deletionUrl }),
          showConfirm: true,
          time: 20000
        })
        .then(() => {
          window.electron.clipboard.writeText(deletionUrl)
        })
    },

    // We need to update line endings menu when changing tabs.
    UPDATE_LINE_ENDING_MENU(): void {
      if (!this.currentFile) return
      const { lineEnding } = this.currentFile
      if (lineEnding) {
        const { windowId } = window.annotamd?.env ?? { windowId: -1 }
        window.electron.ipcRenderer.send(
          'annotamd::update-line-ending-menu',
          windowId,
          lineEnding as LineEnding
        )
      }
    },

    // Flush any edit still queued in the engine's rAF batch into the active
    // tab's `currentFile` before its markdown is read to persist — otherwise an
    // edit made in the same frame as the read is silently dropped from the
    // written file (#3803), the way tab switching already guards (#2938). Safe
    // no-op when nothing is pending.
    flushActiveEditor(): void {
      bus.emit('flush-active-editor')
    },

    FILE_SAVE(): void {
      if (!this.currentFile) return
      this.flushActiveEditor()
      const projectStore = useProjectStore()
      const { id, filename, pathname, markdown } = this.currentFile
      const options = getOptionsFromState(this.currentFile)
      const defaultPath = getRootFolderFromState(projectStore)
      if (id) {
        window.electron.ipcRenderer.send(
          'annotamd::response-file-save',
          id,
          filename,
          pathname,
          markdown,
          deepClone(options),
          defaultPath
        )
      }
    },

    SAVE_CURRENT_FOR_AGENT(): Promise<boolean> {
      this.flushActiveEditor()
      const file = this.currentFile
      if (!file?.id || !file.pathname || file.isMissingOnDisk) return Promise.resolve(false)
      if (file.isSaved) return Promise.resolve(true)

      return new Promise((resolve) => {
        let settled = false
        const finish = (saved: boolean): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          stopSaved()
          stopFailed()
          resolve(saved)
        }
        const stopSaved = window.electron.ipcRenderer.on(
          'annotamd::tab-saved',
          (_event, tabId) => {
            if (tabId === file.id) finish(true)
          }
        )
        const stopFailed = window.electron.ipcRenderer.on(
          'annotamd::tab-save-failure',
          (_event, tabId) => {
            if (tabId === file.id) finish(false)
          }
        )
        const timer = setTimeout(() => finish(false), 15000)
        this.FILE_SAVE()
      })
    },

    // need pass some data to main process when `save` menu item clicked
    LISTEN_FOR_SAVE(): void {
      window.electron.ipcRenderer.on('annotamd::editor-ask-file-save', () => {
        this.FILE_SAVE()
      })
      bus.on('annotamd::editor-ask-file-save', () => {
        this.FILE_SAVE()
      })
    },

    FILE_SAVE_AS(): void {
      if (!this.currentFile) return
      this.flushActiveEditor()
      const projectStore = useProjectStore()
      const { id, filename, pathname, markdown } = this.currentFile
      const options = getOptionsFromState(this.currentFile)
      const defaultPath = getRootFolderFromState(projectStore)

      if (id) {
        window.electron.ipcRenderer.send(
          'annotamd::response-file-save-as',
          id,
          filename,
          pathname,
          markdown,
          deepClone(options),
          defaultPath
        )
      }
    },

    // need pass some data to main process when `save as` menu item clicked
    LISTEN_FOR_SAVE_AS(): void {
      window.electron.ipcRenderer.on('annotamd::editor-ask-file-save-as', () => {
        this.FILE_SAVE_AS()
      })
      bus.on('annotamd::editor-ask-file-save-as', () => {
        this.FILE_SAVE_AS()
      })
    },

    LISTEN_FOR_SET_PATHNAME(): void {
      window.electron.ipcRenderer.on('annotamd::set-pathname', (_, fileInfo) => {
        const { tabs } = this
        const { pathname, id } = fileInfo
        const tab = tabs.find((f) => f.id === id)
        if (!tab) {
          console.error('[ERROR] Cannot change file path from unknown tab.')
          return
        }

        // If a tab with the same file path already exists we need to close the tab.
        // The existing tab is overwritten by this tab.
        const existingTab = tabs.find(
          (t) => t.id !== id && window.fileUtils.isSamePathSync(t.pathname, pathname)
        )
        if (existingTab) {
          this.CLOSE_TAB(existingTab)
        }

        // SET_PATHNAME
        const { filename } = fileInfo
        if (id === this.currentFile?.id && pathname) {
          window.DIRNAME = window.path.dirname(pathname)
        }
        if (tab) {
          Object.assign(tab, { filename, pathname, isSaved: true })
          clearMissingOnDiskState(tab)
          debouncedSendBufferedState()
        }
      })

      window.electron.ipcRenderer.on('annotamd::tab-saved', (_, tabId) => {
        const tab = this.tabs.find((f) => f.id === tabId)
        if (tab) {
          const lastEditIndex = tab.history.lastEditIndex
          if (
            typeof lastEditIndex === 'number' &&
            lastEditIndex >= 0 &&
            lastEditIndex < tab.history.stack.length
          ) {
            const entry = tab.history.stack[lastEditIndex]
            if (entry && typeof entry.id === 'number') {
              tab.lastSavedHistoryId = entry.id
            }
          }
          tab.isSaved = true
          clearMissingOnDiskState(tab)
          debouncedSendBufferedState()
        }
      })

      window.electron.ipcRenderer.on('annotamd::tab-save-failure', (_, tabId, msg) => {
        const tab = this.tabs.find((t) => t.id === tabId)
        if (!tab) {
          notice.notify({
            title: t('dialog.saveFailure'),
            message: msg,
            type: 'error',
            time: 20000,
            showConfirm: false
          })
          return
        }

        tab.isSaved = false
        this.pushTabNotification({
          tabId,
          msg: t('store.editor.errorWhileSaving', { msg }),
          style: 'crit'
        })
        debouncedSendBufferedState()
      })
    },

    LISTEN_FOR_CLOSE(): void {
      const projectStore = useProjectStore()
      const preferencesStore = usePreferencesStore()
      window.electron.ipcRenderer.on('annotamd::ask-for-close', () => {
        sendBufferedState()
          .catch((err) => {
            console.error('Failed to update buffered state before closing', err)
          })
          .then(() => {
            const unsavedFiles = this.tabs
              .filter((file) => !file.isSaved)
              .map((file) => {
                const { id, filename, pathname, markdown } = file
                const options = getOptionsFromState(file)
                return {
                  id,
                  filename,
                  pathname,
                  markdown,
                  options,
                  defaultPath: getRootFolderFromState(projectStore)
                }
              })

            if (unsavedFiles.length && preferencesStore.startUpAction !== 'restoreAll') {
              // Ignore unsaved files when user has chosen to restore all on startup, as they will be restored anyway.
              window.electron.ipcRenderer.send('annotamd::close-window-confirm', deepClone(unsavedFiles))
            } else {
              window.electron.ipcRenderer.send('annotamd::close-window')
            }
          })
      })
    },

    LISTEN_FOR_SAVE_CLOSE(): void {
      window.electron.ipcRenderer.on('annotamd::force-close-tabs-by-id', (_, tabIdList) => {
        if (Array.isArray(tabIdList) && tabIdList.length) {
          this.CLOSE_TABS(tabIdList)
        }
      })
    },

    ASK_FOR_SAVE_ALL(closeTabs: boolean): void {
      const { tabs } = this
      const projectStore = useProjectStore()
      const unsavedFiles = tabs
        .filter((file) => !(file.isSaved && /[^\n]/.test(file.markdown)))
        .map((file) => {
          const { id, filename, pathname, markdown } = file
          const options = getOptionsFromState(file)
          return {
            id,
            filename,
            pathname,
            markdown,
            options,
            defaultPath: getRootFolderFromState(projectStore)
          }
        })

      if (closeTabs) {
        if (unsavedFiles.length) {
          this.CLOSE_TABS(tabs.filter((f) => f.isSaved).map((f) => f.id))
          window.electron.ipcRenderer.send('annotamd::save-and-close-tabs', deepClone(unsavedFiles))
        } else {
          this.CLOSE_TABS(tabs.map((f) => f.id))
        }
      } else {
        window.electron.ipcRenderer.send('annotamd::save-tabs', deepClone(unsavedFiles))
      }
    },

    MOVE_FILE_TO(): void {
      if (!this.currentFile) return
      this.flushActiveEditor()
      const projectStore = useProjectStore()
      const { id, filename, pathname, markdown } = this.currentFile
      const options = getOptionsFromState(this.currentFile)
      const defaultPath = getRootFolderFromState(projectStore)
      if (!id) return
      if (!pathname) {
        // if current file is a newly created file, just save it!
        window.electron.ipcRenderer.send(
          'annotamd::response-file-save',
          id,
          filename,
          pathname,
          markdown,
          deepClone(options),
          defaultPath
        )
      } else {
        // if not, move to a new(maybe) folder
        window.electron.ipcRenderer.send('annotamd::response-file-move-to', { id, pathname })
      }
    },

    LISTEN_FOR_MOVE_TO(): void {
      window.electron.ipcRenderer.on('annotamd::editor-move-file', () => {
        this.MOVE_FILE_TO()
      })
      bus.on('annotamd::editor-move-file', () => {
        this.MOVE_FILE_TO()
      })
    },

    LISTEN_FOR_RENAME(): void {
      window.electron.ipcRenderer.on('annotamd::editor-rename-file', () => {
        this.RESPONSE_FOR_RENAME()
      })
      bus.on('annotamd::editor-rename-file', () => {
        this.RESPONSE_FOR_RENAME()
      })
    },

    RESPONSE_FOR_RENAME(): void {
      if (!this.currentFile) return
      this.flushActiveEditor()
      const projectStore = useProjectStore()
      const { id, filename, pathname, markdown } = this.currentFile
      const options = getOptionsFromState(this.currentFile)
      const defaultPath = getRootFolderFromState(projectStore)
      if (!id) return
      if (!pathname) {
        // if current file is a newly created file, just save it!
        window.electron.ipcRenderer.send(
          'annotamd::response-file-save',
          id,
          filename,
          pathname,
          markdown,
          deepClone(options),
          defaultPath
        )
      } else {
        bus.emit('rename')
      }
    },

    // ask for main process to rename this file to a new name `newFilename`
    RENAME(newFilename: string): void {
      if (!this.currentFile) return
      const { id, pathname, filename } = this.currentFile
      if (typeof filename === 'string' && filename !== newFilename) {
        const newPathname = window.path.join(window.path.dirname(pathname), newFilename)
        window.electron.ipcRenderer.send('annotamd::rename', {
          id,
          pathname,
          newPathname,
          currentFile: deepClone(this.currentFile)
        })
      }
    },

    /**
     * Update the pathname/filename of any tab whose pathname matches `src`.
     * Invoked from the sidebar rename flow (project.ts:RENAME_IN_SIDEBAR).
     */
    RENAME_IF_NEEDED({ src, dest }: { src: string; dest: string }): void {
      this.tabs.forEach((tab) => {
        if (tab.pathname === src) {
          tab.pathname = dest
          tab.filename = window.path.basename(dest)
        }
      })
      // Keep DIRNAME in sync when the active tab is the one being renamed,
      // so link resolution / dirname-based lookups don't keep using the old
      // folder until the user switches tabs.
      if (this.currentFile != null && this.currentFile.pathname === dest) {
        window.DIRNAME = window.path.dirname(dest)
      }
      debouncedSendBufferedState()
    },

    UPDATE_CURRENT_FILE(currentFile: IFileState, emitFileChanged = true): void {
      const oldCurrentFile = this.currentFile
      let didUpdateCurrentFile = false
      if (oldCurrentFile == null || oldCurrentFile.id !== currentFile.id) {
        const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor } =
          currentFile
        // Must run while `currentFile` still points at the outgoing tab, so its
        // flushed edit is attributed to that tab and not lost on switch (#2938).
        if (oldCurrentFile) {
          this.flushActiveEditor()
        }
        window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
        this.currentFile = currentFile
        didUpdateCurrentFile = true

        if (!this.tabs.some((file) => file.id === currentFile.id)) {
          this.tabs.push(currentFile)
          this.updateTabIdToIndex()
        }

        if (emitFileChanged) {
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            blocks
          })
        }
      }

      this.UPDATE_LINE_ENDING_MENU()
      if (didUpdateCurrentFile) {
        debouncedSendBufferedState()
      }
    },

    // This events are only used during window creation.
    LISTEN_FOR_BOOTSTRAP_WINDOW(): void {
      const preferencesStore = usePreferencesStore()
      const layoutStore = useLayoutStore()
      const projectStore = useProjectStore()
      const mainStore = useMainStore()

      // Delay load runtime commands and initialize commands.
      setTimeout(() => {
        bus.emit('cmd::register-command', new FileEncodingCommand(this))
        bus.emit(
          'cmd::register-command',
          new QuickOpenCommand({
            editor: this,
            preferences: preferencesStore,
            project: projectStore
          })
        )
        bus.emit(
          'cmd::register-command',
          new LineEndingCommand(this)
        )
        bus.emit(
          'cmd::register-command',
          new TrailingNewlineCommand(this)
        )

        setTimeout(() => {
          window.electron.ipcRenderer.send('annotamd::request-keybindings')
          bus.emit('cmd::sort-commands')
        }, 100)
      }, 400)

      listenForEditorBootstrap((config) => {
        const {
          addBlankTab,
          markdownList,
          lineEnding,
          sideBarVisibility,
          tabBarVisibility
        } = config

        window.electron.ipcRenderer.send('annotamd::window-initialized')
        mainStore.SET_INITIALIZED()
        preferencesStore.SET_USER_PREFERENCE({ endOfLine: lineEnding })
        layoutStore.SET_LAYOUT({
          rightColumn: 'files',
          showSideBar: true,
          showTabBar: !!tabBarVisibility
        })
        layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
        preferencesStore.SET_MODE({
          type: 'sourceCode',
          checked: false
        })

        if (addBlankTab) {
          this.NEW_UNTITLED_TAB({ selected: true })
        } else if (markdownList.length) {
          let isFirst = true
          for (const md of markdownList) {
            this.NEW_UNTITLED_TAB({
              markdown: md,
              selected: isFirst
            })
            isFirst = false
          }
        }
      })
    },

    // Open a new tab, optionally with content.
    LISTEN_FOR_NEW_TAB(): void {
      window.electron.ipcRenderer.on(
        'annotamd::open-new-tab',
        (_, markdownDocument, options = {}, selected = true) => {
          if (markdownDocument) {
            // Create tab with content.
            this.NEW_TAB_WITH_CONTENT({ markdownDocument, options, selected })
          } else {
            // Fallback: create a blank tab and always select it
            this.NEW_UNTITLED_TAB({})
          }
        }
      )

      window.electron.ipcRenderer.on(
        'annotamd::new-untitled-tab',
        (_, selected = true, markdown = '') => {
          // Create a blank tab
          this.NEW_UNTITLED_TAB({ markdown, selected })
        }
      )
      bus.on('annotamd::new-untitled-tab', (payload) => {
        const { selected = true, markdown = '' } =
          (payload as { selected?: boolean; markdown?: string } | undefined) ?? {}
        this.NEW_UNTITLED_TAB({ markdown, selected })
      })
    },

    CLOSE_TAB(file: IFileState | null = null): void {
      const target = file ?? this.currentFile
      if (target === null) return

      if (target.isSaved) {
        this.FORCE_CLOSE_TAB(target)
      } else {
        this.CLOSE_UNSAVED_TAB(target)
      }
    },

    LISTEN_FOR_CLOSE_TAB(): void {
      window.electron.ipcRenderer.on('annotamd::editor-close-tab', () => {
        this.CLOSE_TAB()
      })
      bus.on('annotamd::editor-close-tab', () => {
        this.CLOSE_TAB()
      })
    },

    LISTEN_FOR_TAB_CYCLE(): void {
      window.electron.ipcRenderer.on('annotamd::tabs-cycle-left', () => {
        this.CYCLE_TABS(false)
      })
      window.electron.ipcRenderer.on('annotamd::tabs-cycle-right', () => {
        this.CYCLE_TABS(true)
      })
      bus.on('annotamd::tabs-cycle-left', () => {
        this.CYCLE_TABS(false)
      })
      bus.on('annotamd::tabs-cycle-right', () => {
        this.CYCLE_TABS(true)
      })
    },

    LISTEN_FOR_SWITCH_TABS(): void {
      window.electron.ipcRenderer.on('annotamd::switch-tab-by-index', (_, index) => {
        this.SWITCH_TAB_BY_INDEX(index)
      })
      window.electron.ipcRenderer.on('annotamd::switch-tab-by-file_path', (_, filePath) => {
        this.SWITCH_TAB_BY_FILEPATH(filePath)
      })
    },

    FORCE_CLOSE_TAB(file: IFileState): void {
      const { tabs, currentFile } = this
      const index = tabs.findIndex((t) => t.id === file.id)
      if (index > -1) {
        tabs.splice(index, 1)
        this.updateTabIdToIndex()
      }

      if (file.id && autoSaveTimers.has(file.id)) {
        const timer = autoSaveTimers.get(file.id)
        if (timer) clearTimeout(timer)
        autoSaveTimers.delete(file.id)
      }

      this.updateTabIdToIndex() // Update before sending it out to prevent stale mappings.

      if (currentFile && file.id === currentFile.id) {
        const fileState: IFileState | null =
          this.tabs[index] ?? this.tabs[index - 1] ?? this.tabs[0] ?? null
        this.currentFile = fileState
        if (fileState && typeof fileState.markdown === 'string') {
          const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor } =
            fileState
          window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            blocks
          })
        } else {
          window.DIRNAME = ''
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }

      const { pathname } = file
      if (pathname) {
        window.electron.ipcRenderer.send('annotamd::window-tab-closed', pathname)
      }
      debouncedSendBufferedState()
    },

    CLOSE_UNSAVED_TAB(file: IFileState): void {
      const { id, pathname, filename, markdown } = file
      const options = getOptionsFromState(file)
      window.electron.ipcRenderer.send('annotamd::save-and-close-tabs', [
        { id, pathname, filename, markdown, options: deepClone(options) }
      ])
    },

    CLOSE_OTHER_TABS(file: IFileState): void {
      this.tabs
        .filter((f) => f.id !== file.id)
        .forEach((tab) => {
          this.CLOSE_TAB(tab)
        })
    },

    CLOSE_SAVED_TABS(): void {
      this.tabs
        .filter((f) => f.isSaved)
        .forEach((tab) => {
          this.CLOSE_TAB(tab)
        })
    },

    CLOSE_ALL_TABS(): void {
      this.tabs.slice().forEach((tab) => {
        this.CLOSE_TAB(tab)
      })
    },

    CLOSE_TABS(tabIdList: string[]): void {
      if (!tabIdList || tabIdList.length === 0) return

      let tabIndex = 0
      tabIdList.forEach((id) => {
        const index = this.tabs.findIndex((f) => f.id === id)
        if (index === -1) return

        const closed = this.tabs[index]
        const { pathname } = closed ?? { pathname: '' }

        if (pathname) {
          window.electron.ipcRenderer.send('annotamd::window-tab-closed', pathname)
        }

        this.tabs.splice(index, 1)
        if (this.currentFile?.id === id) {
          this.currentFile = null
          window.DIRNAME = ''
          if (tabIdList.length === 1) {
            tabIndex = index
          }
        }
      })

      this.updateTabIdToIndex() // Update before sending it out to prevent stale mappings.

      if (this.currentFile == null && this.tabs.length > 0) {
        this.currentFile =
          this.tabs[tabIndex] ?? this.tabs[tabIndex - 1] ?? this.tabs[0] ?? null
        if (this.currentFile && typeof this.currentFile.markdown === 'string') {
          const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor } =
            this.currentFile
          window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            blocks
          })
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }
      debouncedSendBufferedState()
    },

    EXCHANGE_TABS_BY_ID(tabIDs: { fromId: string; toId: string | null }): void {
      const { fromId, toId } = tabIDs
      const { tabs } = this
      const moveItem = <T>(arr: T[], from: number, to: number): boolean => {
        if (from === to) return true
        const len = arr.length
        const item = arr.splice(from, 1)
        if (item.length === 0) return false

        arr.splice(to, 0, item[0]!)
        return arr.length === len
      }

      const fromIndex = tabs.findIndex((t) => t.id === fromId)
      if (fromIndex === -1) return

      if (!toId) {
        moveItem(tabs, fromIndex, tabs.length - 1)
      } else {
        const toIndex = tabs.findIndex((t) => t.id === toId)
        if (toIndex === -1) return
        const realToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
        moveItem(tabs, fromIndex, realToIndex)
      }
      this.updateTabIdToIndex()
      debouncedSendBufferedState()
    },

    RENAME_FILE(file: IFileState): void {
      this.UPDATE_CURRENT_FILE(file)
      bus.emit('rename')
    },

    // Direction is a boolean where false is left and true right.
    CYCLE_TABS(direction: boolean): void {
      const { tabs, currentFile } = this
      if (tabs.length <= 1) {
        return
      }

      const currentIndex = tabs.findIndex((t) => t.id === currentFile?.id)
      if (currentIndex === -1) {
        console.error('CYCLE_TABS: Cannot find current tab index.')
        return
      }

      let nextTabIndex = 0
      if (!direction) {
        // Switch tab to the left.
        nextTabIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
      } else {
        // Switch tab to the right.
        nextTabIndex = (currentIndex + 1) % tabs.length
      }

      const nextTab = tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`CYCLE_TABS: Cannot find next tab (index="${nextTabIndex}").`)
        return
      }

      this.UPDATE_CURRENT_FILE(nextTab)
    },

    SWITCH_TAB_BY_FILEPATH(filePath: string): void {
      const { tabs } = this

      if (!filePath) {
        console.warn('Invalid file path:', filePath)
        return
      }

      const nextTabIndex = tabs.findIndex((t) => t.pathname === filePath)
      if (nextTabIndex === -1) {
        console.error('Cannot find tab with pathname:', filePath)
        return
      }
      const next = tabs[nextTabIndex]
      if (next) this.UPDATE_CURRENT_FILE(next)
    },

    SWITCH_TAB_BY_INDEX(nextTabIndex: number): void {
      const { tabs, currentFile } = this
      if (nextTabIndex < 0 || nextTabIndex >= tabs.length) {
        console.warn('Invalid tab index:', nextTabIndex)
        return
      }

      const currentIndex = tabs.findIndex((t) => t.id === currentFile?.id)
      if (currentIndex === -1) {
        console.error('Cannot find current tab index.')
        return
      }

      const nextTab = tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`Cannot find tab by index="${nextTabIndex}".`)
        return
      }
      this.UPDATE_CURRENT_FILE(nextTab)
    },

    /**
     * Create a new untitled tab, optionally seeded with markdown content.
     */
    NEW_UNTITLED_TAB({
      markdown: markdownString,
      selected
    }: { markdown?: string; selected?: boolean }): void {
      if (selected == null) {
        selected = true
      }

      this.SHOW_TAB_VIEW(false)

      const preferencesStore = usePreferencesStore()
      const { defaultEncoding, endOfLine } = preferencesStore
      const fileState = getBlankFileState(
        this.tabs,
        defaultEncoding,
        endOfLine,
        markdownString ?? null
      )

      if (selected) {
        const { id, markdown } = fileState
        this.UPDATE_CURRENT_FILE(fileState, false)
        bus.emit('file-loaded', { id, markdown })
      } else {
        this.tabs.push(fileState)
        this.updateTabIdToIndex()
        debouncedSendBufferedState()
      }
    },

    /**
     * Create a new tab from the given markdown document.
     */
    NEW_TAB_WITH_CONTENT({
      markdownDocument,
      options = {},
      selected
    }: {
      markdownDocument: MarkdownDocument | null | undefined
      options?: TabOptions
      selected?: boolean
    }): void {
      if (!markdownDocument) {
        console.warn('Cannot create a file tab without a markdown document!')
        this.NEW_UNTITLED_TAB({})
        return
      }

      if (typeof selected === 'undefined') {
        selected = true
      }

      const { currentFile, tabs } = this
      const { pathname } = markdownDocument
      const existingTab = tabs.find((t) =>
        window.fileUtils.isSamePathSync(t.pathname, pathname ?? '')
      )
      if (existingTab) {
        this.UPDATE_CURRENT_FILE(existingTab)
        return
      }

      let keepTabBarState = false
      if (currentFile) {
        const { isSaved, pathname: cfPath } = currentFile
        if (isSaved && !cfPath) {
          keepTabBarState = true
          this.FORCE_CLOSE_TAB(currentFile)
        }
      }

      if (!keepTabBarState) {
        this.SHOW_TAB_VIEW(false)
      }

      const { markdown, isMixedLineEndings } = markdownDocument
      const docState = createDocumentState(
        Object.assign(
          {},
          markdownDocument as unknown as Record<string, unknown>,
          options as Record<string, unknown>
        )
      )
      const { id, cursor } = docState

      if (selected) {
        this.UPDATE_CURRENT_FILE(docState, false)
        bus.emit('file-loaded', { id, markdown, cursor })
      } else {
        this.tabs.push(docState)
        this.updateTabIdToIndex()
        debouncedSendBufferedState()
      }

      if (isMixedLineEndings) {
        const { filename, lineEnding } = markdownDocument
        if (typeof lineEnding === 'string') {
          this.pushTabNotification({
            tabId: id,
            msg: t('store.editor.mixedLineEndingsNormalized', {
              name: filename,
              lineEnding: lineEnding.toUpperCase()
            })
          })
        }
      }
    },

    SHOW_TAB_VIEW(always: boolean): void {
      const { tabs } = this
      const layoutStore = useLayoutStore()
      // NEW_UNTITLED_TAB / NEW_TAB_WITH_CONTENT call this before inserting the
      // incoming tab. Zero therefore means "the first file is opening" and one
      // means "a second tab is opening"; both cases need the filename strip.
      if (always || tabs.length <= 1) {
        layoutStore.SET_LAYOUT({ showTabBar: true })
        layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
      }
    },

    SET_SAVE_STATUS_WHEN_REMOVE({ pathname }: { pathname: string }): void {
      let didUpdateMissingStatus = false
      this.tabs.forEach((f) => {
        if (f.pathname === pathname) {
          if (autoSaveTimers.has(f.id)) {
            const timer = autoSaveTimers.get(f.id)
            if (timer) clearTimeout(timer)
            autoSaveTimers.delete(f.id)
          }
          f.isMissingOnDisk = true
          didUpdateMissingStatus = true
        }
      })
      if (didUpdateMissingStatus) {
        debouncedSendBufferedState()
      }
    },

    /**
     * Replaces the table of contents with a fresh snapshot from the engine.
     *
     * Used on file load and tab switch, where the engine fires no `json-change`
     * event (so `LISTEN_FOR_CONTENT_CHANGE` never runs and the TOC would
     * otherwise stay empty until the first edit). Assigns unconditionally: this
     * is a re-seed on load/switch, so there is no `equal` guard to short-circuit
     * — the incoming snapshot always wins, even if it happens to deep-equal the
     * current TOC.
     * @param toc Flat list of headings returned by `muya.getTOC()`.
     */
    UPDATE_TOC(toc: TocItem[]): void {
      this.listToc = toc ?? []
      this.toc = listToTree<TocItem>(toc ?? [])
    },

    UPDATE_DERIVED_DOCUMENT_STATE({
      id,
      markdown,
      wordCount,
      toc
    }: DerivedDocumentStatePayload): void {
      const tabIndex = this.tabIdToIndex[id]
      const tab = tabIndex === undefined ? undefined : this.tabs[tabIndex]
      // A delayed calculation must never overwrite a newer edit or a reused
      // tab. The content snapshot is the inexpensive freshness token.
      if (!tab || tab.markdown !== markdown) return

      tab.wordCount = wordCount
      if (id === this.currentFile?.id && toc && !equal(toc, this.listToc)) {
        this.listToc = toc
        this.toc = listToTree<TocItem>(toc)
      }
    },

    // Content change from realtime preview editor and source code editor
    // There is a chance that this event is fired AFTER the tab is switched.
    LISTEN_FOR_CONTENT_CHANGE({
      id,
      markdown,
      wordCount,
      cursor,
      muyaIndexCursor,
      history,
      toc,
      blocks
    }: ContentChangePayload): void {
      const preferencesStore = usePreferencesStore()
      const { autoSave } = preferencesStore
      if (!id) {
        throw new Error('Listen for document change but id was not set!')
      } else if (this.tabs.length === 0) {
        return
      } else if (!(id in this.tabIdToIndex)) {
        // This only happens when the sourceCode tries to write a stale id via prepareTabSwitch() but the tab
        // has already been closed. In this case we can safely ignore the update.
        return
      }

      const tab = this.tabs[this.tabIdToIndex[id]!]
      if (!tab) return

      const { filename, pathname, markdown: oldMarkdown, trimTrailingNewline } = tab

      markdown = adjustTrailingNewlines(markdown, trimTrailingNewline)
      tab.markdown = markdown

      if (oldMarkdown.length === 0 && markdown.length === 1 && markdown[0] === '\n') {
        debouncedSendBufferedState()
        return
      }

      if (wordCount) tab.wordCount = wordCount
      if (cursor) tab.cursor = cursor
      if (muyaIndexCursor) tab.muyaIndexCursor = muyaIndexCursor
      if (history) tab.history = history
      if (blocks) tab.blocks = blocks

      // Only update TOC if it's the current file
      if (id === this.currentFile?.id && toc && !equal(toc, this.listToc)) {
        this.listToc = toc
        this.toc = listToTree<TocItem>(toc)
      }

      const lastEditIndex = tab.history.lastEditIndex
      const editEntry =
        typeof lastEditIndex === 'number' && lastEditIndex >= 0
          ? tab.history.stack[lastEditIndex]
          : undefined
      const historyMarksDirty =
        (typeof lastEditIndex === 'number' &&
          lastEditIndex >= 0 &&
          editEntry !== undefined &&
          editEntry.id !== tab.lastSavedHistoryId) ||
        (lastEditIndex === -1 &&
          tab.lastSavedHistoryId !== -1 &&
          tab.lastSavedHistoryId !== tab.history.lastInitIndex) // Edge Case: Undo to original content (lastEditIndex === -1) after saving means we cant use the lastEditIndex. Compare it against the lastInitIndex instead.
      const isDirty = history === undefined ? markdown !== oldMarkdown : historyMarksDirty
      if (isDirty) {
        tab.isSaved = false
        if (pathname && autoSave && !tab.isMissingOnDisk) {
          const options = getOptionsFromState(tab)
          this.HANDLE_AUTO_SAVE({
            id,
            filename,
            pathname,
            markdown,
            options
          })
        }
      } else if (history !== undefined && tab.lastSavedHistoryId !== -1) {
        // Check here is to prevent it from overriding a restored .isSaved state
        tab.isSaved = true // An undo can trigger this
      }
      debouncedSendBufferedState()
    },

    HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options }: AutoSavePayload): void {
      if (!id || !pathname) {
        throw new Error('HANDLE_AUTO_SAVE: Invalid tab.')
      }

      const projectStore = useProjectStore()

      if (autoSaveTimers.has(id)) {
        const timer = autoSaveTimers.get(id)
        clearTimeout(timer)
        autoSaveTimers.delete(id)
      }

      const timer = setTimeout(() => {
        autoSaveTimers.delete(id)

        const tab = this.tabs.find((t) => t.id === id)
        if (tab && !tab.isSaved && !tab.isMissingOnDisk) {
          const defaultPath = getRootFolderFromState(projectStore)
          window.electron.ipcRenderer.send(
            'annotamd::response-file-save',
            id,
            filename,
            pathname,
            markdown,
            deepClone(options),
            defaultPath
          )
        }
      }, AUTO_SAVE_DELAY)
      autoSaveTimers.set(id, timer)
    },

    SELECTION_CHANGE(changes: SelectionChange): void {
      const { start, end } = changes
      if (this.currentFile && start.key === end.key && start.block?.text) {
        const value = start.block.text.substring(start.offset, end.offset)
        this.currentFile.searchMatches = {
          matches: [],
          index: -1,
          value
        }
      }

      const { windowId } = window.annotamd?.env ?? { windowId: -1 }
      window.electron.ipcRenderer.send(
        'annotamd::editor-selection-changed',
        windowId,
        createApplicationMenuState(changes)
      )
    },

    // Persist the caret for a tab without the heavy content-change pipeline. A
    // pure caret move (click / arrow key) fires `selection-change` but NOT
    // `json-change`, so `tab.cursor` — the position replayed when the tab is
    // re-activated — would otherwise only ever track the last EDIT, losing a
    // click-moved caret across an in-session tab switch. Lightweight by design:
    // it only stores the serialized caret, skipping markdown/blocks/TOC re-derivation
    // and the save/dirty bookkeeping LISTEN_FOR_CONTENT_CHANGE performs.
    PERSIST_CURSOR(id: string, cursor: unknown): void {
      if (!id || !cursor) return
      const index = this.tabIdToIndex[id]
      if (index == null) return
      const tab = this.tabs[index]
      if (tab) tab.cursor = cursor
    },

    SELECTION_FORMATS(formats: SelectionFormat[]): void {
      const { windowId } = window.annotamd?.env ?? { windowId: -1 }
      window.electron.ipcRenderer.send(
        'annotamd::update-format-menu',
        windowId,
        createSelectionFormatState(formats)
      )
    },

    EXPORT({ type, content, pageOptions }: ExportPayload): void {
      if (this.currentFile === null) return

      let title = ''
      const { listToc } = this
      if (listToc && listToc.length > 0) {
        let headerRef: TocItem | undefined = listToc[0]
        const len = Math.min(listToc.length, 6)
        for (let i = 1; i < len; ++i) {
          if (headerRef?.lvl === 1) break
          const header = listToc[i]
          if (header && headerRef && (headerRef.lvl ?? 0) > (header.lvl ?? 0)) {
            headerRef = header
          }
        }
        title = headerRef?.content ?? ''
      }

      const { filename, pathname } = this.currentFile
      window.electron.ipcRenderer.send('annotamd::response-export', {
        type: type as ExportPayload['type'] as never,
        title,
        content: content ?? '',
        filename,
        pathname,
        pageOptions: pageOptions ?? {}
      })
    },

    LISTEN_FOR_EXPORT_SUCCESS(): void {
      window.electron.ipcRenderer.on('annotamd::export-success', (_, payload) => {
        const filePath = payload?.filePath ?? ''
        notice
          .notify({
            title: t('store.editor.exportSuccessTitle'),
            message: t('store.editor.exportSuccessMessage', {
              name: window.path.basename(filePath)
            }),
            showConfirm: true
          })
          .then(() => {
            window.electron.shell.showItemInFolder(filePath)
          })
      })
    },

    PRINT_RESPONSE(): void {
      window.electron.ipcRenderer.send('annotamd::response-print')
    },

    LISTEN_FOR_PRINT_SERVICE_CLEARUP(): void {
      window.electron.ipcRenderer.on('annotamd::print-service-clearup', () => {
        bus.emit('print-service-clearup')
      })
    },

    SET_LINE_ENDING(lineEnding: LineEnding | string): void {
      if (!this.currentFile) return
      const { lineEnding: oldLineEnding } = this.currentFile
      if (lineEnding !== oldLineEnding) {
        this.currentFile.lineEnding = lineEnding
        this.currentFile.adjustLineEndingOnSave = lineEnding !== 'lf'
        this.currentFile.isSaved = true
        this.UPDATE_LINE_ENDING_MENU()
        debouncedSendBufferedState()
      }
    },

    LISTEN_FOR_SET_LINE_ENDING(): void {
      window.electron.ipcRenderer.on('annotamd::set-line-ending', (_, lineEnding) => {
        this.SET_LINE_ENDING(lineEnding)
      })
      bus.on('annotamd::set-line-ending', (lineEnding) => {
        this.SET_LINE_ENDING(lineEnding as LineEnding)
      })
    },

    LISTEN_FOR_SET_ENCODING(): void {
      bus.on('annotamd::set-file-encoding', (encodingName) => {
        if (!this.currentFile) return
        const { encoding } = this.currentFile.encoding
        if (encoding !== encodingName) {
          this.currentFile.encoding.encoding = encodingName as string
          this.currentFile.encoding.isBom = false
          this.currentFile.isSaved = true
          debouncedSendBufferedState()
        }
      })
    },

    LISTEN_FOR_SET_FINAL_NEWLINE(): void {
      bus.on('annotamd::set-final-newline', (value) => {
        if (!this.currentFile) return
        const { trimTrailingNewline } = this.currentFile
        if (trimTrailingNewline !== value) {
          this.currentFile.trimTrailingNewline = value as number
          this.currentFile.isSaved = true
          debouncedSendBufferedState()
        }
      })
    },

    LISTEN_FOR_FILE_CHANGE(): void {
      window.electron.ipcRenderer.on('annotamd::update-file', (_, payload) => {
        const { type, change } = payload
        const { tabs } = this
        const { pathname } = change
        const tab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
        if (tab) {
          const { id, filename } = tab
          switch (type) {
            case 'unlink': {
              if (autoSaveTimers.has(id)) {
                const timer = autoSaveTimers.get(id)
                if (timer) clearTimeout(timer)
                autoSaveTimers.delete(id)
              }
              tab.isMissingOnDisk = true
              this.pushTabNotification({
                tabId: id,
                msg: t('store.editor.fileRemovedOnDisk', { name: filename }),
                style: 'warn',
                showConfirm: false,
                exclusiveType: 'file_changed'
              })
              debouncedSendBufferedState()
              break
            }
            case 'add':
            case 'change': {
              // Only the file's metadata changed on disk (e.g. a git checkout
              // that left the content byte-identical) — there is nothing to
              // reload and no reason to warn the user (#1861).
              const newMarkdown = (change as unknown as FileChangePayload).data?.markdown
              if (
                type === 'change' &&
                !tab.isMissingOnDisk &&
                typeof newMarkdown === 'string' &&
                newMarkdown === tab.markdown
              ) {
                break
              }

              // Files are auto-saved, so an external writer (Agent, IDE, Git,
              // etc.) is the newest source of truth. Cancel any delayed save
              // before reloading so stale editor content cannot overwrite the
              // freshly changed file after the watcher event.
              if (autoSaveTimers.has(id)) {
                const timer = autoSaveTimers.get(id)
                if (timer) clearTimeout(timer)
                autoSaveTimers.delete(id)
              }
              this.loadChange(change as unknown as FileChangePayload)
              break
            }
            default:
              console.error(`LISTEN_FOR_FILE_CHANGE: Invalid type "${type}"`)
          }
        } else {
          console.error(`LISTEN_FOR_FILE_CHANGE: Cannot find tab for path "${pathname}".`)
        }
      })
    },

    ASK_FOR_IMAGE_PATH(): Promise<string[]> {
      return window.electron.ipcRenderer.invoke('annotamd::ask-for-image-path')
    },

    EDIT_ZOOM(zoomFactor: number): void {
      const preferencesStore = usePreferencesStore()
      zoomFactor = Number.parseFloat(zoomFactor.toFixed(3))
      const { zoom } = preferencesStore
      if (zoom !== zoomFactor) {
        preferencesStore.SET_SINGLE_PREFERENCE({ type: 'zoom', value: zoomFactor })
      }
      window.electron.webFrame.setZoomFactor(zoomFactor)
    },

    LISTEN_WINDOW_ZOOM(): void {
      window.electron.ipcRenderer.on('annotamd::window-zoom', (_, zoomFactor) => {
        this.EDIT_ZOOM(zoomFactor)
      })
      bus.on('annotamd::window-zoom', (zoomFactor) => {
        this.EDIT_ZOOM(zoomFactor as number)
      })
    },

    LISTEN_FOR_RELOAD_IMAGES(): void {
      window.electron.ipcRenderer.on('annotamd::invalidate-image-cache', () => {
        bus.emit('invalidate-image-cache')
      })
    },

    LISTEN_FOR_CONTEXT_MENU(): void {
      // General context menu
      window.electron.ipcRenderer.on('annotamd::cm-copy-as-rich', () => {
        bus.emit('copyAsRich', 'copyAsRich')
      })
      window.electron.ipcRenderer.on('annotamd::cm-copy-as-html', () => {
        bus.emit('copyAsHtml', 'copyAsHtml')
      })
      window.electron.ipcRenderer.on('annotamd::cm-paste-as-plain-text', () => {
        bus.emit('pasteAsPlainText', 'pasteAsPlainText')
      })
      window.electron.ipcRenderer.on('annotamd::cm-insert-paragraph', (_, location) => {
        bus.emit('insertParagraph', location)
      })

      // Spelling
      window.electron.ipcRenderer.on('annotamd::spelling-replace-misspelling', (_, info) => {
        bus.emit('replace-misspelling', info)
      })
      window.electron.ipcRenderer.on('annotamd::spelling-show-switch-language', () => {
        bus.emit('open-command-spellchecker-switch-language')
      })
    },

    LISTEN_FOR_STATE_REPLACE(): void {
      window.electron.ipcRenderer.on('annotamd::load-state', (_, state) => {
        this.RESTORE_BUFFERED_STATE(state)
      })
    }
  }
})

// ----------------------------------------------------------------------------

/**
 * Return the opened root folder or an empty string.
 *
 * @param {object} projectStore The project store instance.
 */
