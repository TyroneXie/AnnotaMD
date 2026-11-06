import { test, expect, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { readFileSync } from 'node:fs'
import { launchWithMarkdown, sendIpcToRenderer, waitForEditor, expectNoRendererErrors } from './helpers'

const markdown = '# Responsive document\n\nThe document text should use the available editor width as the window grows.\n'

async function openAppearance(app: ElectronApplication) {
  const pending = app.waitForEvent('window')
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.items.flatMap(i => i.submenu?.items ?? [])
      .find(i => i.accelerator === (process.platform === 'darwin' ? 'Command+,' : 'Ctrl+,'))
    if (!item) throw new Error('Preferences command missing')
    item.click()
  })
  const settings = await pending
  await settings.waitForLoadState('domcontentloaded')
  const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL || settings.url())
  url.search = new URL(settings.url()).search
  url.hash = '/preference/theme'
  await settings.goto(url.href)
  await expect(settings.locator('.pref-theme')).toBeVisible()
  return settings
}

const width = (page: Page) => page.locator('.editor-component .mu-container').evaluate(el => el.getBoundingClientRect().width)

async function resize(app: ElectronApplication, page: Page, size: number) {
  const id = Number(new URL(page.url()).searchParams.get('wid'))
  await app.evaluate(({ BrowserWindow }, args) => BrowserWindow.fromId(args.id)!.setSize(args.size, 950), {id, size})
}

test('a single saved side-margin value controls the responsive document', async () => {
  test.setTimeout(90000)
  const document = process.env.ANNOTAMD_QA_DOCUMENT ? readFileSync(process.env.ANNOTAMD_QA_DOCUMENT, 'utf8') : markdown
  const { app, page } = await launchWithMarkdown(document, {suppressErrorDialog: true})
  try {
    if (process.env.ANNOTAMD_TEST_RENDERER_URL) {
      const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL)
      const current = new URL(page.url())
      url.search = current.search
      url.hash = current.hash
      await page.goto(url.href)
      await page.waitForSelector('.editor-placeholder')
      await sendIpcToRenderer(app, 'annotamd::bootstrap-editor', {
        addBlankTab: false, markdownList: [document], lineEnding: 'lf',
        sideBarVisibility: true, tabBarVisibility: true, sourceCodeModeEnabled: false
      })
      await waitForEditor(page)
    }
    let settings = await openAppearance(app)
    const input = () => settings.locator('.pref-range-item').filter({hasText: /Side margins|左右留白/}).locator('input')
    await expect(input()).toBeEnabled()
    await expect(input()).toHaveValue('56')
    await expect(settings.getByText(/Fit document width to window|正文宽度随窗口变化/)).toHaveCount(0)
    const padding = () => page.locator('.editor-component .mu-container').evaluate(el => {
      const css = getComputedStyle(el)
      return [parseFloat(css.paddingLeft), parseFloat(css.paddingRight)]
    })
    await expect.poll(padding).toEqual([56, 56])
    await resize(app, page, 1100)
    const narrow = await width(page)
    await resize(app, page, 1650)
    await expect.poll(() => width(page)).toBeGreaterThan(narrow + 300)
    await expect.poll(padding).toEqual([56, 56])
    await settings.bringToFront()
    await input().fill('80')
    await input().press('Tab')
    await expect.poll(padding).toEqual([80, 80])
    await settings.close()
    settings = await openAppearance(app)
    await expect(input()).toHaveValue('80')
    await settings.screenshot({path:'/tmp/annotamd-margin-settings.png'})
    await settings.close()
    await page.screenshot({path:'/tmp/annotamd-margin-document.png'})
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
