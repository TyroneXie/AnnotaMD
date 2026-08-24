import { expect, test } from '@playwright/test'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launchWithMarkdown } from './helpers'

const LOCAL_IMAGE_PATH = resolve(__dirname, '../../static/logo-96px.png')

test('image right-click menu copies and downloads the original image', async() => {
  const downloadPath = join(tmpdir(), `annotamd-context-image-${Date.now()}.png`)
  const { app, page } = await launchWithMarkdown(`![context image](${LOCAL_IMAGE_PATH})\n`)
  try {
    const image = page.locator('.editor-component .mu-inline-image.mu-image-success img')
    await image.waitFor({ state: 'visible', timeout: 15000 })
    await app.evaluate(({ BrowserWindow, Menu, clipboard }) => {
      const state = {
        action: 'copy' as 'copy' | 'download',
        labels: [] as string[]
      }
      ;(global as typeof global & { __annotamdImageContextMenu?: typeof state })
        .__annotamdImageContextMenu = state
      Menu.prototype.popup = function() {
        state.labels = this.items.map(item => item.label)
        const win = BrowserWindow.getAllWindows()[0]
        const item = this.getMenuItemById(`${state.action}ImageMenuItem`)
        item?.click(undefined, win, undefined)
      }
      clipboard.clear()
    })

    await image.click({ button: 'right' })

    await expect.poll(() => app.evaluate(() => {
      const state = (global as typeof global & {
        __annotamdImageContextMenu?: { labels: string[] }
      }).__annotamdImageContextMenu
      return state?.labels ?? []
    })).toEqual(['Copy Image', 'Download Image'])
    await expect.poll(() => app.evaluate(({ clipboard }) => {
      const copied = clipboard.readImage()
      return copied.isEmpty() ? null : copied.getSize()
    })).toEqual({ width: 96, height: 96 })

    await app.evaluate(({ BrowserWindow }, savePath) => {
      const state = (global as typeof global & {
        __annotamdImageContextMenu?: { action: 'copy' | 'download' }
      }).__annotamdImageContextMenu
      if (state) state.action = 'download'
      BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
        item.setSavePath(savePath)
      })
    }, downloadPath)
    await image.click({ button: 'right' })

    await expect.poll(() => existsSync(downloadPath)).toBe(true)
  } finally {
    await app.close()
    rmSync(downloadPath, { force: true })
  }
})
