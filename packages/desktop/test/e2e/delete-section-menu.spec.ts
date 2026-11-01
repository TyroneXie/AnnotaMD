import { expect, test, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { expectNoRendererErrors, getMarkdownContent, launchWithMarkdown, sendIpcToRenderer, waitForEditor } from './helpers'

// Exercise current renderer source without changing the isolated main-process
// test profile or relying on a previous production build.
async function useDevRenderer(page: Page, app: ElectronApplication, markdown: string) {
  if (!process.env.ANNOTAMD_TEST_RENDERER_URL) return
  const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL)
  const current = new URL(page.url())
  url.search = current.search
  url.hash = current.hash
  await page.goto(url.href)
  await page.waitForSelector('.editor-placeholder')
  await sendIpcToRenderer(app, 'annotamd::bootstrap-editor', {
    addBlankTab: false,
    markdownList: [markdown],
    lineEnding: 'lf',
    sideBarVisibility: true,
    tabBarVisibility: true,
    sourceCodeModeEnabled: false
  })
  await waitForEditor(page)
}

async function openHeadingMenu(page: Page) {
  const heading = page.locator('.editor-component span.mu-atxheading-content').first()
  await expect(heading).toContainText('First')
  await heading.hover()
  await page.locator('.mu-front-button-wrapper button.heading').click()
  const menu = page.locator('.mu-front-menu')
  await expect(menu.locator('..')).toHaveCSS('opacity', '1')
  return menu.locator('li.item.delete-section')
}

const engineMarkdown = (page: Page) => page.evaluate(() => {
  for (const element of document.querySelectorAll('.editor-component *')) {
    const block = (element as HTMLElement & {
      __MUYA_BLOCK__?: { muya: { getMarkdown(): string } }
    }).__MUYA_BLOCK__
    if (block) return block.muya.getMarkdown().trim()
  }
  throw new Error('No editor block found')
})

for (const [name, markdown, remaining] of [
  ['nested section', '# First\n\nbody\n\n## Child\n\ndetail\n\n# Second\n\nkeep\n', '# Second\n\nkeep\n'],
  ['only heading', '# First\n', '']
]) {
  test(`deletes ${name} with real confirmation clicks and supports undo`, async() => {
    const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
    try {
      await useDevRenderer(page, app, markdown)
      const item = await openHeadingMenu(page)
      await item.click()
      await expect(item).toHaveClass(/confirming/)
      await expect(page.locator('.mu-front-menu').locator('..')).toHaveCSS('opacity', '1')
      await expect(page.locator('.editor-component')).toContainText('First')
      const box = await item.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight))

      await item.click()
      await expect(page.locator('.editor-component')).not.toContainText('First')
      await expect.poll(() => engineMarkdown(page)).toBe(remaining.trim())
      await sendIpcToRenderer(app, 'annotamd::editor-edit-action', 'undo')
      await expect(page.locator('.editor-component')).toContainText('First')
      await expect.poll(() => engineMarkdown(page)).toBe(markdown.trim())
      expect((await getMarkdownContent(page, app)).trim()).toBe(markdown.trim())
      await expectNoRendererErrors(app)
    } finally {
      await app.close()
    }
  })
}

test('cancelling confirmation does not arm the next menu opening', async() => {
  const markdown = '# First\n\nbody\n\n# Second\n\nkeep\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await useDevRenderer(page, app, markdown)
    for (const cancel of ['outside', 'escape']) {
      const item = await openHeadingMenu(page)
      await expect(item).not.toHaveClass(/confirming/)
      await item.click()
      await expect(item).toHaveClass(/confirming/)
      if (cancel === 'outside') {
        await page.locator('.editor-component .mu-paragraph').first().click()
      } else {
        await item.focus()
        await page.keyboard.press('Escape')
      }
      await expect(page.locator('.mu-front-menu').locator('..')).toHaveCSS('opacity', '0')
    }
    const item = await openHeadingMenu(page)
    await item.click()
    await expect(item).toHaveClass(/confirming/)
    await expect(page.locator('.editor-component')).toContainText('First')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
