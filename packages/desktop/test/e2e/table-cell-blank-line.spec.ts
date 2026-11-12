import { expect, test, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  expectNoRendererErrors, getMarkdownContent, launchWithMarkdown,
  sendIpcToRenderer, waitForEditor
} from './helpers'

const imagePath = resolve(__dirname, '../../static/logo-96px.png')
const markdown = `# Image cell\n\n| Item | Screenshot |\n| --- | --- |\n| App API Key | ![first](${imagePath}) |\n\nFollowing paragraph\n`

async function openCurrentSource(page: Page, app: ElectronApplication, filePath: string, content = markdown) {
  if (!process.env.ANNOTAMD_TEST_RENDERER_URL) return
  const url = new URL(process.env.ANNOTAMD_TEST_RENDERER_URL)
  const current = new URL(page.url())
  url.search = current.search
  url.hash = current.hash
  await page.goto(url.href)
  await page.waitForSelector('.editor-placeholder')
  await sendIpcToRenderer(app, 'annotamd::bootstrap-editor', {
    addBlankTab: false, markdownList: [], lineEnding: 'lf',
    sideBarVisibility: true, tabBarVisibility: true
  })
  await sendIpcToRenderer(app, 'annotamd::open-new-tab', {
    markdown: content, filename: 'note.md', pathname: filePath,
    encoding: { encoding: 'utf8', hasBOM: false },
    lineEnding: 'lf', adjustLineEndingOnSave: false,
    trimTrailingNewline: 1, isMixedLineEndings: false
  })
  await waitForEditor(page)
}

const cellText = (page: Page, index = 3) => page.locator('.mu-table-cell-content').nth(index).evaluate((element: any) =>
  element.__MUYA_BLOCK__.text as string)

