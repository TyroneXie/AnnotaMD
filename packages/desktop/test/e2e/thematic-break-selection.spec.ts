import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown } from './helpers'

test.describe('Thematic break block selection', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('Before\n\n---\n\nAfter\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('keeps the Markdown marker hidden and shows a dedicated selected block', async() => {
    const rule = page.locator('.mu-thematic-break')
    const content = rule.locator('.mu-thematic-break-content')

    await rule.click()
    await expect(rule).toHaveClass(/mu-active/)
    expect(await content.evaluate(node => getComputedStyle(node).opacity)).toBe('0')
    expect(await rule.evaluate(node => getComputedStyle(node, '::before').height)).toBe('24px')
    expect(await rule.evaluate(node => getComputedStyle(node, '::before').borderRadius)).toBe('6px')

    await rule.hover()
    await expect(page.locator('.mu-icon-wrapper.thematic-break')).toBeVisible()
    expect(await getMarkdownContent(page, app)).toContain('\n---\n')
  })
})
