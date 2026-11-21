import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import {
  clearRendererErrors,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown
} from './helpers'

const LOCAL_IMAGE_PATH = resolve(__dirname, '../../static/logo-96px.png')

test('keeps resizing during a single drag across a moving image handle', async() => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="560" height="280"><rect width="560" height="280" fill="teal"/></svg>').toString('base64')
  const { app, page } = await launchWithMarkdown(
    `![continuous resize](data:image/svg+xml;base64,${svg})\n`,
    { suppressErrorDialog: true }
  )
  try {
    const image = page.locator('.editor-component img[alt="continuous resize"]')
    await image.hover()
    const handle = page.locator('.mu-transformer .top-right')
    await expect(handle).toBeVisible()
    const initialWidth = Math.round((await image.boundingBox())!.width)
    const corner = (await handle.boundingBox())!
    const x = corner.x + corner.width / 2
    const y = corner.y + corner.height / 2

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 70, y, { steps: 5 })
    await expect(image).toHaveAttribute('width', String(initialWidth - 70))
    await page.mouse.move(x - 155, y, { steps: 5 })
    await expect(image).toHaveAttribute('width', String(initialWidth - 155))
    await page.mouse.move(x - 102, y, { steps: 5 })
    await expect(image).toHaveAttribute('width', String(initialWidth - 102))
    await page.mouse.up()

    await expect.poll(() => getMarkdownContent(page, app)).toContain(`width="${initialWidth - 102}"`)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('image resize survives stale hover work and persists the dragged width', async() => {
  const { app, page } = await launchWithMarkdown(
    `![resize lifecycle](${LOCAL_IMAGE_PATH})\n`,
    { suppressErrorDialog: true }
  )
  try {
    const image = page.locator('.editor-component .mu-inline-image.mu-image-success img')
    await image.waitFor({ state: 'visible', timeout: 15000 })
    await clearRendererErrors(app)

    // Reproduce the original delayed-render race in one renderer task: the
    // hover schedules the resize controls, then mouseout clears the image
    // reference before that timer runs.
    await image.evaluate((element) => {
      const editor = document.querySelector('.editor-component')
      element.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        relatedTarget: editor
      }))
      element.dispatchEvent(new MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: editor
      }))
    })
    await page.waitForTimeout(50)
    await expectNoRendererErrors(app)

    await image.click()
    const handle = page.locator('.mu-transformer .bottom-right')
    await expect(handle).toBeVisible()
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('image resize handle has no bounding box')

    const x = handleBox.x + handleBox.width / 2
    const y = handleBox.y + handleBox.height / 2
    const startImageBox = await image.boundingBox()
    if (!startImageBox) throw new Error('image has no bounding box')
    await expect(page.evaluate(({ x, y }) =>
      document.elementFromPoint(x, y)?.classList.contains('bottom-right'), { x, y }
    )).resolves.toBe(true)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y, { steps: 5 })
    await expect(image).toHaveAttribute('width', /\d+/)
    expect(Number(await image.getAttribute('width'))).toBeGreaterThan(startImageBox.width)
    await page.mouse.up()
    await expect(page.locator('.mu-transformer')).toBeEmpty()
    await expectNoRendererErrors(app)
    await page.waitForTimeout(300)

    await expect.poll(() => getMarkdownContent(page, app)).toMatch(
      /<img\s[^>]*width="(\d+)"/i
    )
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
