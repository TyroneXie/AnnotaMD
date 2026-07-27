import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { launchWithMarkdown } from './helpers'

const SVG_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#e8efff"/><circle cx="240" cy="120" r="64" fill="#3370ff"/></svg>'
).toString('base64')}`

const selectParagraphText = async(page: Page, paragraphIndex = 0) => {
  await page.evaluate((index) => {
    const root = document.querySelector('.editor-component') as HTMLElement
    const paragraph = root.querySelectorAll<HTMLElement>('span.mu-paragraph-content')[index]
    if (!paragraph) throw new Error('paragraph is unavailable')
    const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode() as Text
    if (!text) throw new Error('paragraph text is unavailable')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, text.data.length)
    root.focus({ preventScroll: true })
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
  }, paragraphIndex)
  await page.waitForTimeout(150)
}

test('clicking an image opens its accessible toolbar above the image', async() => {
  const { app, page } = await launchWithMarkdown(`Toolbar source text.\n\n![toolbar test](${SVG_DATA_URI})\n`)
  try {
    const image = page.locator('.editor-component .mu-inline-image.mu-image-success img')
    await image.waitFor({ state: 'visible', timeout: 15000 })
    await selectParagraphText(page)
    const formatToolbar = page.locator('.mu-format-picker')
    const formatToolbarWrapper = page.locator('.mu-format-picker-container')
    await expect(formatToolbar).toBeVisible()
    await expect(formatToolbarWrapper).toHaveCSS('opacity', '1')
    await image.click()

    const toolbar = page.locator('.mu-image-toolbar')
    const toolbarWrapper = page.locator('.mu-image-toolbar-container')
    await expect(toolbar).toBeVisible()
    await expect(formatToolbarWrapper).toHaveCSS('opacity', '0')
    await expect(toolbarWrapper).toHaveCSS('opacity', '1')
    const items = toolbar.locator('li.item')
    await expect(items).toHaveCount(6)
    expect(await items.evaluateAll((elements) =>
      elements.every((element) =>
        element.getAttribute('role') === 'button' &&
        element.getAttribute('tabindex') === '0'
      )
    )).toBe(true)
    await expect(toolbar.locator('.center')).toHaveClass(/active/)
    await expect(toolbar.locator('.center')).toHaveAttribute('aria-pressed', 'true')
    const deleteItem = toolbar.locator('.delete')
    const deleteIcon = deleteItem.locator('.mu-action-icon')
    await expect(deleteIcon).not.toHaveCSS('color', 'rgb(255, 105, 105)')
    await deleteItem.hover()
    await expect(deleteIcon).toHaveCSS('color', 'rgb(255, 105, 105)')

    await expect.poll(async() => {
      const [toolbarBox, imageBox] = await Promise.all([
        toolbar.boundingBox(),
        image.boundingBox()
      ])
      return !!toolbarBox && !!imageBox &&
        toolbarBox.y + toolbarBox.height <= imageBox.y &&
        Math.abs(
          toolbarBox.x + toolbarBox.width / 2 -
          (imageBox.x + imageBox.width / 2)
        ) <= 2
    }).toBe(true)
    await toolbar.locator('.inline').click()
    await expect(toolbar).toBeVisible()
    await expect(page.locator('.editor-component .mu-inline-image.inline')).toBeVisible()
    await expect(toolbar.locator('.inline')).toHaveClass(/active/)

    await toolbar.locator('.inline').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.editor-component .mu-inline-image.center')).toBeVisible()
    await expect(toolbar.locator('.center')).toHaveClass(/active/)

    await page.locator('.editor-component').click({ position: { x: 20, y: 500 } })
    await expect(toolbarWrapper).toHaveCSS('opacity', '0')

    await page.locator('.editor-component .mu-inline-image.center img').click()
    await page.locator('span.mu-paragraph-content').filter({ hasText: 'Toolbar source text.' }).click()
    await selectParagraphText(page)
    await expect(formatToolbar).toBeVisible()
    await expect(formatToolbarWrapper).toHaveCSS('opacity', '1')
    await expect(toolbarWrapper).toHaveCSS('opacity', '0')

    await page.locator('.editor-component .mu-inline-image.center img').click()
    await toolbar.locator('.center').focus()
    await page.keyboard.press('Escape')
    await expect(toolbarWrapper).toHaveCSS('opacity', '0')
  } finally {
    await app.close()
  }
})

test('text format toolbar remains attached to a selected range while scrolling', async() => {
  const paragraphs = Array.from(
    { length: 72 },
    (_, index) => `Scrollable selected paragraph ${index}.`
  )
  const { app, page } = await launchWithMarkdown(`${paragraphs.join('\n\n')}\n`)
  try {
    const paragraphIndex = 28
    const editor = page.locator('.editor-component')
    const paragraph = page.locator('span.mu-paragraph-content').nth(paragraphIndex)
    await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await selectParagraphText(page, paragraphIndex)

    const toolbar = page.locator('.mu-format-picker')
    const wrapper = page.locator('.mu-format-picker-container')
    await expect(wrapper).toHaveCSS('opacity', '1')
    const before = await Promise.all([toolbar.boundingBox(), paragraph.boundingBox()])
    expect(before[0]).not.toBeNull()
    expect(before[1]).not.toBeNull()
    const relativeY = before[0]!.y - before[1]!.y
    const editorBox = await editor.boundingBox()
    expect(editorBox).not.toBeNull()

    await editor.evaluate((element) => {
      element.scrollTop += 120
    })

    await expect(wrapper).toHaveCSS('opacity', '1')
    await expect.poll(async() => {
      const [toolbarBox, paragraphBox] = await Promise.all([
        toolbar.boundingBox(),
        paragraph.boundingBox()
      ])
      return !!toolbarBox && !!paragraphBox &&
        Math.abs(toolbarBox.y - paragraphBox.y - relativeY) <= 3
    }).toBe(true)
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe(paragraphs[paragraphIndex])

    const partialClipScroll = Math.max(
      1,
      before[0]!.y - editorBox!.y + Math.floor(before[0]!.height / 2) - 120
    )
    await editor.evaluate((element, distance) => {
      element.scrollTop += distance
    }, partialClipScroll)
    await expect.poll(async() => {
      const toolbarBox = await toolbar.boundingBox()
      return !!toolbarBox &&
        toolbarBox.y < editorBox!.y &&
        toolbarBox.y + toolbarBox.height > editorBox!.y
    }).toBe(true)
    await expect.poll(() => wrapper.evaluate((element) => element.style.clipPath))
      .not.toBe('inset(0px 0px 0px 0px)')

    await editor.evaluate((element) => {
      element.scrollTop += 1200
    })
    await expect.poll(async() => {
      const [toolbarBox, paragraphBox] = await Promise.all([
        toolbar.boundingBox(),
        paragraph.boundingBox()
      ])
      return !!toolbarBox && !!paragraphBox &&
        toolbarBox.y + toolbarBox.height <= editorBox!.y &&
        Math.abs(toolbarBox.y - paragraphBox.y - relativeY) <= 3
    }).toBe(true)
    await expect(wrapper).toHaveCSS('opacity', '1')

    await paragraph.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await expect.poll(async() => {
      const [toolbarBox, paragraphBox] = await Promise.all([
        toolbar.boundingBox(),
        paragraph.boundingBox()
      ])
      return !!toolbarBox && !!paragraphBox &&
        toolbarBox.y > 0 &&
        Math.abs(toolbarBox.y - paragraphBox.y - relativeY) <= 3
    }).toBe(true)
  } finally {
    await app.close()
  }
})
