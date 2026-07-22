/**
 * IPC channel contract — single source of truth for renderer↔main messaging.
 *
 * Four channel categories:
 *   - IpcInvokeChannels      : renderer → main, returns Promise<T>
 *   - IpcSendChannels        : renderer → main, fire-and-forget
 *   - IpcSyncChannels        : renderer → main, synchronous
 *   - IpcMainEventChannels   : main → renderer, push events (renderer .on)
 *
 * Channel names are typed strictly; argument and return shapes are
 * intentionally permissive (`unknown[]` / `unknown`) during the migration.
 * Concrete types tighten as each handler/caller converts in commits 5–8.
 *
 * To register a new channel:
 *   1. Add an entry to the appropriate interface here.
 *   2. Wire the handler in src/main (ipcMain.handle / ipcMain.on / webContents.send).
 *   3. Wire the caller via the typed preload bridge in src/preload/index.ts.
 */

import type { IKeyboardLayoutInfo, IKeyboardMapping } from 'native-keymap'
import type {
  MarkdownDocument,
  TabOptions,
  BootstrapEditorConfig,
  PageOptions,
  ExportType,
  SaveOptions,
  SerializedStat,
  LineEnding,
  FileChangeDetail,
  UnsavedFile
} from './files'
import type { BufferedState as BufferedStateType } from './bufferedState'
import type { MenuTemplate, MenuPopupPosition } from './menu'
import type {
  AnnotaMDCommentDocument,
  AnnotaMDCommentReplaceRequest,
  AnnotaMDLegacyCommentMigration,
  AnnotaMDCommentMigrationResult,
  AnnotaMDMcpStatus
} from './comments'
import type {
  AnnotaMDMcpClientConfigureResult,
  AnnotaMDMcpClientId,
  AnnotaMDMcpClientState,
  AnnotaMDMcpManualConfigResult
} from './mcpClients'
import type { AppUpdateState } from './update'

export interface LinkPreviewMetadata {
  title: string
  icon: string
}

// =================================================================
// Invoke channels (renderer → main, returns Promise<T>)
// =================================================================

export interface IpcInvokeChannels {
  'annotamd::update:get-state': { args: []; ret: AppUpdateState }
  'annotamd::update:check': { args: []; ret: AppUpdateState }
  'annotamd::update:download': { args: []; ret: AppUpdateState }
  'annotamd::update:install': { args: []; ret: AppUpdateState }
  'annotamd::mcp-clients::inspect': {
    args: [forceRefresh?: boolean]
    ret: AnnotaMDMcpClientState[]
  }
  'annotamd::mcp-clients::configure': {
    args: [id: AnnotaMDMcpClientId]
    ret: AnnotaMDMcpClientConfigureResult
  }
  'annotamd::mcp-clients::manual-config': {
    args: []
    ret: AnnotaMDMcpManualConfigResult
  }
  'annotamd::mcp-clients::install-portable-skill': { args: []; ret: void }
  'annotamd::comments::mcp-status': { args: []; ret: AnnotaMDMcpStatus }
  'annotamd::comments::load': {
    args: [filePath: string, markdown?: string]
    ret: AnnotaMDCommentDocument
  }
  'annotamd::comments::replace': {
    args: [request: AnnotaMDCommentReplaceRequest]
    ret: AnnotaMDCommentDocument
  }
  'annotamd::comments::migrate': {
    args: [entries: AnnotaMDLegacyCommentMigration[]]
    ret: AnnotaMDCommentMigrationResult
  }
  'annotamd::comments::mark-missing': { args: [filePath: string]; ret: void }
  'annotamd::ask-for-image-path': { args: []; ret: string[] }
  'annotamd::boot-info-async': { args: []; ret: BootInfo }
  'annotamd::clipboard::guess-file-path': { args: []; ret: string | null }
  'annotamd::clipboard::read-text': { args: []; ret: string }
  'annotamd::cmd::exists': { args: [name: string]; ret: boolean }
  'annotamd::fonts::list': { args: []; ret: string[] }
  'annotamd::fs-trash-item': { args: [pathname: string]; ret: void }
  'annotamd::fs::copy': { args: [src: string, dest: string]; ret: void }
  'annotamd::fs::empty-dir': { args: [path: string]; ret: void }
  'annotamd::fs::ensure-dir': { args: [path: string]; ret: void }
  'annotamd::fs::is-directory': { args: [path: string]; ret: boolean }
  'annotamd::fs::is-executable': { args: [path: string]; ret: boolean }
  'annotamd::fs::is-file': { args: [path: string]; ret: boolean }
  'annotamd::fs::move': { args: [src: string, dest: string]; ret: void }
  'annotamd::fs::output-file': { args: [path: string, data: string | Uint8Array]; ret: void }
  'annotamd::fs::path-exists': { args: [path: string]; ret: boolean }
  'annotamd::fs::read-file': { args: [path: string, encoding?: string]; ret: string | Uint8Array }
  'annotamd::fs::readdir': { args: [path: string]; ret: string[] }
  'annotamd::fs::stat': { args: [path: string]; ret: SerializedStat }
  'annotamd::fs::unlink': { args: [path: string]; ret: void }
  'annotamd::fs::write-file': { args: [path: string, data: string | Uint8Array]; ret: void }
  'annotamd::i18n::is-supported': { args: [lang: string]; ret: boolean }
  'annotamd::i18n::load': { args: [language: string]; ret: Record<string, unknown> }
  'annotamd::i18n::supported': { args: []; ret: string[] }
  'annotamd::keybinding-get-keyboard-info': { args: []; ret: KeyboardInfo }
  'annotamd::keybinding-get-pref-keybindings': {
    args: []
    ret: { defaultKeybindings: Map<string, string>; userKeybindings: Map<string, string> }
  }
  'annotamd::keybinding-save-user-keybindings': { args: [bindings: unknown]; ret: boolean }
  'annotamd::paths::is-image': { args: [path: string]; ret: boolean }
  'annotamd::rg::start': { args: [req: unknown]; ret: { searchId: string } }
  'annotamd::shell::open-external': { args: [url: string]; ret: void }
  'annotamd::shell::get-link-metadata': { args: [url: string]; ret: LinkPreviewMetadata }
  'annotamd::shell::open-path': { args: [fullPath: string]; ret: string }
  'annotamd::spellchecker-get-available-dictionaries': { args: []; ret: string[] }
  'annotamd::spellchecker-get-custom-dictionary-words': { args: []; ret: string[] }
  'annotamd::spellchecker-remove-word': { args: [word: string]; ret: boolean }
  'annotamd::spellchecker-set-enabled': { args: [enabled: boolean]; ret: void }
  'annotamd::spellchecker-switch-language': { args: [language: string]; ret: void }
  'annotamd::uploader::upload': { args: [req: unknown]; ret: unknown }
  'annotamd::win::is-fullscreen': { args: []; ret: boolean }
  'annotamd::win::is-maximized': { args: []; ret: boolean }
  // Main derives the BrowserWindow via BrowserWindow.fromWebContents(e.sender);
  // no need to pass windowId. Payload is the editor+project+layout snapshot.
  'update-buffer-state': { args: [payload: unknown]; ret: void }
}

