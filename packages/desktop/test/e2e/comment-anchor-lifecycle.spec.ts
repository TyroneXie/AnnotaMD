import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown } from './helpers'

const selectParagraphText = async(page: Page, paragraphIndex: number, start = 0, end?: number) => {
  await page.evaluate(({ paragraphIndex, start, end }) => {
    const root = document.querySelector('.editor-component') as HTMLElement | null
    const target = root?.querySelectorAll<HTMLElement>('span.mu-paragraph-content')[paragraphIndex]
    if (!root || !target) throw new Error('paragraph text is unavailable')
    const boundaryAt = (rawOffset: number): { node: Text; offset: number } => {
      let remaining = rawOffset
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode() as Text | null
      let last: Text | null = null
      while (node) {
        last = node
        if (remaining <= node.data.length) return { node, offset: remaining }
        remaining -= node.data.length
        node = walker.nextNode() as Text | null
      }
      if (!last) throw new Error('paragraph has no text node')
      return { node: last, offset: last.data.length }
    }
    const begin = boundaryAt(start)
    const finish = boundaryAt(end ?? target.textContent?.length ?? start)
    root.focus()
    const range = document.createRange()
    range.setStart(begin.node, begin.offset)
    range.setEnd(finish.node, finish.offset)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
  }, { paragraphIndex, start, end })
  await page.waitForTimeout(150)
}

const addComment = async(page: Page, paragraphIndex: number, body: string) => {
  await selectParagraphText(page, paragraphIndex)
  await page.locator('.mu-format-picker li.annotamd_comment').click()
  const composer = page.locator('.annotamd-composer-card')
  await expect(composer).toBeVisible()
  await expect(composer.locator('blockquote')).toContainText('重复文字：需要修正。')
  await composer.locator('textarea').fill(body)
  await composer.locator('.annotamd-composer-actions button').click()
  await expect(page.locator('.annotamd-comment-card[data-comment-id]')).toHaveCount(1)
}

test.describe('AnnotaMD comment anchors in Electron', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('重复文字：需要修正。\n\n中间内容。\n\n重复文字：需要修正。\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('tracks the selected duplicate and removes it only when its own text changes', async() => {
    await addComment(page, 2, '只修改第二处')
    await selectParagraphText(page, 0, 0, 1)
    await page.keyboard.type('新')
    await expect(page.locator('.annotamd-comment-card[data-comment-id]')).toHaveCount(1)
    await expect(page.locator('.annotamd-comment-card blockquote')).toContainText('重复文字：需要修正。')

    await selectParagraphText(page, 2, 0, 1)
    await page.keyboard.type('新')
    await expect(page.locator('.annotamd-comment-card[data-comment-id]')).toHaveCount(0)
  })
})