async function clickBelowImage(page: Page, double = true) {
  const image = page.locator('.editor-component table img').last()
  await expect(image).toBeVisible()
  const box = (await image.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height + 18
  if (double) await page.mouse.dblclick(x, y)
  else await page.mouse.click(x, y)
}

test('Enter edits a new line in a wrapped cell and Backspace joins lines without exposing br markup', async() => {
  const description = '新建对话、历史对话、发送消息、取消 run、展示流式消息和工具进度；弹窗决策按钮一期只有“确认”“取消”，其余意图通过用户输入消息表达'
  const content = `# Table cell Enter\n\n| 编号 | 范围 | 本系统负责 |\n| --- | --- | --- |\n| S2 | 悬浮对话框 | ${description} |\n| S3 | 保持不变 | 下一行表格保持不变 |\n\n表格后的段落保持不变\n`
  const { app, page, filePath } = await launchWithMarkdown(content, { suppressErrorDialog: true })
  try {
    await openCurrentSource(page, app, filePath, content)
    const cell = page.locator('.mu-table-cell-content').nth(5)
    await cell.evaluate((element: any) => {
      const block = element.__MUYA_BLOCK__
      block.muya.domNode.focus()
      block.setCursor(block.text.length, block.text.length, true)
    })
    const before = await cell.locator('.mu-plain-text').evaluate(element => {
      const rects = element.getClientRects()
      return rects[rects.length - 1].top
    })
    for (const key of ['Shift+Enter', 'Enter']) {
      await page.keyboard.press(key)
      await expect.poll(() => cellText(page, 5)).toBe(`${description}<br/>`)
      const caret = await cell.evaluate(element => {
        const selection = window.getSelection()!
        const rect = selection.getRangeAt(0).getBoundingClientRect()
        return {
          height: rect.height,
          top: rect.top,
          insideCell: element.contains(selection.anchorNode),
          focused: document.hasFocus(),
          color: getComputedStyle(element).caretColor
        }
      })
      expect(caret.height).toBeGreaterThan(10)
      expect(caret.top).toBeGreaterThan(before + 10)
      expect(caret.insideCell).toBe(true)
      expect(caret.focused).toBe(true)
      expect(caret.color).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/)
      await page.screenshot({path: `/tmp/annotamd-caret-${key.replace('+', '-')}.png`, caret: 'initial'})
      await page.keyboard.insertText('x')
      await expect.poll(() => cellText(page, 5)).toBe(`${description}<br/>x`)
      await page.keyboard.press('Backspace')
      await expect.poll(() => cellText(page, 5)).toBe(`${description}<br/>`)
      await page.keyboard.press('Backspace')
      await expect.poll(() => cellText(page, 5)).toBe(description)
    }

    await page.keyboard.press('Enter')
    await page.keyboard.insertText('新行继续编辑')
    await expect.poll(() => cellText(page, 5)).toBe(`${description}<br/>新行继续编辑`)
    const line = cell.locator('.mu-plain-text').last()
    await expect(line).toHaveText('新行继续编辑')
    expect((await line.boundingBox())!.y).toBeGreaterThan(before + 10)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect.poll(() => cellText(page, 5)).toBe(`${description}<br/>新行继续编辑`)

    // Joining populated lines removes just the break, preserving both texts.
    await cell.evaluate((element: any, offset) => {
      element.__MUYA_BLOCK__.setCursor(offset, offset, true)
    }, description.length + '<br/>'.length)
    await page.keyboard.press('Backspace')
    await expect.poll(() => cellText(page, 5)).toBe(`${description}新行继续编辑`)
    await page.keyboard.insertText('继续')
    await expect.poll(() => cellText(page, 5)).toBe(`${description}继续新行继续编辑`)
    await expect(page.locator('.editor-component table tr')).toHaveCount(3)
    await expect(page.locator('.editor-component table td')).toHaveCount(9)
    await expect(page.locator('.editor-component table tr').last()).toContainText('下一行表格保持不变')
    const persisted = await getMarkdownContent(page, app)
    expect(persisted).toContain(`${description}继续新行继续编辑`)
    expect(persisted).not.toContain('<br/')
    expect(persisted).not.toContain('\u200B')
    expect(persisted).toContain('表格后的段落保持不变')
    await sendIpcToRenderer(app, 'annotamd::editor-ask-file-save')
    await expect.poll(() => readFileSync(filePath, 'utf8')).toContain(`${description}继续新行继续编辑`)
    await expectNoRendererErrors(app)
    await page.screenshot({ path: '/tmp/annotamd-table-enter-backspace.png' })
  } finally {
    await app.close()
  }
})