// =================================================================
// Send channels (renderer → main, fire-and-forget)
// =================================================================

export interface IpcSendChannels {
  'app-create-editor-window': [config?: unknown]
  'app-create-settings-window': []
  'app-open-directory-by-id': [windowId: number, dirPath: string]
  'app-open-file-by-id': [windowId: number, filePath: string, options?: unknown]
  'app-open-files-by-id': [windowId: number, filePaths: string[], options?: unknown]
  'app-open-markdown-by-id': [windowId: number, markdown: string, options?: unknown]
  'broadcast-preferences-changed': [partial: unknown]
  'broadcast-user-data-changed': [partial: unknown]
  'menu-add-recently-used': [filePath: string]
  'menu-clear-recently-used': []
  'annotamd::add-recently-used-document': [filePath: string]
  'annotamd::app-try-quit': []
  'annotamd::ask-for-image-auto-path': [payload: unknown]
  'annotamd::ask-for-modify-image-folder-path': [imagePath?: string]
  'annotamd::ask-for-open-project-in-sidebar': []
  'annotamd::remove-directory-from-workspace': [pathname: string]
  'annotamd::ask-for-user-data': []
  'annotamd::ask-for-user-preference': []
  'annotamd::clipboard::write-text': [text: string]
  'annotamd::clipboard::write-image': [dataUrl: string]
  'annotamd::close-window': []
  'annotamd::close-window-confirm': [unsavedFiles: UnsavedFile[]]
  'annotamd::cmd-close-window': []
  'annotamd::cmd-import-file': []
  'annotamd::cmd-new-editor-window': []
  'annotamd::cmd-open-file': []
  'annotamd::cmd-open-folder': []
  'annotamd::cmd-toggle-autosave': []
  'annotamd::editor-selection-changed': [windowId: number, state: unknown]
  'annotamd::format-link-click': [payload: { data: unknown; dirname: string }]
  'annotamd::get-current-language': []
  'annotamd::handle-renderer-error': [error: unknown]
  'annotamd::keybinding-debug-dump-keyboard-info': []
  'annotamd::make-screenshot': []
  'annotamd::menu::popup': [template: MenuTemplate, position?: MenuPopupPosition]
  'annotamd::menu::popup-application': [position?: MenuPopupPosition]
  'annotamd::open-file': [filePath: string, options?: unknown]
  'annotamd::open-file-by-window-id': [windowId: number, filePath: string, options?: unknown]
  'annotamd::open-keybindings-config': []
  'annotamd::open-setting-window': [category?: string]
  'annotamd::rename': [payload: { id: string; pathname: string; newPathname: string; currentFile?: unknown }]
  'annotamd::request-keybindings': []
  'annotamd::set-editor-format-menus-enabled': [windowId: number, enabled: boolean]
  'annotamd::response-export': [
    payload: {
      type: ExportType
      title: string
      content: string
      filename: string
      pathname: string
      pageOptions: PageOptions
    }
  ]
  'annotamd::response-file-move-to': [payload: { id: string; pathname: string }]
  'annotamd::response-file-save': [
    id: string,
    filename: string,
    pathname: string,
    markdown: string,
    options: SaveOptions,
    defaultPath: string
  ]
  'annotamd::response-file-save-as': [
    id: string,
    filename: string,
    pathname: string,
    markdown: string,
    options: SaveOptions,
    defaultPath: string
  ]
  'annotamd::response-print': []
  'annotamd::rg::cancel': [searchId: string]
  'annotamd::save-and-close-tabs': [tabs: unknown[]]
  'annotamd::save-tabs': [tabs: unknown[]]
  'annotamd::select-default-directory-to-open': []
  'annotamd::set-user-data': [partial: unknown]
  'annotamd::set-user-preference': [partial: unknown]
  'annotamd::shell::open-external': [url: string]
  'annotamd::shell::show-item': [fullPath: string]
  'annotamd::update-format-menu': [windowId: number, state: Record<string, boolean>]
  'annotamd::update-line-ending-menu': [windowId: number, lineEnding: LineEnding]
  'annotamd::update-sidebar-menu': [windowId: number, visible: boolean]
  'annotamd::view-layout-changed': [windowId: number, layout: unknown]
  'annotamd::win::close': []
  'annotamd::win::maximize': []
  'annotamd::win::minimize': []
  'annotamd::win::set-fullscreen': [flag: boolean]
  'annotamd::win::toggle-fullscreen': []
  'annotamd::win::toggle-maximize': []
  'annotamd::win::unmaximize': []
  'annotamd::window-add-file-path': [windowId: number, filePath: string]
  'annotamd::window-initialized': []
  'annotamd::window-tab-closed': [pathname: string]
  'annotamd::window-toggle-always-on-top': []
  'annotamd::window::drop': [payload: unknown]
  'screen-capture': [payload: unknown]
  'set-image-folder-path': [path: string]
  'set-user-preference': [partial: unknown]
  'watcher-unwatch-all-by-id': [windowId: number]
  'watcher-unwatch-directory': [windowId: number, path: string]
  'watcher-unwatch-file': [windowId: number, path: string]
  'watcher-watch-directory': [windowId: number, path: string]
  'watcher-watch-file': [windowId: number, path: string]
  'window-add-file-path': [windowId: number, filePath: string]
  'window-change-file-path': [windowId: number, oldPath: string, newPath: string]
  'window-close-by-id': [windowId: number]
  'window-file-saved': [windowId: number, tabId: string]
  'window-reload-by-id': [windowId: number]
  'window-toggle-always-on-top': [windowId: number]
}

