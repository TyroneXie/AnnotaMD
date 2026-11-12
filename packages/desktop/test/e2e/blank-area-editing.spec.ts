import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { resolve } from 'node:path'
import { enterSourceMode, expectNoRendererErrors, launchWithMarkdown, sendIpcToRenderer, waitForEditor } from './helpers'

const imagePath = resolve(__dirname, '../../static/logo-96px.png')

async function expectNativeCaret(page: Page, target: Locator) {
  expect(await page.evaluate(() => CSS.supports('caret-animation', 'manual'))).toBe(true)
  await page.addStyleTag({content: '* { caret-animation: manual !important; }'})
  const box = (await target.boundingBox())!
  const viewport = await page.evaluate(() => ({width: innerWidth, height: innerHeight}))
  const clip = {
    x: Math.max(0, box.x), y: Math.max(0, box.y),
    width: Math.min(box.width, viewport.width - box.x),
    height: Math.min(box.height, viewport.height - box.y)
  }
  const color = await target.evaluate(element => getComputedStyle(element).caretColor)
  expect(color).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/)
  const visible = await page.screenshot({clip, caret: 'initial', animations: 'disabled'})
  const hidden = await page.screenshot({clip, caret: 'hide', animations: 'disabled'})
  expect(visible.equals(hidden), 'native caret must paint pixels inside the editing area').toBe(false)
}

const editableCases = [
  ['paragraph text', 'Paragraph source', '.mu-paragraph-content'],
  ['heading text', '## Heading source', '.mu-atxheading-content'],
  ['setext heading text', 'Heading source\n===', '.mu-setextheading-content'],
  ['unordered list text', '- First item\n- Second item', '.mu-list-item .mu-paragraph-content'],
  ['ordered list text', '1. First item\n2. Second item', '.mu-list-item .mu-paragraph-content'],
  ['task list text', '- [ ] First task\n- [x] Second task', '.mu-task-list-item .mu-paragraph-content'],
  ['quote text', '> Quoted source', '.mu-block-quote .mu-paragraph-content'],
  ['highlight block text', '> [!HIGHLIGHT]\n> Highlight source', '.mu-highlight-block .mu-paragraph-content'],
  ['footnote text', '[^note]: Footnote source', '.mu-footnote .mu-paragraph-content'],
  ['front matter text', '---\ntitle: source\n---', '.mu-frontmatter .mu-codeblock-content'],
  ['math source text', '$$\na = b\n$$', '.mu-math-block .mu-codeblock-content'],
  ['HTML source text', '<div>source</div>', '.mu-html-block .mu-codeblock-content'],
  ['diagram source text', '```mermaid\ngraph TD\nA --> B\n```', '.mu-diagram-block .mu-codeblock-content'],
  ['code block text', '```js\nconst value = 1\n```', '.mu-codeblock-content'],
  ['empty code block', '```js\n\n```', '.mu-codeblock-content'],
  ['table cell text', '| First | Second |\n| --- | --- |\n| A | B |', '.mu-table-cell-content'],
  ['empty table cell', '|  | Second |\n| --- | --- |\n| A | B |', '.mu-table-cell-content'],
  ['inline code text', 'Before `inline code` after', '.mu-paragraph-content code'],
  ['bold text', 'Before **bold text** after', '.mu-paragraph-content strong']
]

for (const [name, source, selector] of editableCases) {
  test(`clicking ${name} paints a caret and accepts input`, async() => {
    const markdown = `${source}\n\nFollowing paragraph\n`
    const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
    try {
      await useCurrentRenderer(page, app, markdown)
      const before = await state(page)
      const target = page.locator(selector).first()
      if (name === 'math source text') await page.locator('.mu-math-preview').click()
      if (name === 'HTML source text') {
        await page.locator('.mu-paragraph-content').last().click()
        await page.keyboard.press('Home')
        await page.keyboard.press('ArrowUp')
      }
      if (name === 'diagram source text') {
        const diagram = page.locator('.mu-diagram-block')
        await diagram.hover()
        await diagram.locator('.mu-diagram-view-toggle').click()
        await diagram.locator('[data-diagram-view="code"]').click()
      }
      await target.click()
      await expectNativeCaret(page, target)
      await page.keyboard.insertText('CARET_INPUT')
      await expect.poll(async() => JSON.stringify(await state(page))).toContain('CARET_INPUT')
      expect((await state(page)).map(block => block.name)).toEqual(before.map(block => block.name))
      await expectNoRendererErrors(app)
    } finally {
      await app.close()
    }
  })
}

