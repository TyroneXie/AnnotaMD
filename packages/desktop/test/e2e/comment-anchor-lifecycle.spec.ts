import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer } from './helpers'

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
    root.focus({ preventScroll: true })
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

const selectAcrossParagraphs = async(
  page: Page,
  startIndex: number,
  endIndex: number,
  startOffset = 0,
  endOffset?: number
) => {
  await page.evaluate(({ startIndex, endIndex, startOffset, endOffset }) => {
    const root = document.querySelector('.editor-component') as HTMLElement | null
    const paragraphs = root?.querySelectorAll<HTMLElement>('span.mu-paragraph-content')
    const startElement = paragraphs?.[startIndex]
    const endElement = paragraphs?.[endIndex]
    if (!root || !startElement || !endElement) throw new Error('cross-block text is unavailable')
    const startBlock = (startElement as HTMLElement & { __MUYA_BLOCK__?: any }).__MUYA_BLOCK__
    const endBlock = (endElement as HTMLElement & { __MUYA_BLOCK__?: any }).__MUYA_BLOCK__
    const selection = startBlock?.muya?.editor?.selection
    if (!startBlock || !endBlock || !selection) throw new Error('Muya cross-block selection is unavailable')

    root.focus({ preventScroll: true })
    selection.setSelection(
      { offset: startOffset, block: startBlock, path: startBlock.path },
      {
        offset: endOffset ?? endBlock.text.length,
        block: endBlock,
        path: endBlock.path
      }
    )
  }, { startIndex, endIndex, startOffset, endOffset })
  await page.waitForTimeout(150)
}

const addComment = async(
  page: Page,
  paragraphIndex: number,
  body: string,
  expectedCount = 1,
  expectedQuote = '重复文字：需要修正。'
) => {
  await selectParagraphText(page, paragraphIndex)
  await page.locator('.mu-format-picker li.annotamd_comment').click()
  const composer = page.locator('.annotamd-composer-card')
    await expect(composer).toBeVisible()
    await expect(composer.locator('blockquote')).toContainText(expectedQuote)
    await composer.locator('textarea').fill(body)
    await composer.locator('.annotamd-composer-actions button').click()
  await expect(page.locator('.annotamd-comment-card[data-comment-id]')).toHaveCount(expectedCount)
}

test('batches cached comment-card height changes into one anchored relayout', async() => {
  const { app, page } = await launchWithMarkdown('同一锚点文字。\n')
  try {
    await addComment(page, 0, '第一条', 1, '同一锚点文字。')
    await addComment(page, 0, '第二条', 2, '同一锚点文字。')
    const cards = page.locator('.annotamd-comment-card[data-comment-id]')
    const readSecondTop = () => cards.nth(1).evaluate(
      (card) => Number.parseFloat((card as HTMLElement).style.top)
    )
    await expect.poll(readSecondTop).toBeGreaterThan(0)
    const secondTopBefore = await readSecondTop()

    await cards.nth(0).locator('.annotamd-reply-action').click()
    await expect(cards.nth(0).locator('.annotamd-reply-editor')).toBeVisible()

    await expect.poll(async() => {
      return cards.nth(1).evaluate((card) => Number.parseFloat((card as HTMLElement).style.top))
    }).toBeGreaterThan(secondTopBefore)
  } finally {
    await app.close()
  }
})

