import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown, setSourceMarkdown } from './helpers'

const prepareLastHeading = async(page: Page) => {
  const content = page.locator('.mu-atxheading-content').last()
  await content.click()
  await content.evaluate((node) => {
    const block = (node as HTMLElement & {
      __MUYA_BLOCK__: {
        text: string
        setCursor(start: number, end: number, render: boolean): void
      }
    }).__MUYA_BLOCK__
    block.text = block.text.replace(/^( {0,3}#{1,6}).*$/, '$1 ')
    block.setCursor(block.text.length, block.text.length, true)
  })
  return content
}

test.describe('Smart heading numbering', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown([
      '# 1. Parent',
      '',
      '## 1.1. First child',
      '',
      '### 1.1.1. Detail',
      '',
      '## placeholder'
    ].join('\n'))
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('increments the previous same-level number after Space', async() => {
    const content = await prepareLastHeading(page)
    await page.keyboard.type('9. Numbered child', { delay: 10 })

    await expect(content.locator('.mu-heading-number')).toHaveText('1.2.')
    await expect(content.locator('.mu-heading-number-gap')).toContainText(' ')
    expect(await content.locator('.mu-heading-number').evaluate(
      node => getComputedStyle(node).marginInlineEnd
    )).not.toBe('0px')
    expect(await getMarkdownContent(page, app)).toContain('## 1.2. Numbered child')
  })

  test('keeps the typed child value under a new numbered parent', async() => {
    await setSourceMarkdown(page, app, [
      '# 1. Parent',
      '',
      '## 1.1. First child',
      '',
      '# 2. New parent',
      '',
      '## placeholder'
    ].join('\n'))
    const content = await prepareLastHeading(page)
    await page.keyboard.type('7. New child', { delay: 10 })

    await expect(content.locator('.mu-heading-number')).toHaveText('2.7.')
    expect(await getMarkdownContent(page, app)).toContain('## 2.7. New child')
  })

  test('accepts a Chinese full stop and exposes the normalized number as a control', async() => {
    await setSourceMarkdown(page, app, [
      '# 1. Parent',
      '',
      '## placeholder'
    ].join('\n'))
    const content = await prepareLastHeading(page)
    await page.keyboard.insertText('1.1。')
    await page.keyboard.press('Space')
    await page.keyboard.insertText('Chinese punctuation')
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))

    const number = content.locator('.mu-heading-number')
    await expect(number).toHaveText('1.1.')
    await expect(number).toHaveAttribute('role', 'button')
    await expect(number).toHaveAttribute('aria-label', /Set Number|设置编号/)
    expect(await number.evaluate(node => getComputedStyle(node).cursor)).toBe('pointer')
    expect(await getMarkdownContent(page, app)).toContain('## 1.1. Chinese punctuation')

    await number.click()
    expect(await number.evaluate(node => document.activeElement === node)).toBe(true)
    const menu = page.locator('.mu-heading-number-menu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('button.continue')).toBeDisabled()
    await expect(menu.locator('button.restart')).toBeDisabled()
    await expect(menu.locator('button.set-value')).toBeEnabled()
    expect(await getMarkdownContent(page, app)).toContain('## 1.1. Chinese punctuation')
  })

  test('continues, restarts and explicitly sets a heading number', async() => {
    await setSourceMarkdown(page, app, '# 1. First\n\n# 4. Broken\n')
    let number = page.locator('.mu-heading-number').last()
    await number.click()
    const menu = page.locator('.mu-heading-number-menu')
    await menu.locator('button.continue').click()
    await expect.poll(() => getMarkdownContent(page, app)).toContain('# 2. Broken')

    number = page.locator('.mu-heading-number').last()
    await number.click()
    await menu.locator('button.restart').click()
    await expect.poll(() => getMarkdownContent(page, app)).toContain('# 1. Broken')

    await setSourceMarkdown(page, app, '# 3. Parent\n\n## 3.2. Child\n')
    number = page.locator('.mu-heading-number').last()
    await number.click()
    await menu.locator('button.set-value').click()
    const input = menu.locator('.mu-heading-number-value-input')
    await input.fill('7')
    await menu.locator('.confirm').click()
    await expect.poll(() => getMarkdownContent(page, app)).toContain('## 3.7. Child')
  })
})