test('document comment, selection comment, find and Agent inputs paint a caret when clicked', async() => {
  const markdown = 'Paragraph source\n\nFollowing paragraph\n'
  const { app, page, filePath } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await useCurrentRenderer(page, app, markdown, filePath)
    const footer = page.locator('.annotamd-document-comment-mount textarea')
    await footer.click()
    await expectNativeCaret(page, footer)
    await page.keyboard.insertText('Comment draft')
    await expect(footer).toHaveValue('Comment draft')

    await sendIpcToRenderer(app, 'annotamd::editor-edit-action', 'find')
    const find = page.locator('.search-bar input').first()
    await find.click()
    await expectNativeCaret(page, find)
    await page.keyboard.insertText('Paragraph')
    await expect(find).toHaveValue('Paragraph')
    await page.keyboard.press('Escape')

    const paragraph = page.locator('.mu-paragraph-content').first()
    await paragraph.selectText()
    await paragraph.evaluate(element => {
      element.closest('.editor-component')!.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'ArrowRight', bubbles: true, cancelable: true
      }))
    })
    await page.locator('.mu-format-picker li.annotamd_comment').click()
    const comment = page.locator('.annotamd-composer-card textarea')
    await comment.click()
    await expectNativeCaret(page, comment)
    await page.keyboard.insertText('Selection comment draft')
    await expect(comment).toHaveValue('Selection comment draft')

    await page.locator('.sidebar-agent-toggle').click()
    const agent = page.getByTestId('ai-composer')
    await expect(agent).toBeEnabled()
    await agent.click()
    await expectNativeCaret(page, agent)
    await page.keyboard.insertText('Agent draft')
    await expect(agent).toHaveValue('Agent draft')
    expect((await state(page)).map(block => block.text)).toEqual(['Paragraph source', 'Following paragraph'])
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('source editor cursor is visible and accepts input after a click', async() => {
  const markdown = 'Paragraph source\n\nFollowing paragraph\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await useCurrentRenderer(page, app, markdown)
    await enterSourceMode(page, app)
    await page.locator('.source-code .CodeMirror').evaluate((element: any) => element.CodeMirror.setOption('cursorBlinkRate', 0))
    await page.locator('.source-code .CodeMirror-lines').click({position: {x: 30, y: 10}})
    const cursor = page.locator('.source-code .CodeMirror-cursors .CodeMirror-cursor').first()
    await expect(cursor).toBeVisible()
    expect((await cursor.boundingBox())!.height).toBeGreaterThan(10)
    await page.keyboard.insertText('SOURCE_CARET')
    expect(await page.locator('.source-code .CodeMirror').evaluate((element: any) => element.CodeMirror.getValue())).toContain('SOURCE_CARET')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

async function useCurrentRenderer(page: Page, app: ElectronApplication, markdown: string, filePath?: string) {
  if (!process.env.ANNOTAMD_TEST_RENDERER_URL) return
  const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL)
  const current = new URL(page.url())
  url.search = current.search
  url.hash = current.hash
  await page.goto(url.href)
  await page.waitForSelector('.editor-placeholder')
  await sendIpcToRenderer(app, 'annotamd::bootstrap-editor', {
    addBlankTab: false, markdownList: filePath ? [] : [markdown], lineEnding: 'lf',
    sideBarVisibility: true, tabBarVisibility: true
  })
  if (filePath) {
    await sendIpcToRenderer(app, 'annotamd::open-new-tab', {
      markdown, filename: 'note.md', pathname: filePath,
      encoding: {encoding: 'utf8', hasBOM: false},
      lineEnding: 'lf', adjustLineEndingOnSave: false,
      trimTrailingNewline: 1, isMixedLineEndings: false
    })
  }
  await waitForEditor(page)
  if (markdown.startsWith('[^note]:')) {
    await page.locator('.editor-component .mu-container').evaluate((element: any) => {
      element.__MUYA_BLOCK__.muya.setOptions({footnote: true}, true)
    })
  }
}

async function state(page: Page) {
  return page.locator('.editor-component .mu-container').evaluate((element: any) => {
    const muya = element.__MUYA_BLOCK__.muya
    muya.editor.jsonState.flush()
    return muya.getState() as Array<{name: string; text?: string}>
  })
}

const cases = [
  ['paragraph', 'Paragraph source'],
  ['heading', '## Heading source'],
  ['setext heading', 'Heading source\n==='],
  ['unordered list', '- First item\n- Second item'],
  ['ordered list', '1. First item\n2. Second item'],
  ['task list', '- [ ] First task\n- [x] Second task'],
  ['quote', '> Quoted source'],
  ['highlight block', '> [!HIGHLIGHT]\n> Highlight source'],
  ['footnote', '[^note]: Footnote source'],
  ['front matter', '---\ntitle: source\n---'],
  ['math block', '$$\na = b\n$$'],
  ['HTML block', '<div>source</div>'],
  ['diagram', '```mermaid\ngraph TD\nA --> B\n```'],
  ['code block', '```js\nconst value = 1\n```'],
  ['horizontal rule', '---'],
  ['table', '| First | Second |\n| --- | --- |\n| A | B |'],
  ['image', `![source](${imagePath})`]
]

for (const [name, source] of cases) {
  test(`double click below ${name} inserts one editable paragraph and supports undo`, async() => {
    const markdown = `${source}\n\nFollowing paragraph\n`
    const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
    try {
      await useCurrentRenderer(page, app, markdown)
      const container = page.locator('.editor-component .mu-container')
      const blocks = container.locator(':scope > *:not(.annotamd-document-comment-mount)')
      if (name === 'image') await expect(blocks.first().locator('.mu-image-success img')).toBeVisible()
      const before = await state(page)
      const first = (await blocks.first().boundingBox())!
      const next = (await blocks.nth(1).boundingBox())!
      let point = {x: first.x + first.width / 2, y: (first.y + first.height + next.y) / 2}
      if (name === 'image') {
        const image = (await blocks.first().locator('img').boundingBox())!
        point = {x: image.x + image.width / 2, y: image.y + image.height + 18}
      }
      await page.mouse.dblclick(point.x, point.y)
      await expect.poll(() => state(page)).toEqual([before[0], {name: 'paragraph', text: ''}, before[1]])
      await page.mouse.dblclick(point.x, point.y)
      expect(await state(page)).toEqual([before[0], {name: 'paragraph', text: ''}, before[1]])
      await expectNativeCaret(page, blocks.nth(1).locator('.mu-content'))
      await page.screenshot({path: `/tmp/annotamd-blank-${name.replaceAll(' ', '-')}.png`, caret: 'initial'})
      await sendIpcToRenderer(app, 'annotamd::editor-edit-action', 'undo')
      await expect.poll(() => state(page)).toEqual(before)
      await sendIpcToRenderer(app, 'annotamd::editor-edit-action', 'redo')
      await expect.poll(() => state(page)).toEqual([before[0], {name: 'paragraph', text: ''}, before[1]])
      await page.keyboard.insertText('New editable line')
      await expect.poll(() => state(page)).toEqual([before[0], {name: 'paragraph', text: 'New editable line'}, before[1]])
      await expectNoRendererErrors(app)
    } finally {
      await app.close()
    }
  })
}

for (const location of ['before document', 'after document', 'empty document']) {
  test(`double click ${location} focuses one editable line`, async() => {
    const markdown = location === 'empty document' ? '' : '## First heading\n\nLast paragraph\n'
    const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
    try {
      await useCurrentRenderer(page, app, markdown)
      const container = page.locator('.editor-component .mu-container')
      const blocks = container.locator(':scope > *:not(.annotamd-document-comment-mount)')
      const before = await state(page)
      const first = (await blocks.first().boundingBox())!
      const last = (await blocks.last().boundingBox())!
      const point = {x: first.x + 30, y: location === 'before document' ? first.y - 8 : last.y + last.height + 12}
      await page.mouse.dblclick(point.x, point.y)
      const insertedIndex = location === 'after document' ? before.length : 0
      await expectNativeCaret(page, blocks.nth(insertedIndex).locator('.mu-content'))
      await page.keyboard.insertText('Boundary editing')
      const expected = location === 'empty document'
        ? [{name: 'paragraph', text: 'Boundary editing'}]
        : location === 'before document'
          ? [{name: 'paragraph', text: 'Boundary editing'}, ...before]
          : [...before, {name: 'paragraph', text: 'Boundary editing'}]
      await expect.poll(() => state(page)).toEqual(expected)
      await expectNoRendererErrors(app)
    } finally {
      await app.close()
    }
  })
}

test('double clicking a word preserves word selection and document structure', async() => {
  const markdown = 'Selectable words remain editable\n\nFollowing paragraph\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await useCurrentRenderer(page, app, markdown)
    const before = await state(page)
    const point = await page.locator('.mu-paragraph-content').first().evaluate(element => {
      const text = element.querySelector('.mu-plain-text')!.firstChild!
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 10)
      const rect = range.getBoundingClientRect()
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}
    })
    await page.mouse.dblclick(point.x, point.y)
    expect((await page.evaluate(() => window.getSelection()!.toString())).trim()).toBe('Selectable')
    expect(await state(page)).toEqual(before)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('blank space to the right of text and comment controls do not insert document lines', async() => {
  const markdown = 'Short paragraph\n\nFollowing paragraph\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await useCurrentRenderer(page, app, markdown)
    const before = await state(page)
    const text = (await page.locator('.mu-paragraph-content').first().boundingBox())!
    await page.mouse.dblclick(text.x + text.width - 10, text.y + text.height / 2)
    expect(await state(page)).toEqual(before)
    await page.locator('.annotamd-document-comment-mount textarea').dblclick()
    expect(await state(page)).toEqual(before)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('blank space inside a code block remains code editing', async() => {
  const markdown = '```js\nconst value = 1\n\n\n```\n\nFollowing paragraph\n'
  const { app, page } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
  try {
    await useCurrentRenderer(page, app, markdown)
    const before = await state(page)
    const code = (await page.locator('.mu-codeblock-content').boundingBox())!
    await page.mouse.dblclick(code.x + 10, code.y + code.height - 5)
    expect(await state(page)).toEqual(before)
    await page.keyboard.insertText('code_in_blank')
    await expect.poll(async() => (await state(page))[0].text).toContain('code_in_blank')
    expect((await state(page)).map(block => block.name)).toEqual(['code-block', 'paragraph'])
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
