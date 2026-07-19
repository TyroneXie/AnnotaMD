import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
  })
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (path: string) => string }
      fileUtils?: { isSamePathSync: (a: string, b: string) => boolean }
      electron?: { ipcRenderer: { send: (...args: unknown[]) => void; on: Mock } }
    }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (path: string) => path }
  w.window.fileUtils ??= { isSamePathSync: (a, b) => a === b }
  w.window.electron ??= { ipcRenderer: { send: () => {}, on: vi.fn() } }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))
vi.mock('@/store/bufferedState', () => ({ debouncedSendBufferedState: vi.fn() }))

import { useEditorStore } from '@/store/editor'
import { createDocumentState } from '@/store/help'

const repoRoot = resolve(__dirname, '../../../../..')

describe('missing file tab state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(window.electron.ipcRenderer.on as Mock).mockReset()
  })

  const makeTab = (store: ReturnType<typeof useEditorStore>) => {
    const tab = createDocumentState({
      filename: 'a.md',
      pathname: '/x/a.md',
      markdown: 'hello'
    }, 'tab-1')
    store.tabs = [tab]
    store.tabIdToIndex = { 'tab-1': 0 }
    return tab
  }

  const captureHandler = (channel: string) => {
    const call = (window.electron.ipcRenderer.on as Mock).mock.calls.find(
      (entry) => entry[0] === channel
    )!
    return call[1] as (event: unknown, payload: unknown) => void
  }

  it('marks an externally deleted file as missing without marking clean content dirty', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    store.LISTEN_FOR_FILE_CHANGE()

    captureHandler('mt::update-file')(null, {
      type: 'unlink',
      change: { pathname: '/x/a.md' }
    })

    expect(tab.isMissingOnDisk).toBe(true)
    expect(tab.isSaved).toBe(true)
    expect(tab.notifications[0]?.exclusiveType).toBe('file_changed')
  })

  it('reloads the same file when it is recreated even if its content is unchanged', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    tab.isMissingOnDisk = true
    tab.notifications.push({
      msg: 'missing',
      showConfirm: false,
      style: 'warn',
      exclusiveType: 'file_changed',
      action: () => {}
    })
    const loadSpy = vi.spyOn(store, 'loadChange')
    store.LISTEN_FOR_FILE_CHANGE()

    captureHandler('mt::update-file')(null, {
      type: 'add',
      change: { pathname: '/x/a.md', data: { filename: 'a.md', markdown: 'hello' } }
    })

    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(tab.isMissingOnDisk).toBe(false)
    expect(tab.notifications).toHaveLength(0)
  })

  it('replaces the deleted buffer with the recreated file content', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    tab.isMissingOnDisk = true
    store.LISTEN_FOR_FILE_CHANGE()

    captureHandler('mt::update-file')(null, {
      type: 'add',
      change: {
        pathname: '/x/a.md',
        data: { filename: 'a.md', markdown: 'rewritten by agent' }
      }
    })

    expect(tab.markdown).toBe('rewritten by agent')
    expect(tab.isMissingOnDisk).toBe(false)
    expect(tab.isSaved).toBe(true)
  })

  it('keeps edits in memory without auto-saving while the file is missing', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    tab.isMissingOnDisk = true
    const autoSaveSpy = vi.spyOn(store, 'HANDLE_AUTO_SAVE')

    store.LISTEN_FOR_CONTENT_CHANGE({ id: 'tab-1', markdown: 'accidental edit' })

    expect(tab.markdown).toBe('accidental edit')
    expect(tab.isSaved).toBe(false)
    expect(autoSaveSpy).not.toHaveBeenCalled()
  })

  it('clears the missing state after saving recreates the file', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    tab.isMissingOnDisk = true
    tab.notifications.push({
      msg: 'missing',
      showConfirm: false,
      style: 'warn',
      exclusiveType: 'file_changed',
      action: () => {}
    })
    store.LISTEN_FOR_SET_PATHNAME()

    captureHandler('mt::tab-saved')(null, 'tab-1')

    expect(tab.isMissingOnDisk).toBe(false)
    expect(tab.isSaved).toBe(true)
    expect(tab.notifications).toHaveLength(0)
  })

  it('persists the missing state in buffered tabs', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    tab.isMissingOnDisk = true

    expect(store.CREATE_BUFFERED_STATE()?.tabs[0]?.isMissingOnDisk).toBe(true)
  })

  it('renders missing filenames with a dedicated strike-through class', () => {
    const tabs = readFileSync(
      resolve(repoRoot, 'packages/desktop/src/renderer/src/components/editorWithTabs/tabs.vue'),
      'utf8'
    )

    expect(tabs).toContain("'missing-on-disk': file.isMissingOnDisk")
    expect(tabs).toContain('class="filename"')
    expect(tabs).toMatch(
      /li\.missing-on-disk > \.filename\s*\{[^}]*text-decoration-line:\s*line-through;/s
    )
  })
})
