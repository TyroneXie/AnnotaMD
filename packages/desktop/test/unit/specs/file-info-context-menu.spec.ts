// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { popupContextMenu } = vi.hoisted(() => ({
  popupContextMenu: vi.fn()
}))

vi.mock('../../../src/renderer/src/contextMenu/popupMenu', () => ({
  popupContextMenu
}))

vi.mock('../../../src/renderer/src/i18n', () => ({
  t: (key: string) => key
}))

import { copyFileName, copyFilePath } from '../../../src/renderer/src/util/copyFileInfo'
import { showContextMenu as showSideBarContextMenu } from '../../../src/renderer/src/contextMenu/sideBar'
import { showContextMenu as showTabContextMenu } from '../../../src/renderer/src/contextMenu/tabs'

describe('file information context menu', () => {
  beforeEach(() => {
    popupContextMenu.mockReset()
    window.electron = {
      clipboard: {
        writeText: vi.fn()
      }
    } as unknown as typeof window.electron
    window.path = {
      basename: (pathname: string) => pathname.split('/').at(-1) ?? ''
    } as unknown as typeof window.path
  })

  it('copies a file name or its full path to the system clipboard', () => {
    const pathname = '/Users/test/Documents/design.md'

    copyFileName(pathname)
    copyFilePath(pathname)

    expect(window.electron.clipboard.writeText).toHaveBeenNthCalledWith(1, 'design.md')
    expect(window.electron.clipboard.writeText).toHaveBeenNthCalledWith(2, pathname)
  })

  it('includes copy-name and copy-path actions for tabs', () => {
    showTabContextMenu({ clientX: 10, clientY: 20 }, { id: 'tab-1', pathname: '/tmp/design.md' })

    const items = popupContextMenu.mock.calls[0][0]
    expect(items.map((item: { id?: string }) => item.id)).toEqual(
      expect.arrayContaining(['copyName', 'copyPath'])
    )
  })

  it('includes copy-name and copy-path actions for sidebar items', () => {
    showSideBarContextMenu({ clientX: 10, clientY: 20 }, false)

    const items = popupContextMenu.mock.calls[0][0]
    expect(items.map((item: { id?: string }) => item.id)).toEqual(
      expect.arrayContaining(['copyNameMenuItem', 'copyPathMenuItem'])
    )
  })
})
