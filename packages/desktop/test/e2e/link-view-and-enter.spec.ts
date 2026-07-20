import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { getMarkdownContent, launchWithMarkdown } from './helpers'

const URL = 'http://10.215.148.238:8008/xie_lt/dify-apps-create/-/releases'
const SELECTED_TEXT_HREF = 'dd'

const selectParagraphText = async(page: Page, text: string) => {
  await page.evaluate((selectedText) => {
    const root = document.querySelector('.editor-component') as HTMLElement | null
    const paragraph = root?.querySelector<HTMLElement>('span.mu-paragraph-content')
    if (!root || !paragraph) throw new Error('Paragraph text is unavailable')
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode() as Text | null
    while (textNode && !textNode.data.includes(selectedText))
      textNode = walker.nextNode() as Text | null
    if (!textNode) throw new Error('Selected text is unavailable')
    const start = textNode.data.indexOf(selectedText)
    root.focus()
    const range = document.createRange()
    range.setStart(textNode, start)
    range.setEnd(textNode, start + selectedText.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
  }, text)
  await page.waitForTimeout(150)
}

test.describe('Link view and Enter boundaries', () => {
  let app: ElectronApplication
  let page: Page
  let titleServer: Server | undefined

  test.afterEach(async() => {
    if (app) await app.close()
    if (titleServer) {
      const server = titleServer
      titleServer = undefined
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  test('a link created from selected text does not expose the view selector', async() => {
    const launched = await launchWithMarkdown('前文 发发发 后文\n')
    app = launched.app
    page = launched.page

    await selectParagraphText(page, '发发发')
    const toolbar = page.locator('.mu-format-picker')
    await expect(toolbar).toBeVisible()
    await toolbar.locator('li.link').evaluate((item: HTMLElement) => item.click())
    const linkInput = toolbar.locator('.mu-link-create-input')
    await expect(linkInput).toBeVisible()
    await linkInput.fill(SELECTED_TEXT_HREF)
    const confirm = toolbar.locator('.mu-link-create-confirm')
    await expect(confirm).toBeEnabled()
    await confirm.evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.locator('span.mu-link')).toContainText('发发发')
    await expect(page.locator('.mu-link-title-icon-shell')).toHaveCount(0)
    expect(await getMarkdownContent(page, app)).toContain(`[发发发](${SELECTED_TEXT_HREF})`)

    const link = page.locator('span.mu-link')
    await link.hover()
    const popover = page.locator('.mu-link-tools-container')
    await expect(popover.locator('.view-selector-button')).toHaveCount(0)
  })

  test('an existing text link loaded from Markdown does not expose the view selector', async() => {
    const launched = await launchWithMarkdown(`[发发发](${SELECTED_TEXT_HREF})\n`)
    app = launched.app
    page = launched.page

    await page.locator('span.mu-link').hover()
    await expect(page.locator('.mu-link-title-icon-shell')).toHaveCount(0)
    const popover = page.locator('.mu-link-tools-container')
    await expect(popover.locator('.view-selector-button')).toHaveCount(0)
  })

  test('the hover toolbar survives rapid link changes and pointer crossing', async() => {
    const launched = await launchWithMarkdown(
      '[First](https://first.example) and [Second](https://second.example)\n'
    )
    app = launched.app
    page = launched.page

    const links = page.locator('span.mu-link')
    const popover = page.locator('.mu-link-tools-container')
    await links.nth(0).evaluate((first) => {
      first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await expect(popover.locator('.link-address-text')).toHaveText('https://first.example')

    // Native event order is mouseout(first) -> mouseover(second). The first
    // event schedules a delayed hide; the second must cancel that stale timer.
    await page.evaluate(() => {
      const [first, second] = document.querySelectorAll('span.mu-link')
      first.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: second }))
      second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: first }))
    })
    await expect(popover.locator('.link-address-text')).toHaveText('https://second.example')
    await page.waitForTimeout(650)
    await expect.poll(async() => popover.evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return style.opacity === '1' && rect.top >= 0 && rect.left >= 0
    })).toBe(true)
    await expect(popover.locator('.link-address-text')).toHaveText('https://second.example')

    // Crossing the physical gap from the link into its toolbar must keep the
    // toolbar alive past the normal 500 ms close delay.
    await page.evaluate(() => {
      const link = document.querySelectorAll('span.mu-link')[1]
      const toolbar = document.querySelector('.mu-link-tools-container .link-toolbar')!
      link.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: toolbar }))
      toolbar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: link }))
    })
    await page.waitForTimeout(650)
    await expect.poll(async() => popover.evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return style.opacity === '1' && rect.top >= 0 && rect.left >= 0
    })).toBe(true)

    // A caret inside the link makes its Markdown markers visible (edit
    // rendering state). Hover tools must remain available in that state too.
    await links.nth(1).evaluate((node) => {
      const content = node.closest<HTMLElement>('.mu-content')!
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      const text = walker.nextNode()
      if (!(text instanceof Text)) throw new Error('Link text is unavailable')
      content.focus()
      const range = document.createRange()
      range.setStart(text, Math.min(1, text.length))
      range.collapse(true)
      const selection = document.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      document.querySelector('.editor-component')?.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
    })
    await links.nth(1).evaluate((link) => {
      link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    await expect(popover.locator('.link-address-text')).toHaveText('https://second.example')
  })

  test('a pasted root URL stays usable while loading and then becomes a title view', async() => {
    titleServer = createServer((request, response) => {
      if (request.url === '/favicon.ico') {
        response.writeHead(200, { 'content-type': 'image/png' })
        response.end(Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64'
        ))
        return
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end([
        '<html><head>',
        '<link rel="icon" href="/favicon.ico">',
        '<script>setTimeout(() => { document.title = "Electron 43" }, 100)</script>',
        '</head></html>'
      ].join(''))
    })
    await new Promise<void>((resolve) => titleServer!.listen(0, '127.0.0.1', resolve))
    const address = titleServer.address() as AddressInfo
    const bareUrl = `http://127.0.0.1:${address.port}/`
    const launched = await launchWithMarkdown('\n')
    app = launched.app
    page = launched.page

    const displayedUrl = bareUrl.replace(/^https?:\/\//, '')
    await app.evaluate(({ clipboard }, data) => {
      clipboard.write(data)
    }, {
      text: displayedUrl,
      html: `<meta charset="utf-8"><a href="${bareUrl}" style="font-family: PingFang SC; font-size: medium;">${displayedUrl}</a>`
    })
    await page.evaluate(() => {
      const root = document.querySelector('.editor-component') as HTMLElement | null
      const paragraph = root?.querySelector<HTMLElement>('span.mu-paragraph-content')
      if (!root || !paragraph) throw new Error('Paragraph is unavailable')
      root.focus()
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await page.keyboard.press('Meta+V')
    await expect(page.locator('.mu-link-title-loading')).toBeVisible({ timeout: 1000 })
    await expect(page.locator('span.mu-link')).toContainText(displayedUrl)
    await expect(page.locator('.mu-link-title-icon-shell')).toHaveCount(0)
    expect(await getMarkdownContent(page, app)).toContain(`[${displayedUrl}](${bareUrl})`)

    await expect(page.locator('.mu-link-title-icon')).toHaveCSS(
      'background-image',
      `url("http://127.0.0.1:${address.port}/favicon.ico")`,
      { timeout: 10000 }
    )
    await expect(page.locator('.mu-link-title-icon')).toBeVisible()
    await expect(page.locator('span.mu-link')).toContainText('Electron 43')
    expect(await getMarkdownContent(page, app)).toContain(`[Electron 43](${bareUrl})`)

    await page.locator('span.mu-link').hover()
    const popover = page.locator('.mu-link-tools-container')
    await expect(popover.locator('.view-selector-button')).toHaveText('Title View')
    await popover.locator('.view-selector-button').evaluate((button: HTMLButtonElement) => button.click())
    const linkView = popover.locator('.link-view-menu .link')
    await expect(linkView).toBeVisible()
    await linkView.evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.locator('span.mu-link')).toContainText(bareUrl)

    await page.locator('span.mu-link').hover()
    await expect(popover.locator('.view-selector-button')).toHaveText('Link View')
    await popover.locator('.view-selector-button').evaluate((button: HTMLButtonElement) => button.click())
    const titleView = popover.locator('.link-view-menu .title')
    await titleView.evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.locator('span.mu-link')).toContainText('Electron 43')

    const savedMarkdown = await getMarkdownContent(page, app)
    await app.close()
    const reopened = await launchWithMarkdown(savedMarkdown)
    app = reopened.app
    page = reopened.page
    await expect(page.locator('span.mu-link')).toContainText('Electron 43')
    await expect(page.locator('.mu-link-title-icon-shell')).toBeVisible()
    await page.locator('span.mu-link').hover()
    await expect(page.locator('.mu-link-tools-container .view-selector-button'))
      .toHaveText('Title View')
  })

  test('an Edge-formatted MSN link automatically resolves its title', async() => {
    const msnUrl = 'https://www.msn.cn/zh-cn/news/other/%E5%88%80%E9%83%8E%E5%89%8D%E5%A6%BB%E4%B8%A2%E5%BC%8340%E5%A4%A9%E5%A5%B3%E5%84%BF%E7%A7%81%E5%A5%94%E5%AF%8C%E5%95%86-%E4%B8%88%E5%A4%AB%E5%86%8D%E5%A9%9A%E7%88%86%E7%BA%A2%E5%A5%B9%E4%B8%BA%E4%BD%95%E7%8E%B0%E8%BA%AB/ar-AA28e7be?ocid=msedgntp'
    const displayedUrl = msnUrl.replace(/^https?:\/\/(?:www\.)?/, '')
    const expectedTitle = '刀郎前妻丢弃40天女儿私奔富商-丈夫再婚爆红她为何现身'
    const launched = await launchWithMarkdown('\n')
    app = launched.app
    page = launched.page

    await app.evaluate(({ clipboard }, data) => clipboard.write(data), {
      text: displayedUrl,
      html: `<meta charset="utf-8"><a href="${msnUrl}" style="font-family: &quot;PingFang SC&quot;; font-size: medium;">${displayedUrl}</a>`
    })
    await page.locator('span.mu-paragraph-content').evaluate((paragraph) => {
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await page.keyboard.press('Meta+V')

    await expect(page.locator('span.mu-link')).toContainText(expectedTitle, { timeout: 10000 })
    await expect(page.locator('.mu-link-title-icon')).toHaveCSS(
      'background-image',
      'url("https://www.msn.cn/favicon.ico")',
      { timeout: 10000 }
    )
    await expect(page.locator('.mu-link-title-icon-shell .mu-action-icon-web-link'))
      .toBeVisible({ timeout: 10000 })
    expect(await getMarkdownContent(page, app)).toContain(`[${expectedTitle}](${msnUrl})`)
  })

  test('Enter at the rendered link end keeps the Markdown link intact', async() => {
    const launched = await launchWithMarkdown(`- 前文 [发发发](${URL})\n`)
    app = launched.app
    page = launched.page
    await page.bringToFront()

    const link = page.locator('span.mu-link').first()
    await link.evaluate((node) => {
      const content = node.closest<HTMLElement>('.mu-content')!
      content.focus()
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      let textNode: Text | null = null
      while (walker.nextNode()) textNode = walker.currentNode as Text
      if (!textNode) throw new Error('Link has no text node')
      const range = document.createRange()
      range.setStart(textNode, textNode.length)
      range.collapse(true)
      const selection = document.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      const root = document.querySelector('.editor-component')!
      root.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
    })
    await page.waitForTimeout(150)
    await page.keyboard.press('Enter')
    await page.keyboard.type('nextitem')
    await page.waitForTimeout(1000)

    await expect.poll(() => getMarkdownContent(page, app)).toContain(
      `- 前文 [发发发](${URL})\n- nextitem`
    )
  })
})
