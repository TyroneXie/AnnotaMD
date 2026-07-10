import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory, resortTree, updateFileMtime } from './treeCtrl'
import { usePreferencesStore } from './preferences'
import bus from '../bus'
import { create, paste, rename, type FileCreateType, type PasteOptions } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { debouncedSendBufferedState } from './bufferedState'
import type { TreeNode } from '../components/sideBar/types'
import type { FileChangeDetail } from '@shared/types/files'
import {
  addProjectRoot,
  findProjectRootForPath,
  readBufferedProjectRoots,
  removeProjectRoot
} from './projectRoots'

type ProjectTree = TreeNode
type TreeChange = FileChangeDetail

const normalizeProjectRoot = (pathname: string | null | undefined): string => {
  return pathname ? window.path.normalize(pathname) : ''
}

const createProjectRoot = (pathname: string): ProjectTree | null => {
  const normalizedPathname = normalizeProjectRoot(pathname)
  if (!normalizedPathname) return null

  let name = window.path.basename(normalizedPathname)
  if (!name) {
    // Root directory such as "/" or "C:\"
    name = normalizedPathname
  }

  return {
    pathname: normalizedPathname,
    name,
    isDirectory: true,
    isFile: false,
    isMarkdown: false,
    folders: [],
    files: []
  }
}

interface BufferedProjectState {
  rootDirectory: string
  rootDirectories: string[]
}

interface OpenProjectOptions {
  scheduleBufferUpdate?: boolean
}

interface CreateCacheEntry {
  dirname: string
  type: 'file' | 'directory' | string
}

interface ClipboardEntry {
  type: 'copy' | 'cut' | string
  src: string
  dest?: string
}

interface PendingEvent {
  type: string
  change: TreeChange
}

