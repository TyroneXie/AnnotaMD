import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expectNoRendererErrors, launchWithMarkdown, launchElectron, waitForEditor, sendIpcToRenderer } from './helpers'

test('preserves editing while enforcing renderer and filesystem boundaries', async() => {
  const outside = mkdtempSync(path.join(tmpdir(), 'annotamd-unapproved-'))
  const privateFile = path.join(outside, 'private.txt')
  writeFileSync(privateFile, 'must remain private')
  const { app, page, filePath } = await launchWithMarkdown('# Trusted document\n\nEditable text.\n', { suppressErrorDialog: true })
  try {
    expect(await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents as typeof BrowserWindow.prototype.webContents & {
        getLastWebPreferences(): { webSecurity: boolean }
      }
      return contents.getLastWebPreferences().webSecurity
    })).toBe(true)
    const allowed = await page.evaluate(pathname => window.fileUtils.readFile(pathname, 'utf8'), filePath)
    expect(allowed).toContain('Trusted document')
    await page.evaluate(pathname => window.electron.ipcRenderer.send('annotamd::window-add-file-path', pathname), privateFile)
    await expect(page.evaluate(pathname => window.fileUtils.readFile(pathname, 'utf8'), privateFile)).rejects.toThrow('authorized')
    // A renderer cannot turn a notification about a saved tab into a new grant.
    await page.evaluate(pathname => window.electron.ipcRenderer.send('annotamd::window-add-file-path', pathname), privateFile)
    await expect(page.evaluate(pathname => window.fileUtils.readFile(pathname, 'utf8'), privateFile)).rejects.toThrow('authorized')
    const attempted = await page.evaluate(() => {
      try {
        Reflect.apply(window.electron.ipcRenderer.sendSync, null, ['annotamd::native-file-drop', '/tmp/forged'])
        return 'allowed'
      } catch (error) { return String(error) }
    })
    expect(attempted).toContain('Unknown IPC channel')

    const block = page.locator('.editor-component h1').first()
    await block.hover()
    const button = page.locator('.mu-front-button-wrapper button.mu-icon-wrapper')
    await button.focus()
    await button.press('Enter')
    await expect(page.locator('.mu-front-menu').locator('..')).toHaveCSS('opacity', '1')
    await page.keyboard.press('Escape')

    const pending = app.waitForEvent('window')
    await app.evaluate(async({ BrowserWindow, app }) => {
      const preview = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          preload: `${app.getAppPath()}/out/preload/index.js`
        }
      })
      await preview.loadURL('data:text/html,<h1>Untrusted frame</h1>')
    })
    const untrusted = await pending
    await expect(untrusted.evaluate(pathname => window.fileUtils.readFile(pathname, 'utf8'), filePath)).rejects.toThrow('Unauthorized IPC sender')
    await untrusted.close()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    rmSync(outside, { recursive: true, force: true })
  }
})

test('authorizes a native Save As destination without granting arbitrary adjacent directories', async() => {
  const destination = mkdtempSync(path.join(tmpdir(), 'annotamd-save-approved-'))
  const saved = path.join(destination, 'saved.md')
  const { app, page } = await launchWithMarkdown('# Save scope\n\nKeep the document intact.\n', { suppressErrorDialog: true })
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async() => ({ canceled: false, filePath })
    }, saved)
    await sendIpcToRenderer(app, 'annotamd::editor-ask-file-save-as')
    await expect.poll(() => existsSync(saved) && readFileSync(saved, 'utf8')).toContain('Keep the document intact.')
    expect(await page.evaluate(pathname => window.fileUtils.readFile(pathname, 'utf8'), saved)).toContain('Save scope')
    const image = path.join(destination, 'assets/paste.png')
    await page.evaluate(async pathname => {
      await window.fileUtils.outputFile(pathname, new Uint8Array([137, 80, 78, 71]))
    }, image)
    expect(existsSync(image)).toBe(true)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    rmSync(destination, { recursive: true, force: true })
  }
})

test('keeps the real long document editable with scoped styles and secure resource loading', async({ browserName: _browserName }, testInfo) => {
  const documentPath = process.env.ANNOTAMD_QA_DOCUMENT
  test.skip(!documentPath || !existsSync(documentPath), 'Set ANNOTAMD_QA_DOCUMENT to the real QA document')
  const before = readFileSync(documentPath!, 'utf8')
  const { app, page } = await launchElectron([documentPath!], { suppressErrorDialog: true })
  try {
    await waitForEditor(page)
    await expect(page.locator('.editor-component h1').first()).toBeVisible()
    expect(await page.locator('.editor-component table').count()).toBeGreaterThan(5)
    const styles = await page.locator('.editor-component').evaluate(element => ({
      width: element.getBoundingClientRect().width,
      color: getComputedStyle(element).color
    }))
    expect(styles.width).toBeGreaterThan(400)
    await page.screenshot({ path: testInfo.outputPath('review-long-document.png') })
    await expectNoRendererErrors(app)
    expect(readFileSync(documentPath!, 'utf8')).toBe(before)
  } finally { await app.close() }
})
