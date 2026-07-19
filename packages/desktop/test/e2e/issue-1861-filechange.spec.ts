import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import fs from 'fs'
import path from 'node:path'
import { launchWithMarkdown, waitForMenuReady } from './helpers'

// #1861 — rewriting the open file on disk with byte-identical content (e.g. a
// git checkout that left it unchanged) fires a watcher 'change', but must NOT
// mark the tab unsaved or show the "file changed on disk" banner. A genuinely
// different on-disk content reloads automatically without prompting.
//
// This drives the REAL watcher: it writes the actual file and lets the
// main-process chokidar watcher -> loadMarkdownFile -> renderer handler run,
// rather than hand-crafting the IPC payload (which would tautologically match).

const isDirty = (page: Page) =>
  page.evaluate(() => !!document.querySelector('.editor-tabs li.unsaved'))

// The open-file watcher keeps awaitWriteFinish (stabilityThreshold 1000ms), so
// a disk write surfaces ~1–2s later with either the native or polling backend.
const WATCH_SETTLE = 2500

test.describe('Issue #1861 — content-identical file change', () => {
  test('an identical rewrite stays clean; a real change reloads automatically', async() => {
    const { app, page, filePath } = await launchWithMarkdown('hello\nworld\n')
    await waitForMenuReady(app)
    await page.waitForTimeout(500)
    expect(await isDirty(page)).toBe(false)

    // Identical bytes — the watcher fires, but the tab must stay clean.
    fs.writeFileSync(filePath, 'hello\nworld\n', 'utf-8')
    await page.waitForTimeout(WATCH_SETTLE)
    expect(await isDirty(page)).toBe(false)

    // A genuine content change is reloaded without marking the tab unsaved.
    fs.writeFileSync(filePath, 'hello\nworld\nchanged\n', 'utf-8')
    await expect.poll(async() => {
      return await page.locator('.mu-container').textContent()
    }, { timeout: 8000 }).toContain('changed')
    expect(await isDirty(page)).toBe(false)

    // Atomic replacement is how editors and git commonly install a new inode.
    // The native macOS watcher must keep following the path after the rename.
    const replacementPath = path.join(path.dirname(filePath), '.note.md.atomic-replacement')
    fs.writeFileSync(replacementPath, 'hello\nworld\natomic\n', 'utf-8')
    fs.renameSync(replacementPath, filePath)
    await expect.poll(async() => {
      return await page.locator('.mu-container').textContent()
    }, { timeout: 8000 }).toContain('atomic')
    expect(await isDirty(page)).toBe(false)

    await app.close()
  })
})
