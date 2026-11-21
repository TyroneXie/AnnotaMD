import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expectNoRendererErrors, getMarkdownContent, launchElectron, launchWithMarkdown, waitForEditor } from './helpers'

const SVG_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#e8efff"/><circle cx="240" cy="120" r="64" fill="#3370ff"/></svg>'
).toString('base64')}`

const LOCAL_IMAGE_PATH = resolve(__dirname, '../../static/logo-96px.png')

test('places adjacent images side by side and restores the row after reopening', async() => {
  const firstImage = `![First](${SVG_DATA_URI})`
  const secondImage = `<img src="${SVG_DATA_URI}" alt="Second" width="410" data-align="right" />`
  const { app, page, filePath } = await launchWithMarkdown(
    `Image comparison\n\n${firstImage}\n\n${secondImage}\n\nCaption.\n`,
    { suppressErrorDialog: true }
  )
  const rowSelector = '.editor-component .mu-image-row'
  const expectSameRow = async(editorPage: Page) => {
    const row = editorPage.locator(rowSelector)
    await expect(row.locator('img')).toHaveCount(2)
    const [left, right] = await Promise.all([
      row.getByAltText('First', { exact: true }).boundingBox(),
      row.getByAltText('Second', { exact: true }).boundingBox()
    ])
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left!.width).toBeGreaterThan(50)
    expect(right!.width).toBeGreaterThan(50)
    expect(left!.x + left!.width).toBeLessThan(right!.x)
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2)
  }

  try {
    const editor = page.locator('.editor-component')
    await editor.getByAltText('Second', { exact: true }).click()
    await page.locator('.mu-image-toolbar .side-by-side').click()
    await expectSameRow(page)

    const pair = await getMarkdownContent(page, app)
    expect(pair).toContain(`${firstImage} <img src="${SVG_DATA_URI}" alt="Second" width="410">`)
    expect(pair).toContain('\n\nCaption.')
    await expectSameRow(page)

    const row = page.locator(rowSelector)
    const second = row.getByAltText('Second', { exact: true })
    const first = row.getByAltText('First', { exact: true })
    const leftWidth = (await first.boundingBox())!.width
    const rightWidth = (await second.boundingBox())!.width
    await second.hover()
    const handle = page.locator('.mu-transformer .bottom-right')
    await expect(handle).toBeVisible()
    const corner = (await handle.boundingBox())!
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
    await page.mouse.down()
    await page.mouse.move(corner.x + corner.width / 2 - 60, corner.y + corner.height / 2, { steps: 8 })
    expect((await first.boundingBox())!.width - leftWidth).toBeCloseTo(60, 0)
    expect(rightWidth - (await second.boundingBox())!.width).toBeCloseTo(60, 0)
    await page.mouse.up()
    await expect(second).not.toHaveAttribute('width', '410')
    const width = Number(await second.getAttribute('width'))
    expect(width).toBeGreaterThan(50)
    expect(Math.abs(width - rightWidth + 60)).toBeLessThan(1)
    await expectSameRow(page)
    await expect.poll(() => readFile(filePath, 'utf8')).toContain(`alt="Second" width="${width}"`)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }

  const reopened = await launchElectron([filePath], { suppressErrorDialog: true })
  try {
    await waitForEditor(reopened.page)
    await expectSameRow(reopened.page)
    await expect(reopened.page.locator(rowSelector).getByAltText('Second', { exact: true })).toHaveAttribute('width', /\d+/)
    await expectNoRendererErrors(reopened.app)
  } finally {
    await reopened.app.close()
  }
})

test('a divider trades space between adjacent images and keeps a third image in place', async() => {
  const portrait = `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240"><rect width="180" height="240" fill="#49a881"/></svg>'
  ).toString('base64')}`
  const { app, page } = await launchWithMarkdown(
    `![Landscape](${SVG_DATA_URI}) ![Portrait](${portrait}) ![Third](${SVG_DATA_URI})\n`,
    { suppressErrorDialog: true }
  )
  try {
    const row = page.locator('.editor-component .mu-image-row')
    const images = row.locator('img')
    await expect(images).toHaveCount(3)
    const widths = () => images.evaluateAll(elements =>
      elements.map(element => element.getBoundingClientRect().width)
    )
    const initial = await widths()
    const heights = await images.evaluateAll(elements =>
      elements.map(element => element.getBoundingClientRect().height)
    )
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1)

    const beforeClick = await getMarkdownContent(page, app)
    await images.first().click()
    expect(await widths()).toEqual(initial)
    await images.last().click()
    expect(await widths()).toEqual(initial)
    const corner = page.locator('.mu-transformer .bottom-right')
    await expect(corner).toBeVisible()
    const cornerBox = (await corner.boundingBox())!
    const cornerX = cornerBox.x + cornerBox.width / 2
    const cornerY = cornerBox.y + cornerBox.height / 2
    await page.mouse.move(cornerX, cornerY)
    await page.mouse.down()
    await page.mouse.move(cornerX + 1, cornerY + 2)
    expect(await widths()).toEqual(initial)
    await page.mouse.up()
    expect(await widths()).toEqual(initial)
    expect(await getMarkdownContent(page, app)).toBe(beforeClick)

    await images.first().hover()
    const divider = page.locator('.mu-transformer .row-right:not([hidden])')
    await expect(divider).toBeVisible()
    const box = (await divider.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 45, y, { steps: 8 })
    const during = await widths()
    expect(during[0] - initial[0]).toBeCloseTo(45, 0)
    expect(initial[1] - during[1]).toBeCloseTo(45, 0)
    expect(during[2]).toBeCloseTo(initial[2], 0)
    await page.mouse.up()

    await expect(row).toHaveClass(/mu-image-row-sized/)
    const saved = await getMarkdownContent(page, app)
    expect(saved.match(/\bwidth="\d+"/g)).toHaveLength(3)
    const win = await app.browserWindow(page)
    await win.evaluate(window => window.setContentSize(900, 700))
    await expect.poll(async() => (await widths())[0]).toBeLessThan(during[0])
    const smaller = await widths()
    expect(smaller[0] / smaller[1]).toBeCloseTo(during[0] / during[1], 1)

    await images.last().hover()
    const secondDivider = page.locator('.mu-transformer .row-left:not([hidden])')
    await expect(secondDivider).toBeVisible()
    const secondBox = (await secondDivider.boundingBox())!
    const secondX = secondBox.x + secondBox.width / 2
    const secondY = secondBox.y + secondBox.height / 2
    await page.mouse.move(secondX, secondY)
    await page.mouse.down()
    await page.mouse.move(secondX + 24, secondY, { steps: 5 })
    const resized = await widths()
    expect(resized[0]).toBeCloseTo(smaller[0], 0)
    expect(resized[1] - smaller[1]).toBeCloseTo(24, 0)
    expect(smaller[2] - resized[2]).toBeCloseTo(24, 0)
    await page.mouse.up()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('the image toolbar opens a zoomable preview of the selected image', async() => {
  const { app, page } = await launchWithMarkdown(
    `![Preview target](${SVG_DATA_URI})\n`,
    { suppressErrorDialog: true }
  )
  try {
    const original = page.getByAltText('Preview target', { exact: true })
    await original.click()
    const previewButton = page.locator('.mu-image-toolbar .preview')
    await expect(previewButton).toHaveAttribute('aria-label', /View Full Image|查看大图/)
    await previewButton.click()
    const viewer = page.locator('.image-viewer')
    const preview = viewer.locator('img')
    await expect(viewer).toBeVisible()
    await expect(preview).toHaveAttribute('src', SVG_DATA_URI)
    const width = (await preview.boundingBox())!.width
    await preview.hover()
    await page.mouse.wheel(0, -120)
    await expect.poll(async() => (await preview.boundingBox())!.width).toBeGreaterThan(width)
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

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
    await expect(items).toHaveCount(8)
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

test('copies a local image from both image action menus to the system clipboard', async() => {
  const { app, page } = await launchWithMarkdown(`![copy image](${LOCAL_IMAGE_PATH})\n`)
  try {
    const image = page.locator('.editor-component .mu-inline-image.mu-image-success img')
    await image.waitFor({ state: 'visible', timeout: 15000 })
    await app.evaluate(({ clipboard }) => clipboard.clear())

    await image.click()
    const toolbar = page.locator('.mu-image-toolbar')
    await expect(toolbar.locator('.copy')).toHaveAttribute('aria-label', /Copy Image|复制图片/)
    await toolbar.locator('.copy').click()
    await expect.poll(() => app.evaluate(({ clipboard }) => {
      const copied = clipboard.readImage()
      return copied.isEmpty() ? null : copied.getSize()
    })).toEqual({ width: 96, height: 96 })

    await app.evaluate(({ clipboard }) => clipboard.clear())
    await image.hover()
    const frontButton = page.locator('.mu-front-button-wrapper button.image')
    await expect(frontButton).toBeVisible()
    await frontButton.click()
    const frontMenu = page.locator('.mu-front-menu')
    await expect(frontMenu.locator('.image-copy')).toHaveAttribute('aria-label', /Copy Image|复制图片/)
    await expect(frontMenu.locator('.copy-plain-text')).toHaveCount(0)
    await expect(frontMenu.locator('.copy-markdown')).toBeVisible()
    await frontMenu.locator('.image-copy').click()
    await expect.poll(() => app.evaluate(({ clipboard }) => {
      const copied = clipboard.readImage()
      return copied.isEmpty() ? null : copied.getSize()
    })).toEqual({ width: 96, height: 96 })
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