export const useProjectStore = defineStore('project', () => {
  // Heterogeneous UI state: assigned file nodes, folder nodes, and the empty
  // "no selection" object/null across sidebar components; a single non-`any`
  // union breaks both the assignments and the field reads, so it stays a hatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeItem = ref<any>({})
  const createCache = ref<CreateCacheEntry | Record<string, never>>({})
  const newFileNameCache = ref<string>('')
  const renameCache = ref<string | null>(null)
  const clipboard = ref<ClipboardEntry | null>(null)
  const projectTrees = ref<ProjectTree[]>([])
  // Compatibility view for consumers that still need one default root
  // (relative-image defaults, quick-open and title-bar breadcrumbs).
  const projectTree = computed<ProjectTree | null>(() => projectTrees.value[0] ?? null)
  const pendingTreeEvents = ref<PendingEvent[]>([])

  const preferencesStore = usePreferencesStore()

  watch(
    [() => preferencesStore.fileSortBy, () => preferencesStore.fileSortOrder],
    ([sortBy, sortOrder]) => {
      for (const tree of projectTrees.value) {
        resortTree(tree, String(sortBy), String(sortOrder))
      }
    }
  )

  function OPEN_PROJECT(
    pathname: string,
    { scheduleBufferUpdate = true }: OpenProjectOptions = {}
  ): void {
    const layoutStore = useLayoutStore()
    const tree = createProjectRoot(pathname)
    if (!tree) return

    const result = addProjectRoot(
      projectTrees.value.map((item) => item.pathname),
      tree.pathname
    )
    if (!result.added) return
    projectTrees.value.push(tree)

    const layout = {
      rightColumn: 'files',
      showSideBar: true,
      showTabBar: true
    }
    layoutStore.SET_LAYOUT(layout, { scheduleBufferUpdate })
    layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()

    // Process pending events that arrived before projectTree was initialized.
    pendingTreeEvents.value = pendingTreeEvents.value.filter(
      (event) => !_processTreeEvent(event.type, event.change)
    )

    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CREATE_BUFFERED_STATE(): BufferedProjectState {
    const rootDirectories = projectTrees.value.map((tree) => tree.pathname)
    return {
      rootDirectory: rootDirectories[0] ?? '',
      rootDirectories
    }
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const rootDirectories = readBufferedProjectRoots(state)
    if (rootDirectories.length) {
      projectTrees.value = projectTrees.value.filter((tree) => rootDirectories.includes(tree.pathname))
      for (const rootDirectory of rootDirectories) {
        if (!projectTrees.value.some((tree) => tree.pathname === rootDirectory)) {
          OPEN_PROJECT(rootDirectory, { scheduleBufferUpdate: false })
        }
      }
      projectTrees.value.sort(
        (a, b) => rootDirectories.indexOf(a.pathname) - rootDirectories.indexOf(b.pathname)
      )
    } else {
      projectTrees.value = []
      pendingTreeEvents.value = []
    }
  }

  function REMOVE_PROJECT(pathname: string, notifyMain: boolean = true): void {
    const remaining = removeProjectRoot(
      projectTrees.value.map((tree) => tree.pathname),
      pathname
    )
    if (remaining.length === projectTrees.value.length) return

    projectTrees.value = projectTrees.value.filter((tree) => remaining.includes(tree.pathname))
    pendingTreeEvents.value = pendingTreeEvents.value.filter(
      (event) => !findProjectRootForPath([pathname], event.change.pathname)
    )
    if (notifyMain) {
      window.electron.ipcRenderer.send('mt::remove-directory-from-workspace', pathname)
    }
    debouncedSendBufferedState()
  }

  function LISTEN_FOR_LOAD_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::open-directory', (_e, pathname) => {
      OPEN_PROJECT(String(pathname))
    })
    window.electron.ipcRenderer.on('mt::remove-directory', (_e, pathname) => {
      REMOVE_PROJECT(String(pathname), false)
    })
  }

  function LISTEN_FOR_UPDATE_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::update-object-tree', (_e, payload) => {
      const { type, change } = (payload as { type: string; change: TreeChange }) ?? {}
      if (!findProjectRootForPath(projectTrees.value.map((tree) => tree.pathname), change.pathname)) {
        pendingTreeEvents.value.push({ type, change })
        return
      }
      _processTreeEvent(type, change)
    })
  }

  function _processTreeEvent(type: string, change: TreeChange): boolean {
    const editorStore = useEditorStore()
    const rootPath = findProjectRootForPath(
      projectTrees.value.map((tree) => tree.pathname),
      change.pathname
    )
    const tree = projectTrees.value.find((item) => item.pathname === rootPath)
    if (!tree) return false

    switch (type) {
      case 'add': {
        const { pathname, data, isMarkdown } = change
        addFile(tree, change as Parameters<typeof addFile>[1], String(preferencesStore.fileSortBy), String(preferencesStore.fileSortOrder))
        if (isMarkdown && newFileNameCache.value && pathname === newFileNameCache.value) {
          const fileState = getFileStateFromData(data as Record<string, unknown>)
          editorStore.UPDATE_CURRENT_FILE(fileState)
          newFileNameCache.value = ''
        }
        break
      }
      case 'unlink':
        unlinkFile(tree, change)
        editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
        break
      case 'addDir':
        addDirectory(tree, change)
        break
      case 'unlinkDir':
        unlinkDirectory(tree, change)
        break
      case 'change':
        if (change?.mtimeMs !== undefined) {
          updateFileMtime(tree, change as Parameters<typeof updateFileMtime>[1], String(preferencesStore.fileSortBy), String(preferencesStore.fileSortOrder))
        }
        break
      default:
        if (window.electron?.process?.env?.NODE_ENV === 'development') {
          console.log(`Unknown directory watch type: "${type}"`)
        }
        break
    }
    return true
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function CHANGE_ACTIVE_ITEM(item: any): void {
    activeItem.value = item
  }

  function CHANGE_CLIPBOARD(data: ClipboardEntry | null): void {
    clipboard.value = data
  }

  function ASK_FOR_OPEN_PROJECT(): void {
    window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
  }

  function LISTEN_FOR_SIDEBAR_CONTEXT_MENU(): void {
    bus.on('SIDEBAR::show-in-folder', () => {
      const { pathname } = activeItem.value
      window.electron.shell.showItemInFolder(pathname)
    })
    bus.on('SIDEBAR::new', (type: unknown) => {
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      createCache.value = { dirname, type: String(type) }
      bus.emit('SIDEBAR::show-new-input')
    })
    bus.on('SIDEBAR::remove', () => {
      const { pathname } = activeItem.value
      window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname).catch((err) => {
        notice.notify({
          title: 'Error while deleting',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
    })
    bus.on('SIDEBAR::copy-cut', (type: unknown) => {
      const { pathname: src } = activeItem.value
      clipboard.value = { type: String(type), src }
    })
    bus.on('SIDEBAR::paste', () => {
      const cb = clipboard.value
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      if (cb && cb.src) {
        cb.dest = dirname + PATH_SEPARATOR + window.path.basename(cb.src)

        if (window.path.normalize(cb.src) === window.path.normalize(cb.dest)) {
          notice.notify({
            title: 'Paste Forbidden',
            type: 'warning',
            message: 'Source and destination must not be the same.'
          })
          return
        }

        paste(cb as PasteOptions)
          .then(() => {
            clipboard.value = null
          })
          .catch((err) => {
            notice.notify({
              title: 'Error while pasting',
              type: 'error',
              message: err instanceof Error ? err.message : String(err)
            })
          })
      }
    })
    bus.on('SIDEBAR::rename', () => {
      const { pathname } = activeItem.value
      renameCache.value = pathname
      bus.emit('SIDEBAR::show-rename-input')
    })
  }

  async function CREATE_FILE_DIRECTORY(name: string): Promise<void> {
    const cache = createCache.value as CreateCacheEntry
    const { dirname, type } = cache

    if (type === 'file' && !window.fileUtils.hasMarkdownExtension(name)) {
      name += '.md'
    }

    const fullName = `${dirname}/${name}`

    // Creating over an existing path would silently overwrite it (outputFile
    // truncates). Refuse instead of destroying the existing file (#1946).
    if (await window.fileUtils.pathExists(fullName)) {
      createCache.value = {}
      notice.notify({
        title: 'Error in Side Bar',
        type: 'error',
        message: `A ${type} named "${name}" already exists in this folder.`
      })
      return
    }

    create(fullName, type as FileCreateType)
      .then(() => {
        createCache.value = {}
        if (type === 'file') {
          newFileNameCache.value = fullName
        }
      })
      .catch((err) => {
        notice.notify({
          title: 'Error in Side Bar',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
  }

  function RENAME_IN_SIDEBAR(name: string): void {
    const editorStore = useEditorStore()
    const src = renameCache.value
    if (!src) return
    const dirname = window.path.dirname(src)
    const dest = dirname + PATH_SEPARATOR + name
    rename(src, dest).then(() => {
      editorStore.RENAME_IF_NEEDED({ src, dest })
    })
  }

  function OPEN_SETTING_WINDOW(): void {
    window.electron.ipcRenderer.send('mt::open-setting-window')
  }

  return {
    activeItem,
    createCache,
    newFileNameCache,
    renameCache,
    clipboard,
    projectTrees,
    projectTree,
    pendingTreeEvents,
    OPEN_PROJECT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    REMOVE_PROJECT,
    LISTEN_FOR_LOAD_PROJECT,
    LISTEN_FOR_UPDATE_PROJECT,
    CHANGE_ACTIVE_ITEM,
    CHANGE_CLIPBOARD,
    ASK_FOR_OPEN_PROJECT,
    LISTEN_FOR_SIDEBAR_CONTEXT_MENU,
    CREATE_FILE_DIRECTORY,
    RENAME_IN_SIDEBAR,
    OPEN_SETTING_WINDOW
  }
})
