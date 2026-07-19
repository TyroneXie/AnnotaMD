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

  test('starts from the numbered parent after a higher-level heading', async() => {
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

    await expect(content.locator('.mu-heading-number')).toHaveText('2.1.')
    expect(await getMarkdownContent(page, app)).toContain('## 2.1. New child')
  })

  test('accepts a Chinese full stop and exposes the normalized number as a control', async() => {
    await setSourceMarkdown(page, app, [
      '# 1. Parent',
      '',
      '## placeholder'
    ].join('\n'))
    const content = await prepareLastHeading(page)
    await page.keyboard.insertText('9.9。')
    await page.keyboard.press('Space')
    await page.keyboard.insertText('Chinese punctuation')

    const number = content.locator('.mu-heading-number')
    await expect(number).toHaveText('1.1.')
    await expect(number).toHaveAttribute('role', 'button')
    await expect(number).toHaveAttribute('aria-label', /Set Number|设置编号/)
    expect(await number.evaluate(node => getComputedStyle(node).cursor)).toBe('pointer')
    expect(await getMarkdownContent(page, app)).toContain('## 1.1. Chinese punctuation')

    await number.click()
    expect(await number.evaluate(node => document.activeElement === node)).toBe(true)
    expect(await getMarkdownContent(page, app)).toContain('## 1.1. Chinese punctuation')
  })
})
