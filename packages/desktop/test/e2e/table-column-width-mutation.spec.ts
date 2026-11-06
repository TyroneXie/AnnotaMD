import { test, expect, type Page } from '@playwright/test'
import { launchWithMarkdown, sendIpcToRenderer, waitForEditor, expectNoRendererErrors } from './helpers'

const markdown = '# Table column deletion\n\n| Task | | Explanation |\n| --- | --- | --- |\n| A | | 原：多次取图、识图，具体慢因未完全确认；本次仍需识图，长耗时未复现。 |\n| B | | 原：多次列媒体，并出现五次错误；本次工具回执未见同类报错。 |\n\nAfter table\n'

async function geometry(page: Page) {
  return page.locator('.editor-component table').evaluate(table => ({
    widths: [...table.querySelectorAll('tr:first-child > *')].map(cell => cell.getBoundingClientRect().width),
    height: table.getBoundingClientRect().height,
    staleWidths: table.querySelectorAll('colgroup[data-muya-column-widths]').length
  }))
}

test('deleting a resized blank column reflows the surviving text and supports undo', async () => {
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    if (process.env.ANNOTAMD_TEST_RENDERER_URL) {
      const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL)
      const current = new URL(page.url())
      url.search = current.search
      url.hash = current.hash
      await page.goto(url.href)
      await page.waitForSelector('.editor-placeholder')
      await sendIpcToRenderer(app, 'annotamd::bootstrap-editor', {
        addBlankTab: false, markdownList: [markdown], lineEnding: 'lf',
        sideBarVisibility: true, tabBarVisibility: true, sourceCodeModeEnabled: false
      })
      await waitForEditor(page)
    }
    const table = page.locator('.editor-component table')
    const emptyHeader = table.locator('tr').first().locator('th,td').nth(1)
    const box = (await emptyHeader.boundingBox())!
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2)
    const handle = page.locator('.mu-table-column-resize-handle[data-visible="true"]')
    await expect(handle).toBeVisible()
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 25, box.y + box.height / 2, {steps: 5})
    await page.mouse.up()
    expect((await geometry(page)).staleWidths).toBe(1)
    const resized = (await emptyHeader.boundingBox())!
    await page.mouse.move(resized.x + resized.width / 2, resized.y - 8)
    const bar = page.locator('.mu-table-drag-bar')
    await expect(bar.locator('..')).toHaveCSS('opacity', '1')
    await bar.click()
    const tools = page.locator('.mu-table-bar-tools li.item.remove')
    await tools.click()
    await expect(table.locator('tr').first().locator('th,td')).toHaveCount(2)
    const after = await geometry(page)
    expect(after.staleWidths).toBe(0)
    expect(after.widths[1]).toBeGreaterThan(200)
    expect(after.height).toBeLessThan(400)
    await expect(table).toContainText('具体慢因未完全确认')
    await expect.poll(() => page.evaluate(() => {
      const node = document.querySelector('.editor-component .mu-table-cell-content') as any
      return node.__MUYA_BLOCK__.muya.editor.jsonState.getState().find((b: any) => b.name === 'table').children[0].children.length
    })).toBe(2)
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const accel = process.platform === 'darwin' ? 'Command+Z' : 'Ctrl+Z'
      const undo = Menu.getApplicationMenu()?.items.flatMap(i => i.submenu?.items ?? []).find(i => i.accelerator === accel)
      if (!undo) throw new Error('Undo missing')
      const win = BrowserWindow.getAllWindows()[0]
      undo.click(undefined, win, win?.webContents)
    })
    await expect(table.locator('tr').first().locator('th,td')).toHaveCount(3)
    expect((await geometry(page)).height).toBeLessThan(400)
    await expectNoRendererErrors(app)
    await page.screenshot({path: '/tmp/annotamd-table-column-width-undo.png'})
    console.log('Geometry after deletion:', JSON.stringify(after))
  } finally { await app.close() }
})
