import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const menus: MockMenu[] = []

  class MockMenuItem {
    id?: string
    label?: string
    enabled = true
    click?: () => void

    constructor(options: Record<string, unknown>) {
      Object.assign(this, options)
    }
  }

  class MockMenu {
    items: MockMenuItem[] = []
    popup = vi.fn()

    constructor() {
      menus.push(this)
    }

    append(item: MockMenuItem) {
      this.items.push(item)
    }
  }

  return {
    menus,
    Menu: MockMenu,
    MenuItem: MockMenuItem,
    nativeImage: {
      createFromDataURL: vi.fn(() => ({ setTemplateImage: vi.fn() }))
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) }
  }
})

vi.mock('electron', () => electronMocks)
vi.mock('../../../src/main/i18n', () => ({
  t: (key: string) => ({
    'contextMenu.copyImage': 'Copy Image',
    'contextMenu.downloadImage': 'Download Image'
  })[key] ?? key
}))

import { showEditorContextMenu } from '../../../src/main/contextMenu/editor'

describe('image context menu', () => {
  beforeEach(() => {
    electronMocks.menus.length = 0
    vi.clearAllMocks()
  })

  it('shows only copy image and download image for a rendered image', () => {
    const copyImageAt = vi.fn()
    const downloadURL = vi.fn()
    const win = { webContents: { copyImageAt, downloadURL } }
    const preventDefault = vi.fn()

    showEditorContextMenu(win as never, { preventDefault }, {
      x: 120,
      y: 80,
      mediaType: 'image',
      srcURL: 'file:///tmp/photo.png',
      hasImageContents: true,
      isEditable: true,
      selectionText: '',
      editFlags: { canCut: false, canCopy: false, canPaste: false, canEditRichly: true }
    }, false)

    const menu = electronMocks.menus.at(-1)!
    expect(menu.items.map(item => item.id)).toEqual([
      'copyImageMenuItem',
      'downloadImageMenuItem'
    ])
    expect(menu.items.map(item => item.label)).toEqual(['Copy Image', 'Download Image'])
    expect(menu.popup).toHaveBeenCalledWith({ window: win, x: 120, y: 80 })
    expect(preventDefault).toHaveBeenCalledOnce()

    menu.items[0].click?.()
    menu.items[1].click?.()

    expect(copyImageAt).toHaveBeenCalledWith(120, 80)
    expect(downloadURL).toHaveBeenCalledWith('file:///tmp/photo.png')
  })
})
