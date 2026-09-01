import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { launchWithMarkdown } from './helpers'

const selectTextSlice = async(page: Page, start: number, end: number) => {
  await page.evaluate(({ start, end }) => {
    const editor = document.querySelector<HTMLElement>('.editor-component')
    const paragraph = editor?.querySelector<HTMLElement>('span.mu-paragraph-content')
    const text = paragraph
      ? document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode() as Text | null
      : null
    if (!editor || !text) throw new Error('editor text is unavailable')

    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, end)
    editor.focus({ preventScroll: true })
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    editor.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
  }, { start, end })
}

test('text format toolbar stays inside both horizontal editor edges', async() => {
  const text = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW'
  const { app, page } = await launchWithMarkdown(`${text}\n`)
  try {
    await page.locator('.editor-component').evaluate((element) => {
      Object.assign((element as HTMLElement).style, {
        width: '520px',
        marginLeft: '180px'
      })
    })

    const editor = page.locator('.editor-component')
    const toolbar = page.locator('.mu-format-picker')
    const wrapper = page.locator('.mu-format-picker-container')

    for (const [start, end] of [[0, 1], [text.length - 1, text.length]]) {
      await selectTextSlice(page, start, end)
      await expect(wrapper).toHaveCSS('opacity', '1')
      await expect.poll(async() => {
        const [editorBox, toolbarBox] = await Promise.all([
          editor.boundingBox(),
          toolbar.boundingBox()
        ])
        return !!editorBox && !!toolbarBox &&
          toolbarBox.x >= editorBox.x + 7 &&
          toolbarBox.x + toolbarBox.width <= editorBox.x + editorBox.width - 7
      }).toBe(true)
      await expect.poll(() => wrapper.evaluate((element) => {
        const values = element.style.clipPath.match(/^inset\((.*)\)$/)?.[1].split(' ') ?? []
        const right = Number.parseFloat(values.length === 1 ? values[0]! : values[1]!)
        const left = Number.parseFloat(values.length < 4 ? values[1]! : values[3]!)
        return right <= 0 && left <= 0
      })).toBe(true)
    }
  } finally {
    await app.close()
  }
})

test('shows toolbar tooltips and applies the text-style menu without clipping', async() => {
  const text = 'Convert this paragraph to a heading.'
  const { app, page } = await launchWithMarkdown(`${text}\n`)
  try {
    await selectTextSlice(page, 0, text.length)

    const wrapper = page.locator('.mu-format-picker-container')
    const strong = page.locator('.mu-format-picker li.strong')
    await strong.hover()
    await expect.poll(() => strong.evaluate((element) => {
      const tooltip = getComputedStyle(element, '::after')
      return {
        content: tooltip.content,
        visibility: tooltip.visibility,
        opacity: tooltip.opacity
      }
    })).toEqual(expect.objectContaining({
      visibility: 'visible',
      opacity: '1'
    }))
    await expect.poll(() => wrapper.evaluate((element) => {
      const values = element.style.clipPath.match(/^inset\((.*)\)$/)?.[1].split(' ') ?? []
      return values.some((value) => Number.parseFloat(value) < 0)
    })).toBe(true)

    await page.locator('.mu-format-picker li.text_style').click()
    const headingOption = page.locator('[data-paragraph-type="heading 2"]')
    await expect(headingOption).toBeVisible()
    await expect.poll(() => headingOption.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return target === element || element.contains(target)
    })).toBe(true)
    await headingOption.click()

    await expect(page.locator('h2.mu-atx-heading')).toContainText(text)
  } finally {
    await app.close()
  }
})
