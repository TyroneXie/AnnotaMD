import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown } from './helpers'

const selectCodeText = async(page: Page, start: number, end: number) => {
  await page.evaluate(({ start, end }) => {
    const root = document.querySelector('.editor-component') as HTMLElement | null
    const target = root?.querySelector<HTMLElement>('.mu-code-block .mu-codeblock-content')
    if (!root || !target) throw new Error('code block is unavailable')
    const text = [...target.childNodes].find((node) => node.nodeType === Node.TEXT_NODE) as Text | undefined
      ?? document.createTreeWalker(target, NodeFilter.SHOW_TEXT).nextNode() as Text | null
    if (!text) throw new Error('code block has no text node')
    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, end)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
  }, { start, end })
  await page.waitForTimeout(150)
}

test('code selection exposes rich toolbar and applies bold in fenced source', async() => {
  const { app, page } = await launchWithMarkdown('```\nplain text\n```\n')
  try {
    await selectCodeText(page, 0, 5)
    const toolbar = page.locator('.mu-format-picker')
    await expect(toolbar).toBeVisible()
    for (const item of ['strong', 'del', 'em', 'u', 'color_palette', 'annotamd_comment'])
      await expect(toolbar.locator(`li.${item}`)).toBeVisible()

    await toolbar.locator('li.strong').click()
    await expect(page.locator('.mu-codeblock-content strong')).toContainText('plain')
    await expect.poll(() => getMarkdownContent(page, app)).toContain('**plain** text')
  } finally {
    await app.close()
  }
})

test('code selection can create a comment', async() => {
  const { app, page } = await launchWithMarkdown('```\nplain text\n```\n')
  try {
    await selectCodeText(page, 0, 5)
    await page.locator('.mu-format-picker li.annotamd_comment').click()
    await expect(page.locator('.annotamd-composer-card')).toBeVisible()
    await expect(page.locator('.annotamd-composer-card blockquote')).toContainText('plain')
  } finally {
    await app.close()
  }
})

test('paragraph and code block convert in both directions from the selection toolbar', async() => {
  const { app, page } = await launchWithMarkdown('plain text\n')
  try {
    const paragraph = page.locator('.mu-paragraph-content').first()
    await paragraph.selectText()
    await page.locator('.editor-component').evaluate((root) => {
      root.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true
      }))
    })
    await page.waitForTimeout(150)
    await expect(page.locator('.mu-format-picker')).toBeVisible()
    await page.locator('.mu-format-picker li.text_style').click()
    await page.locator('[data-paragraph-type="pre"]').click()
    await expect(page.locator('.mu-code-block .mu-codeblock-content')).toContainText('plain text')

    await selectCodeText(page, 0, 5)
    await page.locator('.mu-format-picker li.text_style').click()
    await page.locator('[data-paragraph-type="paragraph"]').click()
    await expect(page.locator('.mu-paragraph-content')).toContainText('plain text')
  } finally {
    await app.close()
  }
})

test('spaced tildes render as strikethrough inside a code block', async() => {
  const { app, page } = await launchWithMarkdown('```\n~~ deleted ~~\n```\n')
  try {
    await expect(page.locator('.mu-codeblock-content del')).toContainText('deleted')
    await expect(page.locator('.mu-codeblock-content .mu-remove')).toHaveCount(2)
  } finally {
    await app.close()
  }
})
