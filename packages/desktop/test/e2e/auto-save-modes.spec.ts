import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  launchWithMarkdown,
  placeCaretInEditor,
  setSourceMarkdown,
  waitForMenuReady
} from './helpers'

const readFile = (path: string) => fs.readFileSync(path, 'utf8')

test('WYSIWYG and source mode save automatically by default', async() => {
  const { app, page, filePath } = await launchWithMarkdown('start\n')
  await waitForMenuReady(app)

  await placeCaretInEditor(page)
  await page.keyboard.type(' WYSIWYG_SAVE', { delay: 0 })
  await expect.poll(() => readFile(filePath), { timeout: 10000 }).toContain('WYSIWYG_SAVE')

  const afterWysiwyg = readFile(filePath)
  await setSourceMarkdown(page, app, `${afterWysiwyg.trimEnd()}\nSOURCE_SAVE\n`)
  await expect.poll(() => readFile(filePath), { timeout: 10000 }).toContain('SOURCE_SAVE')

  await app.close()
})