test('keeps every reply separate and lets every Local message edit or delete', async() => {
  const markdown = '多轮评论锚点。\n'
  const { app, page, filePath } = await launchWithMarkdown(markdown)
  try {
    await addComment(page, 0, '最开始的评论', 1, '多轮评论锚点。')
    const card = page.locator('.annotamd-comment-card[data-comment-id]')
    const replyButton = card.locator('.annotamd-reply-action')

    await expect(replyButton).toHaveCount(1)
    await replyButton.click()
    await card.locator('.annotamd-reply-editor textarea').fill('Local 第一轮回复')
    await card.locator('.annotamd-reply-editor button').click()
    await replyButton.click()
    await card.locator('.annotamd-reply-editor textarea').fill('Local 第二轮回复')
    await card.locator('.annotamd-reply-editor button').click()

    const replies = card.locator('.annotamd-reply-message')
    await expect(replies).toHaveCount(2)
    await expect(replies.nth(0).locator('.annotamd-message-author')).toHaveText('Local')
    await expect(replies.nth(0).locator('p')).toHaveText('Local 第一轮回复')
    await expect(replies.nth(1).locator('.annotamd-message-author')).toHaveText('Local')
    await expect(replies.nth(1).locator('p')).toHaveText('Local 第二轮回复')
    await expect(card.locator('.annotamd-replies')).toHaveCSS('border-left-width', '0px')

    const rootMessage = card.locator('.annotamd-root-message')
    await rootMessage.locator('.annotamd-message-actions button').nth(0).click()
    await rootMessage.locator('textarea').fill('最开始的评论已编辑')
    await rootMessage.locator('.annotamd-message-actions button').nth(0).click()
    await expect(rootMessage.locator('p')).toHaveText('最开始的评论已编辑')

    await replies.nth(0).locator('.annotamd-message-actions button').nth(0).click()
    await replies.nth(0).locator('textarea').fill('Local 第一轮已编辑')
    await replies.nth(0).locator('.annotamd-message-actions button').nth(0).click()
    await expect(replies.nth(0).locator('p')).toHaveText('Local 第一轮已编辑')
    await expect(replies.nth(1).locator('p')).toHaveText('Local 第二轮回复')

    await expect.poll(async() => page.evaluate(async({ pathname, content }) => {
      const document = await window.electron.ipcRenderer.invoke('mt::comments::load', pathname, content)
      return document.comments[0]?.replies.length ?? 0
    }, { pathname: filePath, content: markdown })).toBe(2)

    const agentReplyId = `agent-reply-${Date.now()}`
    await page.evaluate(async({ pathname, replyId, content }) => {
      const document = await window.electron.ipcRenderer.invoke('mt::comments::load', pathname, content)
      const comment = document.comments[0]
      comment.replies.push({
        id: replyId,
        body: 'Agent 第三轮回复',
        author: 'agent',
        createdAt: Date.now()
      })
      await window.electron.ipcRenderer.invoke('mt::comments::replace', {
        filePath: pathname,
        markdown: content,
        expectedRevision: document.revision,
        comments: document.comments
      })
    }, { pathname: filePath, replyId: agentReplyId, content: markdown })
    await sendIpcToRenderer(app, 'mt::comments::changed', filePath)

    await expect(replies).toHaveCount(3)
    await expect(replies.nth(2).locator('.annotamd-message-author')).toHaveText('Agent')
    await expect(replies.nth(2).locator('p')).toHaveText('Agent 第三轮回复')
    await expect(replies.nth(2).locator('.annotamd-message-actions')).toHaveCount(0)
    await expect(rootMessage.locator('.annotamd-message-actions button').nth(0)).toBeVisible()
    await expect(replies.nth(0).locator('.annotamd-message-actions button').nth(0)).toBeVisible()

    await replyButton.click()
    await card.locator('.annotamd-reply-editor textarea').fill('Local 第四轮回复')
    await card.locator('.annotamd-reply-editor button').click()
    await expect(replies).toHaveCount(4)
    await expect(replies.nth(3).locator('.annotamd-message-author')).toHaveText('Local')

    await replies.nth(0).locator('.annotamd-message-actions button').nth(1).click()
    await expect(replies).toHaveCount(3)
    await expect(replies.nth(0).locator('p')).toHaveText('Local 第二轮回复')
    await expect(replies.nth(1).locator('p')).toHaveText('Agent 第三轮回复')
  } finally {
    await app.close()
  }
})

