import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    }
  })
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (path: string) => string }
      electron?: {
        clipboard: { writeText: (text: string) => void }
        ipcRenderer: { send: (...args: unknown[]) => void; on: (...args: unknown[]) => void }
      }
    }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (path: string) => path }
  w.window.electron ??= {
    clipboard: { writeText: () => {} },
    ipcRenderer: { send: () => {}, on: () => {} }
  }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'

describe('first opened file tab visibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows the tab bar before the first file is added', () => {
    const editorStore = useEditorStore()
    const layoutStore = useLayoutStore()
    layoutStore.showTabBar = false

    expect(editorStore.tabs).toHaveLength(0)
    editorStore.SHOW_TAB_VIEW(false)

    expect(layoutStore.showTabBar).toBe(true)
  })
})