for (const action of ['folder', 'path']) {
  test(`double click enables a second image and ${action} saves clipboard bytes outside Markdown`, async() => {
    const { app, page, filePath } = await launchWithMarkdown(markdown, { suppressErrorDialog: true })
    try {
      await openCurrentSource(page, app, filePath)
      await sendIpcToRenderer(app, 'annotamd::user-preference', {
        imageInsertAction: action, imagePreferRelativeDirectory: true,
        imageRelativeDirectoryBase: 'file', imageRelativeDirectoryName: 'assets',
        imageFolderPath: join(dirname(filePath), 'assets')
      })
      const original = await cellText(page)
      await clickBelowImage(page, false)
      expect(await cellText(page)).toBe(original)
      await clickBelowImage(page)
      await expect.poll(() => cellText(page)).toBe(`${original}<br/>`)
      await clickBelowImage(page)
      expect(await cellText(page)).toBe(`${original}<br/>`)

      // Native menu undo must remove the new line and keep the original image.
      await sendIpcToRenderer(app, 'annotamd::editor-edit-action', 'undo')
      await expect.poll(() => cellText(page)).toBe(original)
      await expect(page.locator('.editor-component table img')).toHaveCount(1)
      await clickBelowImage(page)
      if (process.env.ANNOTAMD_TEST_EXECUTABLE) {
        const cell = page.locator('.mu-table-cell-content').nth(3)
        await page.keyboard.press('Enter')
        await expect.poll(() => cellText(page)).toBe(`${original}<br/><br/>`)
        const caretHeight = await cell.evaluate(() => window.getSelection()!.getRangeAt(0).getBoundingClientRect().height)
        expect(caretHeight).toBeGreaterThan(10)
        await page.keyboard.press('Backspace')
        await expect.poll(() => cellText(page)).toBe(`${original}<br/>`)
      }
      await page.keyboard.insertText('Second image caption')
      await expect.poll(() => cellText(page)).toBe(`${original}<br/>Second image caption`)
      await page.keyboard.press('Shift+Enter')
      const clipboardSize = await app.evaluate(({ clipboard, nativeImage }, { file, large }) => {
        let image = nativeImage.createFromPath(file)
        if (large) {
          const bitmap = Buffer.alloc(768 * 512 * 4)
          let seed = 12345
          for (let i = 0; i < bitmap.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            bitmap[i] = i % 4 === 3 ? 255 : seed >>> 24
          }
          image = nativeImage.createFromBitmap(bitmap, { width: 768, height: 512 })
        }
        clipboard.clear()
        clipboard.writeImage(image)
        return image.toDataURL().length
      }, { file: imagePath, large: action === 'path' })
      if (action === 'path') expect(clipboardSize).toBeGreaterThan(1_500_000)
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
      await expect(page.locator('.editor-component table .mu-image-success img')).toHaveCount(2)
      await expect.poll(() => cellText(page)).not.toContain('loading-')
      const text = await cellText(page)
      expect(text).not.toContain('data:image/')
      expect(text.length).toBeLessThan(500)
      expect(text).toContain('<br/>Second image caption<br/>![](assets/')
      const savedImage = text.match(/!\[\]\((assets\/[^)]+)\)/)![1]
      expect(existsSync(join(dirname(filePath), savedImage))).toBe(true)
      expect(readFileSync(join(dirname(filePath), savedImage)).subarray(0, 8))
        .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      await expect(page.locator('.editor-component table tr')).toHaveCount(2)
      await expect(page.locator('.editor-component table td')).toHaveCount(4)
      const persisted = await getMarkdownContent(page, app)
      expect(persisted).toContain(text)
      expect(persisted).toContain('Following paragraph')
      await expect(page.locator('.editor-component table .mu-image-success img')).toHaveCount(2)
      await sendIpcToRenderer(app, 'annotamd::editor-ask-file-save')
      await expect.poll(() => readFileSync(filePath, 'utf8')).toContain(text)
      expect(readFileSync(filePath, 'utf8')).not.toContain('data:image/')
      await expectNoRendererErrors(app)
      console.log(JSON.stringify({ action, clipboardDataUrlLength: clipboardSize, cellMarkdownLength: text.length }))
      await page.screenshot({ path: `/tmp/annotamd-table-second-image-${action}.png` })
      const longDocument = process.env.ANNOTAMD_TEST_LONG_DOCUMENT
      if (longDocument) {
        const info = await app.evaluate(({ app }) => ({version: app.getVersion(), executable: process.execPath}))
        expect(info.version).toBe(JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')).version)
        expect(info.executable).toBe(resolve(process.env.ANNOTAMD_TEST_EXECUTABLE!))
        const source = readFileSync(longDocument, 'utf8')
        await sendIpcToRenderer(app, 'annotamd::open-new-tab', {
          markdown: source, filename: 'design.md', pathname: longDocument,
          encoding: {encoding: 'utf8', hasBOM: false},
          lineEnding: 'lf', adjustLineEndingOnSave: false,
          trimTrailingNewline: 1, isMixedLineEndings: false
        })
        await expect(page.locator('.mu-content').filter({hasText: source.split('\n').find(line => line.startsWith('# '))!.slice(2)}).first()).toBeVisible()
        const paragraph = page.locator('.mu-paragraph-content').filter({hasText: /\S/}).first()
        await paragraph.click()
        expect(await paragraph.evaluate(element => element.contains(window.getSelection()!.anchorNode))).toBe(true)
        await expectNoRendererErrors(app)
        await page.screenshot({path: '/tmp/annotamd-v2.19-real-document.png', caret: 'initial'})
        console.log(JSON.stringify({version: info.version, packagedSmoke: true, longDocumentCharacters: source.length}))
      }
    } finally {
      await app.close()
    }
  })
}
