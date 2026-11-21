import { expect, test } from '@playwright/test'
import type { Locator } from 'playwright'
import { readFile } from 'node:fs/promises'
import { expectNoRendererErrors, getMarkdownContent, launchElectron, launchWithMarkdown, waitForEditor } from './helpers'

const src = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="220"><rect width="540" height="220" fill="#97b2da"/></svg>'
).toString('base64')}`
const markdownImage = (alt: string) => `![${alt}](${src})`

const dragBeside = async(source: Locator, target: Locator, side: 'left' | 'right') => {
  const rect = (await target.boundingBox())!
  await source.dragTo(target, {
    targetPosition: { x: rect.width * (side === 'left' ? 0.25 : 0.75), y: rect.height / 2 }
  })
}

test('dragging images joins and reorders a three-image row, then saves the order', async() => {
  const { app, page, filePath } = await launchWithMarkdown(
    ['Image drag.', markdownImage('One'), markdownImage('Two'), markdownImage('Three'), 'Caption.'].join('\n\n') + '\n',
    { suppressErrorDialog: true }
  )
  const rowSelector = '.editor-component .mu-image-row img'
  try {
    const editor = page.locator('.editor-component')
    const image = (name: string) => editor.getByAltText(name, { exact: true })
    const order = () => page.locator(rowSelector).evaluateAll(images => images.map(image => image.getAttribute('alt')))

    await dragBeside(image('Two'), image('One'), 'right')
    await expect.poll(order).toEqual(['One', 'Two'])
    await dragBeside(image('Three'), image('Two'), 'right')
    await expect.poll(order).toEqual(['One', 'Two', 'Three'])
    await dragBeside(image('Three'), image('One'), 'left')
    await expect.poll(order).toEqual(['Three', 'One', 'Two'])
    await expect(page.locator('#mu-dragover-ghost')).toHaveCount(0)

    const savedLine = ['Three', 'One', 'Two'].map(markdownImage).join(' ')
    await expect.poll(() => readFile(filePath, 'utf8')).toContain(savedLine)
    expect(await getMarkdownContent(page, app)).toContain(`Image drag.\n\n${savedLine}\n\nCaption.`)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }

  const reopened = await launchElectron([filePath], { suppressErrorDialog: true })
  try {
    await waitForEditor(reopened.page)
    await expect.poll(() => reopened.page.locator(rowSelector).evaluateAll(
      images => images.map(image => image.getAttribute('alt'))
    )).toEqual(['Three', 'One', 'Two'])
  } finally {
    await reopened.app.close()
  }
})

test('dragging an image onto a text block moves it to an adjacent paragraph', async() => {
  const row = `${markdownImage('Stay')} ${markdownImage('Move')}`
  const { app, page } = await launchWithMarkdown(`Start.\n\n${row}\n\nEnd.\n`, { suppressErrorDialog: true })
  try {
    const editor = page.locator('.editor-component')
    const destination = editor.locator('.mu-paragraph-content').filter({ hasText: 'Start.' })
    await editor.getByAltText('Move', { exact: true }).dragTo(destination, { targetPosition: { x: 10, y: 2 } })
    await expect(editor.locator('.mu-image-row')).toHaveCount(0)
    expect(await getMarkdownContent(page, app)).toContain(
      `${markdownImage('Move')}\n\nStart.\n\n${markdownImage('Stay')}\n\nEnd.`
    )
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
