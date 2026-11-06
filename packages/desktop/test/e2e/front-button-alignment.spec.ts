import { test, expect } from '@playwright/test'
import { launchWithMarkdown, sendIpcToRenderer, waitForEditor, expectNoRendererErrors } from './helpers'

const markdown = '# 一级标题\n\n## 二级标题\n\n段落首行对齐。' + '这是一段用于验证自动换行后菜单仍对齐第一行的正文。'.repeat(12)
  + '\n\n| 表头 A | 表头 B |\n| --- | --- |\n| 内容 | 表格正文 |\n\n- 无序列表\n\n1. 有序列表\n\n- [ ] 待办列表\n'

test('compact block menu buttons are anchored to block top edges', async () => {
  const { app, page } = await launchWithMarkdown(markdown, {suppressErrorDialog: true})
  try {
    if (process.env.ANNOTAMD_TEST_RENDERER_URL) {
      const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL)
      const current = new URL(page.url())
      url.search = current.search
      url.hash = current.hash
      await page.goto(url.href)
      await page.waitForSelector('.editor-placeholder')
      await sendIpcToRenderer(app, 'annotamd::bootstrap-editor', {
        addBlankTab: false, markdownList: [markdown], lineEnding: 'lf', sideBarVisibility: true,
        tabBarVisibility: true, sourceCodeModeEnabled: false
      })
      await waitForEditor(page)
    }
    for (const [selector, kind, label] of [
      ['.mu-atx-heading', 'heading', 'h1'],
      ['h2.mu-atx-heading', 'heading', 'h2'],
      ['.mu-paragraph', 'text', 'paragraph'],
      ['table', 'table', 'table'],
      ['li:has-text("无序列表")', 'bullet-list', 'bullet-list'],
      ['li:has-text("有序列表")', 'order-list', 'order-list'],
      ['li:has-text("待办列表")', 'task-list', 'task-list'],
    ]) {
      const target = page.locator(`.editor-component ${selector}`).first()
      await target.hover()
      const button = page.locator(`.mu-front-button-wrapper button.${kind}`)
      await expect(button).toBeVisible()
      await expect(button.locator('../..')).toHaveCSS('opacity', '1')
      const expected = await target.boundingBox()
      await expect.poll(async () => {
        const b = (await button.boundingBox())!
        return Math.abs(b.height - 24)
      }).toBeLessThan(1.5)
      const box = (await button.boundingBox())!
      expect(Math.abs(box.y - expected!.y)).toBeLessThan(1)
      if (kind.endsWith('list')) expect(box.x + box.width).toBeLessThan(expected!.x - 20)
      console.log(label, JSON.stringify({buttonTop:box.y,blockTop:expected!.y,height:box.height}))
      await page.screenshot({path:`/tmp/annotamd-front-button-${label}.png`})
      await button.click()
      await expect(page.locator('.mu-front-menu').locator('..')).toHaveCSS('opacity','1')
      await expect(page.locator('.mu-front-menu li.item.duplicate')).toHaveCount(0)
      await page.keyboard.press('Escape')
    }
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
