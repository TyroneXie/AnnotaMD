import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron, launchWithMarkdown, sendIpcToRenderer } from './helpers'

test.describe('application update indicator', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const realDocument = process.env.ANNOTAMD_UPDATE_DOCUMENT
    const launched = realDocument
      ? await launchElectron([realDocument])
      : await launchWithMarkdown('# Update indicator\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('shows available, progress and restart states above Settings', async() => {
    const currentVersion = '2.11.0'
    const updateButton = page.locator('.app-update-sidebar')
    await expect(updateButton).toHaveCount(0)
    await sendIpcToRenderer(app, 'mt::update:state', {
      status: 'error',
      currentVersion,
      message: 'offline'
    })
    await expect(updateButton).toHaveCount(0)

    await sendIpcToRenderer(app, 'mt::update:state', {
      status: 'available',
      currentVersion,
      version: '2.12.0'
    })

    const settingsButton = page.locator('.left-column .bottom li').last()
    await expect(updateButton).toBeVisible()
    await expect(updateButton).toHaveAttribute('aria-label', 'AnnotaMD 2.12.0 is available.')
    await expect(settingsButton).toBeVisible()

    const updateBox = await updateButton.boundingBox()
    const settingsBox = await settingsButton.boundingBox()
    expect(updateBox).not.toBeNull()
    expect(settingsBox).not.toBeNull()
    expect(updateBox!.y + updateBox!.height).toBeLessThanOrEqual(settingsBox!.y)
    if (process.env.ANNOTAMD_UPDATE_SCREENSHOT) {
      await page.screenshot({ path: process.env.ANNOTAMD_UPDATE_SCREENSHOT })
    }

    await sendIpcToRenderer(app, 'mt::update:state', {
      status: 'downloading',
      currentVersion,
      version: '2.12.0',
      progress: 47
    })
    await expect(updateButton.locator('.app-update-sidebar-progress')).toHaveText('47')

    await sendIpcToRenderer(app, 'mt::update:state', {
      status: 'downloaded',
      currentVersion,
      version: '2.12.0',
      progress: 100
    })
    await expect(updateButton).toHaveAttribute(
      'aria-label',
      'AnnotaMD 2.12.0 is ready. Restart to install it.'
    )
  })

  test('shows the same update state in General settings', async() => {
    await app.evaluate(({ ipcMain }) => ipcMain.emit('app-create-settings-window', 'general'))
    await expect.poll(() => app.windows().length, { timeout: 5000 }).toBeGreaterThan(1)
    const settingsPage = app.windows().find((candidate) => candidate !== page)
    expect(settingsPage).toBeDefined()
    await settingsPage!.waitForLoadState('domcontentloaded')
    const automaticDownload = settingsPage!
      .locator('.pref-switch-item')
      .filter({ hasText: 'Automatically download updates' })
    await expect(automaticDownload.locator('input')).toBeChecked()
    await automaticDownload.locator('.el-switch').click()
    await expect(automaticDownload.locator('input')).not.toBeChecked()
    await settingsPage!.reload()
    const persistedAutomaticDownload = settingsPage!
      .locator('.pref-switch-item')
      .filter({ hasText: 'Automatically download updates' })
    await expect(persistedAutomaticDownload.locator('input')).not.toBeChecked()
    await persistedAutomaticDownload.locator('.el-switch').click()
    await expect(persistedAutomaticDownload.locator('input')).toBeChecked()
    await expect(settingsPage!.locator('.app-update-panel')).toContainText(
      'This package cannot update itself.'
    )

    await app.evaluate(({ BrowserWindow }) => {
      const settingsWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('/preference')
      )
      settingsWindow?.webContents.send('mt::update:state', {
        status: 'available',
        currentVersion: '2.11.0',
        version: '2.12.0'
      })
    })

    await expect(settingsPage!.locator('.app-update-panel')).toContainText('Current version: 2.11.0')
    await expect(settingsPage!.locator('.app-update-panel')).toContainText(
      'AnnotaMD 2.12.0 is available.'
    )
    await expect(settingsPage!.locator('.app-update-panel button')).toContainText('Download update')

    if (process.env.ANNOTAMD_UPDATE_SETTINGS_SCREENSHOT) {
      await settingsPage!.locator('.app-update-panel').scrollIntoViewIfNeeded()
      await settingsPage!.screenshot({ path: process.env.ANNOTAMD_UPDATE_SETTINGS_SCREENSHOT })
    }
  })
})