test('centers the start panel after closing the last tab with comments open', async() => {
  const { app, page } = await launchWithMarkdown('关闭标签页后的居中锚点。\n')
  try {
    await addComment(page, 0, '保持批注栏开启', 1, '关闭标签页后的居中锚点。')
    await expect(page.locator('.editor-container')).toHaveClass(/comment-pane-open/)

    await sendIpcToRenderer(app, 'mt::editor-close-tab')
    const emptyState = page.locator('.recent-files-projects')
    const startPanel = page.locator('.start-panel')
    await expect(emptyState).toBeVisible()
    await expect(page.locator('.editor-container')).not.toHaveClass(/comment-pane-open/)
    await expect.poll(async() => page.locator('.editor-container').evaluate((element) => {
      return getComputedStyle(element).getPropertyValue('--annotamd-comment-pane-width').trim()
    })).toBe('0px')
    await expect.poll(async() => {
      const [containerBox, panelBox] = await Promise.all([
        emptyState.boundingBox(),
        startPanel.boundingBox()
      ])
      if (!containerBox || !panelBox) return Number.POSITIVE_INFINITY
      const containerCenter = containerBox.x + containerBox.width / 2
      const panelCenter = panelBox.x + panelBox.width / 2
      return Math.abs(containerCenter - panelCenter)
    }).toBeLessThan(1)
  } finally {
    await app.close()
  }
})

