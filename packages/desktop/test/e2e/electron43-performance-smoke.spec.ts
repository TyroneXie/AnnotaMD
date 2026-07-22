import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  launchElectron,
  launchWithMarkdown,
  getMarkdownContent,
  getRendererErrors,
  placeCaretInEditor,
  waitForEditor
} from './helpers'

test.describe('Electron 43 performance smoke', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const configuredDocument = process.env.ANNOTAMD_PERF_DOCUMENT
    const launched = configuredDocument
      ? await launchElectron([configuredDocument], { suppressErrorDialog: true })
      : await launchWithMarkdown(
        '# Electron 43\n\nPerformance smoke.\n',
        { suppressErrorDialog: true }
      )
    ;({ app, page } = launched)
    if (configuredDocument) await waitForEditor(page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('loads the lazy editor route', async() => {
    const errors = await getRendererErrors(app)
    const electronVersion = await app.evaluate(() => process.versions.electron)
    const windowVisible = await app.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
    })

    await expect(page.locator('.editor-component')).toBeAttached({ timeout: 15000 })
    expect(electronVersion).toBe('43.1.1')
    expect(windowVisible).toBe(true)
    expect(errors).toEqual([])
  })

  test('loads the lazy preference route', async() => {
    const settingWindowPromise = app.waitForEvent('window')
    await page.evaluate(() => {
      ;(window as unknown as {
        electron: { ipcRenderer: { send: (channel: string) => void } }
      }).electron.ipcRenderer.send('annotamd::open-setting-window')
    })
    const settingPage = await settingWindowPromise

    await expect(settingPage.locator('.pref-container')).toBeAttached({ timeout: 15000 })
    await expect(settingPage.locator('.pref-general')).toBeAttached({ timeout: 15000 })

    const preferenceFont = await settingPage.locator('.pref-container').evaluate(element => {
      return getComputedStyle(element).fontFamily
    })
    expect(preferenceFont).toContain('SF Pro Text')

    await settingPage.locator('.pref-sidebar .item').filter({ hasText: 'Agent' }).click()
    await expect(settingPage.locator('.pref-agent')).toBeAttached({ timeout: 15000 })
    await settingPage.waitForTimeout(1000)

    const fontAfterLazyRoute = await settingPage.locator('.pref-container').evaluate(element => {
      return getComputedStyle(element).fontFamily
    })
    expect(fontAfterLazyRoute).toBe(preferenceFont)
  })

  test('starts the default-enabled MCP bridge', async() => {
    const status = await page.evaluate(() => {
      return (window as unknown as {
        electron: {
          ipcRenderer: {
            invoke: (channel: 'annotamd::comments::mcp-status') => Promise<{
              enabled: boolean
              running: boolean
              clients: unknown[]
            }>
          }
        }
      }).electron.ipcRenderer.invoke('annotamd::comments::mcp-status')
    })

    expect(status).toEqual({ enabled: true, running: true, clients: [] })
  })

  test('flushes asynchronous main-process logs', async() => {
    const userDataPath = await app.evaluate(({ app }) => app.getPath('userData'))
    const now = new Date()
    const logPath = join(
      userDataPath,
      'logs',
      `${now.getFullYear()}${now.getMonth() + 1}`,
      'main.log'
    )

    await expect.poll(async() => {
      try {
        return (await readFile(logPath)).byteLength
      } catch {
        return 0
      }
    }).toBeGreaterThan(0)
  })

  test('serializes the json-change snapshot after input', async() => {
    test.skip(!!process.env.ANNOTAMD_PERF_DOCUMENT, 'configured performance documents are read-only')
    await placeCaretInEditor(page)
    await page.keyboard.type(' typed-token')
    await page.waitForTimeout(300)

    await expect.poll(() => getMarkdownContent(page, app)).toContain('typed-token')
  })
})