// =================================================================
// Sync channels (synchronous renderer → main)
// =================================================================

export interface IpcSyncChannels {
  'annotamd::boot-info': { args: []; ret: BootInfo }
  'annotamd::paths::is-same-sync': { args: [a: string, b: string]; ret: boolean }
}

// =================================================================
// Push events (main → renderer, listened on ipcRenderer.on)
// =================================================================

export interface IpcMainEventChannels {
  'annotamd::comments::changed': [filePath: string]
  'annotamd::comments::mcp-status-changed': [status: AnnotaMDMcpStatus]
  'language-changed': [language: string]
  'annotamd::update:state': [state: AppUpdateState]
  'annotamd::about-dialog': []
  'annotamd::ask-for-close': []
  'annotamd::bootstrap-editor': [config: BootstrapEditorConfig]
  'annotamd::cm-copy-as-html': []
  'annotamd::cm-copy-as-rich': []
  'annotamd::cm-insert-paragraph': [direction: 'before' | 'after']
  'annotamd::cm-paste-as-plain-text': []
  'annotamd::current-language': [language: string]
  'annotamd::editor-ask-file-save': []
  'annotamd::editor-ask-file-save-as': []
  'annotamd::editor-close-tab': [tabId?: string]
  'annotamd::editor-edit-action': [action: string]
  'annotamd::editor-format-action': [payload: { type: string }]
  'annotamd::editor-move-file': []
  'annotamd::editor-paragraph-action': [payload: { type: string }]
  'annotamd::editor-rename-file': []
  'annotamd::execute-command-by-id': [commandId: string]
  'annotamd::export-success': [payload: { type: string; filePath: string }]
  'annotamd::file-saved': [tabId: string]
  'annotamd::force-close-tabs-by-id': [tabIds: string[]]
  'annotamd::invalidate-image-cache': []
  'annotamd::keybindings-response': [bindings: unknown]
  'annotamd::load-state': [state: BufferedStateType]
  'annotamd::menu::click': [menuId: string]
  'annotamd::menu::closed': []
  'annotamd::new-untitled-tab': [selected?: boolean, markdown?: string]
  'annotamd::open-directory': [directoryPath: string]
  'annotamd::remove-directory': [directoryPath: string]
  'annotamd::open-new-tab': [
    markdownDocument: MarkdownDocument | null,
    options?: TabOptions,
    selected?: boolean
  ]
  'annotamd::pandoc-not-exists': [opts: Record<string, unknown>]
  'annotamd::print-service-clearup': []
  'annotamd::rg::cancelled': [payload: unknown]
  'annotamd::rg::done': [payload: unknown]
  'annotamd::rg::error': [payload: unknown]
  'annotamd::rg::match': [payload: unknown]
  'annotamd::rg::progress': [payload: unknown]
  'annotamd::screenshot-captured': [filePath: string]
  'annotamd::set-line-ending': [lineEnding: LineEnding]
  'annotamd::set-pathname': [payload: { id: string; pathname: string; filename: string }]
  'annotamd::set-view-layout': [layout: unknown]
  'annotamd::show-command-palette': []
  'annotamd::show-export-dialog': [type: ExportType]
  'annotamd::show-notification': [payload: unknown]
  'annotamd::spelling-replace-misspelling': [payload: unknown]
  'annotamd::spelling-show-switch-language': []
  'annotamd::switch-tab-by-file_path': [filePath: string]
  'annotamd::switch-tab-by-index': [index: number]
  'annotamd::tab-save-failure': [tabId: string, message: string]
  'annotamd::tab-saved': [tabId: string]
  'annotamd::tabs-cycle-left': []
  'annotamd::tabs-cycle-right': []
  'annotamd::toggle-view-layout-entry': [entry: string]
  'annotamd::toggle-view-mode-entry': [entry: string]
  'annotamd::update-file': [payload: { type: 'add' | 'change' | 'unlink'; change: FileChangeDetail }]
  'annotamd::update-object-tree': [payload: unknown]
  'annotamd::update-object-tree-batch': [payload: unknown]
  'annotamd::user-preference': [partial: unknown]
  'annotamd::window-active-status': [active: boolean]
  'annotamd::window-enter-full-screen': []
  'annotamd::window-leave-full-screen': []
  'annotamd::window-maximize': []
  'annotamd::window-unmaximize': []
  'annotamd::window-zoom': [zoomLevel: number]
  'settings::change-tab': [tab: string]
}