test('orders comments by their anchors and keeps positions stable while cards leave the viewport', async() => {
  const trailingParagraphs = Array.from({ length: 40 }, (_, index) => `滚动填充 ${index + 1}。`)
  const { app, page } = await launchWithMarkdown([
    '上方批注锚点。',
    '',
    '间隔内容。',
    '',
    '下方批注锚点。',
    '',
    ...trailingParagraphs
  ].join('\n'))
  try {
    await addComment(page, 0, '上方评论', 1, '上方批注锚点。')
    await selectParagraphText(page, 2)
    await page.locator('.mu-format-picker li.annotamd_comment').click()

    const savedCard = page.locator('.annotamd-comment-card[data-comment-id]').filter({
      has: page.getByText('上方评论', { exact: true })
    })
    const composer = page.locator('.annotamd-composer-card')
    await expect(composer).toBeVisible()
    await expect.poll(async() => {
      const [savedTop, composerTop] = await Promise.all([
        savedCard.evaluate((card) => Number.parseFloat((card as HTMLElement).style.top)),
        composer.evaluate((card) => Number.parseFloat((card as HTMLElement).style.top))
      ])
      return composerTop > savedTop
    }).toBe(true)

    await composer.locator('textarea').fill('下方评论')
    await composer.locator('.annotamd-composer-actions button').click()
    const cards = page.locator('.annotamd-comment-card[data-comment-id]')
    await expect(cards).toHaveCount(2)

    await expect.poll(async() => cards.evaluateAll((elements) => elements.every(
      (element) => Number.isFinite(Number.parseFloat((element as HTMLElement).style.top))
    ))).toBe(true)

    const positionsBefore = await cards.evaluateAll((elements) => elements.map(
      (element) => Number.parseFloat((element as HTMLElement).style.top)
    ))
    await page.locator('.editor-component').evaluate((editor, scrollTop) => {
      editor.scrollTop = scrollTop
      editor.dispatchEvent(new Event('scroll'))
    }, positionsBefore[0] + 1)
    await expect.poll(async() => cards.evaluateAll((elements) => elements.map(
      (element) => Number.parseFloat((element as HTMLElement).style.top)
    ))).toEqual(positionsBefore)
    await expect.poll(async() => cards.evaluateAll((elements) => elements.every(
      (element) => getComputedStyle(element).visibility === 'visible'
    ))).toBe(true)

    await page.locator('.editor-component').evaluate((editor) => {
      editor.scrollTop = editor.scrollHeight
      editor.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(async() => cards.evaluateAll((elements) => {
      return elements.every((element) => getComputedStyle(element).visibility === 'visible')
    })).toBe(true)

    await page.locator('.editor-component').evaluate((editor) => {
      editor.scrollTop = 0
      editor.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(async() => cards.evaluateAll((elements) => elements.map(
      (element) => Number.parseFloat((element as HTMLElement).style.top)
    ))).toEqual(positionsBefore)
  } finally {
    await app.close()
  }
})

test('connects a comment underline across inline-code padding', async() => {
  const { app, page } = await launchWithMarkdown('必须使用 `dify-app-preflight`，并传入。\n')
  try {
    await addComment(page, 0, '跨行内代码评论', 1, '必须使用 `dify-app-preflight`，并传入。')
    const code = page.locator('code.mu-inline-rule')

    await expect(code).toHaveClass(/annotamd-(?:active-)?comment-code-bridge-start/)
    await expect(code).toHaveClass(/annotamd-(?:active-)?comment-code-bridge-end/)
    await expect.poll(async() => code.evaluate((element) => {
      const before = getComputedStyle(element, '::before')
      const after = getComputedStyle(element, '::after')
      return before.content !== 'none' && after.content !== 'none'
    })).toBe(true)
  } finally {
    await app.close()
  }
})

test('creates one comment across paragraphs and list items', async() => {
  const { app, page } = await launchWithMarkdown([
    '跨块评论起点。',
    '',
    '- 列表项一。',
    '- 列表项二。',
    '',
    '跨块评论终点。'
  ].join('\n'))
  try {
    await selectAcrossParagraphs(page, 0, 3)
    const toolbar = page.locator('.mu-format-picker')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.locator('li.annotamd_comment')).toBeVisible()
    await expect(toolbar.locator('li.strong')).toHaveCount(0)

    await toolbar.locator('li.annotamd_comment').click()
    const composer = page.locator('.annotamd-composer-card')
    await expect(composer).toBeVisible()
    await expect(composer.locator('blockquote')).toContainText(
      '跨块评论起点。 列表项一。 列表项二。 跨块评论终点。'
    )
    await composer.locator('textarea').fill('跨块评论')
    await composer.locator('.annotamd-composer-actions button').click()

    const card = page.locator('.annotamd-comment-card[data-comment-id]')
    await expect(card).toHaveCount(1)
    await expect(card.locator('blockquote')).toContainText('跨块评论起点。')
    await expect(card.locator('blockquote')).toContainText('跨块评论终点。')
    await expect(card.locator('blockquote')).toHaveCSS('white-space', 'nowrap')
    await expect(card.locator('blockquote')).toHaveCSS('text-overflow', 'ellipsis')
    await expect(page.locator('.annotamd-comment-list')).toHaveCSS('padding-left', '8px')
  } finally {
    await app.close()
  }
})

test('keeps the text anchor visible while expanding threads and navigating comments', async() => {
  const paragraphs = Array.from({ length: 48 }, (_, index) => `评论导航段落 ${index + 1}。`)
  const firstIndex = 5
  const secondIndex = 42
  const { app, page } = await launchWithMarkdown(paragraphs.join('\n\n'))
  try {
    await addComment(
      page,
      firstIndex,
      '第一条长评论',
      1,
      paragraphs[firstIndex]
    )
    const firstCard = page.locator('.annotamd-comment-card[data-comment-id]').filter({
      hasText: '第一条长评论'
    })
    const replyButton = firstCard.locator('.annotamd-reply-action')
    for (const reply of ['第一轮较长回复内容', '第二轮较长回复内容', '第三轮最新回复内容']) {
      await replyButton.click()
      await firstCard.locator('.annotamd-reply-editor textarea').fill(reply)
      await firstCard.locator('.annotamd-reply-editor button').click()
    }

    const secondAnchorBeforeComment = page.locator('span.mu-paragraph-content').nth(secondIndex)
    await secondAnchorBeforeComment.evaluate((anchor) => {
      const scroller = document.querySelector<HTMLElement>('.editor-component')
      if (!scroller) throw new Error('editor scroller is unavailable')
      const viewport = scroller.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      scroller.scrollTop += anchorRect.top - (viewport.top + viewport.height * 0.4)
      scroller.dispatchEvent(new Event('scroll'))
    })
    await expect(secondAnchorBeforeComment).toBeInViewport()
    await addComment(
      page,
      secondIndex,
      '第二条远距离评论',
      2,
      paragraphs[secondIndex]
    )
    const secondCard = page.locator('.annotamd-comment-card[data-comment-id]').filter({
      hasText: '第二条远距离评论'
    })
    const firstAnchor = page.locator('span.mu-paragraph-content').nth(firstIndex)
    const secondAnchor = page.locator('span.mu-paragraph-content').nth(secondIndex)
    const editor = page.locator('.editor-component')

    await expect(firstCard.locator('.annotamd-comment-scope')).toHaveText('Selection')
    await expect(firstCard.locator('.annotamd-comment-card-actions > button')).toHaveText('Resolve')
    await expect.poll(async() => firstCard.locator('.annotamd-comment-row').evaluate(
      (element) => element.getBoundingClientRect().height
    )).toBeLessThanOrEqual(34)
    await expect(firstCard).toHaveClass(/compact/)
    await expect(firstCard.locator('.annotamd-thread-message:visible')).toHaveCount(1)
    await expect(firstCard.locator('.annotamd-thread-toggle')).toContainText('4')

    await firstAnchor.evaluate((anchor) => {
      const scroller = document.querySelector<HTMLElement>('.editor-component')
      if (!scroller) throw new Error('editor scroller is unavailable')
      const viewport = scroller.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      scroller.scrollTop += anchorRect.top - (viewport.top + viewport.height * 0.28)
      scroller.dispatchEvent(new Event('scroll'))
    })
    await expect(firstAnchor).toBeInViewport()
    const scrollBeforeFocus = await editor.evaluate((element) => element.scrollTop)

    await firstAnchor.click()
    await expect(firstCard).toHaveClass(/selected/)
    await expect(firstCard).not.toHaveClass(/compact/)
    await expect(firstCard.locator('.annotamd-thread-message:visible')).toHaveCount(4)
    await expect.poll(async() => {
      const [cardTop, anchorTop] = await Promise.all([
        firstCard.evaluate((element) => element.getBoundingClientRect().top),
        firstAnchor.evaluate((element) => element.getBoundingClientRect().top)
      ])
      return Math.abs(cardTop - anchorTop)
    }).toBeLessThan(2)
    await page.waitForTimeout(400)
    await expect.poll(async() => Math.abs(
      await editor.evaluate((element) => element.scrollTop) - scrollBeforeFocus
    )).toBeLessThan(2)

    const scrollBeforeCollapse = await editor.evaluate((element) => element.scrollTop)
    await firstCard.locator('.annotamd-thread-toggle').click()
    await expect(firstCard).toHaveClass(/compact/)
    await expect(firstCard.locator('.annotamd-thread-message:visible')).toHaveCount(1)
    await expect.poll(async() => Math.abs(
      await editor.evaluate((element) => element.scrollTop) - scrollBeforeCollapse
    )).toBeLessThan(2)

    await secondAnchor.evaluate((anchor) => {
      const scroller = document.querySelector<HTMLElement>('.editor-component')
      if (!scroller) throw new Error('editor scroller is unavailable')
      const viewport = scroller.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      scroller.scrollTop += anchorRect.top - (viewport.top + viewport.height * 0.4)
      scroller.dispatchEvent(new Event('scroll'))
    })
    await expect(secondAnchor).toBeInViewport()
    const scrollBeforeSecondFocus = await editor.evaluate((element) => element.scrollTop)
    await secondAnchor.click()
    await expect(secondCard).toHaveClass(/selected/)
    await expect(secondCard.locator('.annotamd-comment-next')).toBeDisabled()
    await expect(secondCard.locator('.annotamd-comment-previous')).toBeEnabled()
    await expect.poll(async() => Math.abs(
      await editor.evaluate((element) => element.scrollTop) - scrollBeforeSecondFocus
    )).toBeLessThan(2)
    await expect.poll(async() => {
      const [cardTop, anchorTop] = await Promise.all([
        secondCard.evaluate((element) => element.getBoundingClientRect().top),
        secondAnchor.evaluate((element) => element.getBoundingClientRect().top)
      ])
      return Math.abs(cardTop - anchorTop)
    }).toBeLessThan(2)

    await secondCard.locator('.annotamd-comment-previous').click()
    await expect(firstCard).toHaveClass(/selected/)
    await expect.poll(async() => firstAnchor.evaluate((anchor) => {
      const scroller = document.querySelector<HTMLElement>('.editor-component')
      if (!scroller) return Number.POSITIVE_INFINITY
      const viewport = scroller.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      return Math.abs(
        (anchorRect.top - viewport.top) / viewport.height - 0.28
      )
    })).toBeLessThan(0.03)
  } finally {
    await app.close()
  }
})

test('uses one shared scrollbar at the far right for the editor and comments', async() => {
  const trailingParagraphs = Array.from({ length: 50 }, (_, index) => `共享滚动填充 ${index + 1}。`)
  const { app, page } = await launchWithMarkdown([
    '共享滚动批注锚点。',
    '',
    ...trailingParagraphs
  ].join('\n'))
  try {
    await addComment(page, 0, '共享滚动评论', 1, '共享滚动批注锚点。')
    const editor = page.locator('.annotamd-editor-scroll-container')
    const commentList = page.locator('.annotamd-comment-list')

    const header = page.locator('.annotamd-comment-header')
    const headerTitle = page.locator('.annotamd-comment-title')
    const tabs = page.locator('.editor-tabs')
    await expect(commentList).toHaveCSS('overflow-y', 'auto')
    await expect(commentList).not.toHaveClass(/annotamd-scrollbar-visible/)
    await expect(headerTitle).toHaveCSS('font-size', '14px')
    await expect(headerTitle).toHaveCSS('line-height', '20px')
    await expect.poll(async() => {
      const [headerRect, tabsRect] = await Promise.all([
        header.evaluate((element) => {
          const { top, bottom, height } = element.getBoundingClientRect()
          return { top, bottom, height }
        }),
        tabs.evaluate((element) => {
          const { top, bottom, height } = element.getBoundingClientRect()
          return { top, bottom, height }
        })
      ])
      return Math.max(
        Math.abs(headerRect.top - tabsRect.top),
        Math.abs(headerRect.bottom - tabsRect.bottom),
        Math.abs(headerRect.height - tabsRect.height)
      )
    }).toBeLessThan(1)
    await expect.poll(async() => {
      const [headerShadow, tabsShadow] = await Promise.all([
        header.evaluate((element) => getComputedStyle(element).boxShadow),
        tabs.evaluate((element) => getComputedStyle(element).boxShadow)
      ])
      return headerShadow === tabsShadow
    }).toBe(true)
    await commentList.hover()
    await page.mouse.wheel(0, 500)

    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect.poll(async() => {
      const [editorTop, commentTop] = await Promise.all([
        editor.evaluate((element) => element.scrollTop),
        commentList.evaluate((element) => element.scrollTop)
      ])
      return Math.abs(editorTop - commentTop)
    }).toBeLessThan(1)
    await expect.poll(async() => {
      const [editorRange, commentRange] = await Promise.all([
        editor.evaluate((element) => element.scrollHeight - element.clientHeight),
        commentList.evaluate((element) => element.scrollHeight - element.clientHeight)
      ])
      return Math.abs(editorRange - commentRange)
    }).toBeLessThan(1)
    await expect(commentList).toHaveClass(/annotamd-scrollbar-visible/)
    await page.waitForTimeout(5_100)
    await expect(commentList).not.toHaveClass(/annotamd-scrollbar-visible/)

    await page.locator('.annotamd-pane-close').click()
    await expect(page.locator('.annotamd-comment-pane')).toHaveCount(0)
    await expect(editor).not.toHaveClass(/annotamd-shared-scroll-source/)
    await expect(editor).toHaveClass(/annotamd-auto-hide-scrollbar/)
    await expect(editor).not.toHaveClass(/annotamd-scrollbar-visible/)

    await editor.evaluate((element) => {
      const maxScrollTop = element.scrollHeight - element.clientHeight
      element.scrollTop = element.scrollTop > 0 ? 0 : Math.min(100, maxScrollTop)
      element.dispatchEvent(new Event('scroll'))
    })
    await expect(editor).toHaveClass(/annotamd-scrollbar-visible/)
    await page.waitForTimeout(5_100)
    await expect(editor).not.toHaveClass(/annotamd-scrollbar-visible/)
  } finally {
    await app.close()
  }
})

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