// =================================================================
// Auxiliary types
// =================================================================

/**
 * Snapshot of the active OS keyboard layout, returned by
 * `annotamd::keybinding-get-keyboard-info`. Mirrors the runtime shape produced
 * by `native-keymap` (see `src/main/keyboard/index.ts#getKeyboardInfo`).
 */
export interface KeyboardInfo {
  layout: IKeyboardLayoutInfo
  keymap: IKeyboardMapping
}

export interface BootInfo {
  platform: NodeJS.Platform
  arch: string
  versions: Record<string, string>
  env: Record<string, string>
  paths: {
    resources: string
    userData: string
    cwd: string
    ripgrepBinary: string
  }
  isUpdatable: boolean
  MARKDOWN_INCLUSIONS: string[]
}

// =================================================================
// Helper types for the preload bridge generic wrappers
// =================================================================

export type InvokeArgs<K extends keyof IpcInvokeChannels> = IpcInvokeChannels[K]['args']
export type InvokeRet<K extends keyof IpcInvokeChannels> = IpcInvokeChannels[K]['ret']

export type SyncArgs<K extends keyof IpcSyncChannels> = IpcSyncChannels[K]['args']
export type SyncRet<K extends keyof IpcSyncChannels> = IpcSyncChannels[K]['ret']

export type SendArgs<K extends keyof IpcSendChannels> = IpcSendChannels[K]

export type EventArgs<K extends keyof IpcMainEventChannels> = IpcMainEventChannels[K]
