import { expect, test } from '@playwright/test'
import { _electron, type ElectronApplication } from 'playwright'
import fs from 'fs-extra'
import { cp } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sendIpcToRenderer, waitForEditor } from './helpers'

const run = promisify(execFile)
const desktopRoot = path.resolve(__dirname, '../..')
const template = process.env.ANNOTAMD_UPDATE_APP_SOURCE
test.skip(process.platform !== 'darwin' || !template, 'Requires a local macOS app as the runtime template; only temporary copies are updated.')
test.setTimeout(180000)

test('manual download, retry, restart and replacement preserve an unsaved document without opening a browser', async() => {
  const currentVersion = (await fs.readJson(path.join(desktopRoot, 'package.json'))).version as string
  const [major, minor, patch] = currentVersion.split('.')
  const updateVersion = `${major}.${minor}.${Number(patch) + 1}`
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'annotamd-manual-update-'))
  const target = path.join(root, 'installed/AnnotaMD.app')
  const candidate = path.join(root, 'candidate/AnnotaMD.app')
  const userData = path.join(root, 'user-data')
  const readyFile = path.join(root, 'window-ready.json')
  const pidFile = path.join(root, 'pid')
  const externalFile = path.join(root, 'external-links')
  const cacheName = path.basename(root)
  const cache = path.join(os.homedir(), 'Library/Caches', cacheName)
  const archive = path.join(root, 'update.zip')
  let app: ElectronApplication | undefined
  let downloads = 0
  let completed = false
  const source = process.env.ANNOTAMD_UPDATE_DOCUMENT
    ? await fs.readFile(process.env.ANNOTAMD_UPDATE_DOCUMENT, 'utf8')
    : '# Manual update QA\n\nDocument content must survive the update.\n'
  const note = path.join(root, 'note.md')
  await fs.writeFile(note, source)
  const marker = 'UNSAVED_MANUAL_UPDATE_QA'
  const prefix = `"use strict";
;(function () {
  const e = require('electron'), fs = require('node:fs');
  e.app.setActivationPolicy('accessory');
  for (const method of ['show', 'showInactive', 'focus', 'moveTop']) e.BrowserWindow.prototype[method] = function () {};
  fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
  e.shell.openExternal = async function (url) { fs.appendFileSync(${JSON.stringify(externalFile)}, url + String.fromCharCode(10)); };
  e.ipcMain.on('annotamd::window-initialized', function (event) {
    let attempts = 0;
    const timer = setInterval(function () {
      if (event.sender.isDestroyed() || ++attempts > 100) return clearInterval(timer);
      event.sender.executeJavaScript("Array.from(document.querySelectorAll('.mu-container')).map(e => e.__MUYA_BLOCK__?.muya?.getMarkdown() || '').join(String.fromCharCode(10))").then(function (text) {
        fs.writeFileSync(${JSON.stringify(readyFile)}, JSON.stringify({version:e.app.getVersion(), pid:process.pid, text}));
        if (text.includes(${JSON.stringify(marker)})) clearInterval(timer);
      }).catch(function () {});
    }, 100);
  });
})();
`
  const server = createServer(async(request, response) => {
    if (request.url?.startsWith('/latest-mac.yml')) {
      const hash = createHash('sha512').update(await fs.readFile(archive)).digest('base64')
      const name = `annotamd-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}-${updateVersion}.zip`
      response.end(`version: ${updateVersion}\nfiles:\n  - url: ${name}\n    sha512: ${hash}\n    size: ${(await fs.stat(archive)).size}\nreleaseDate: '2026-11-12T00:00:00.000Z'\n`)
    } else if (request.url?.includes('.zip')) {
      downloads++
      const data = downloads === 1 ? Buffer.from('corrupt update') : await fs.readFile(archive)
      response.writeHead(200, {'Content-Length': data.length})
      let offset = 0
      const timer = setInterval(() => {
        const end = Math.min(offset + 1024 * 1024, data.length)
        response.write(data.subarray(offset, end))
        offset = end
        if (offset === data.length) { clearInterval(timer); response.end() }
      }, 10)
      response.on('close', () => clearInterval(timer))
    } else { response.writeHead(404); response.end() }
  })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as {port: number}
    await cp(template!, target, {recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE})
    const resources = path.join(target, 'Contents/Resources')
    const appDir = path.join(resources, 'app')
    const require = createRequire(__filename)
    const builderRequire = createRequire(require.resolve('electron-builder'))
    const asar = createRequire(builderRequire.resolve('app-builder-lib'))('@electron/asar')
    asar.extractAll(path.join(resources, 'app.asar'), appDir)
    await fs.remove(path.join(resources, 'app.asar'))
    const main = path.join(appDir, 'out/main/index.js')
    // Verify the packaged application contains this working tree's build.
    expect(createHash('sha256').update(await fs.readFile(main)).digest('hex')).toBe(
      createHash('sha256').update(await fs.readFile(path.join(desktopRoot, 'out/main/index.js'))).digest('hex'))
    await fs.writeFile(main, prefix + await fs.readFile(main, 'utf8'))
    await fs.writeFile(path.join(resources, 'app-update.yml'), `provider: generic\nurl: http://127.0.0.1:${address.port}\nupdaterCacheDirName: ${cacheName}\n`)
    await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements,identifier,flags,runtime', target])
    await cp(target, candidate, {recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE})
    const packageFile = path.join(candidate, 'Contents/Resources/app/package.json')
    const packageInfo = await fs.readJson(packageFile)
    packageInfo.version = updateVersion
    await fs.writeJson(packageFile, packageInfo)
    for (const field of ['CFBundleShortVersionString', 'CFBundleVersion']) {
      await run('/usr/libexec/PlistBuddy', ['-c', `Set :${field} ${updateVersion}`, path.join(candidate, 'Contents/Info.plist')])
    }
    await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements,identifier,flags,runtime', candidate])
    await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', candidate, archive])

    app = await _electron.launch({
      executablePath: path.join(target, 'Contents/MacOS/AnnotaMD'),
      args: ['--user-data-dir', userData, note],
      env: {...process.env, PERF_TESTING: 'true', ANNOTAMD_ERROR_INTERACTION: '1'}, timeout: 30000
    })
    const page = await app.firstWindow()
    expect(await app.evaluate(({ app }) => app.getVersion())).toBe(currentVersion)
    await waitForEditor(page)
    // The ordinary startup check discovers the local fixture update.
    const button = page.locator('.app-update-sidebar')
    await expect(button).toHaveClass(/is-available/, {timeout: 15000})
    expect(downloads).toBe(0)
    expect(await fs.pathExists(externalFile)).toBe(false)
    await button.click()
    await expect(button).toHaveClass(/is-error/, {timeout: 15000})
    expect(downloads).toBe(1)
    await button.click()
    await expect(button).toHaveClass(/is-downloading/)
    await expect(button.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100')
    await expect.poll(async() => Number(await button.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    await page.screenshot({path: '/tmp/annotamd-manual-update-progress.png'})
    await expect(button).toHaveClass(/is-downloaded/, {timeout: 30000})
    console.log('Update validated and downloaded; awaiting explicit restart')
    expect(downloads).toBe(2)
    await page.screenshot({path: '/tmp/annotamd-manual-update-downloaded.png'})
    const prepared = (await fs.readdir(path.dirname(target))).find(name => name.startsWith('.annotamd-update-'))!
    expect(await fs.pathExists(path.join(path.dirname(target), prepared, 'install-approved'))).toBe(false)

    await sendIpcToRenderer(app, 'annotamd::user-preference', {autoSave: false, startUpAction: 'restoreAll'})
    await page.locator('.mu-paragraph-content').first().evaluate((element: any) => {
      element.__MUYA_BLOCK__.muya.domNode.focus()
      element.__MUYA_BLOCK__.setCursor(0, 0, true)
    })
    await page.keyboard.insertText(marker)
    const oldPid = await app.evaluate(() => process.pid)
    await button.click()
    await expect.poll(() => {
      try { process.kill(oldPid, 0); return false } catch { return true }
    }, {timeout: 30000}).toBe(true)
    console.log('Old application closed after buffering the unsaved document')
    app = undefined
    await expect.poll(async() => {
      try { return (await fs.readJson(readyFile)).version } catch { return '' }
    }, {timeout: 30000}).toBe(updateVersion)
    const boot = await fs.readJson(readyFile)
    console.log(JSON.stringify({restartedVersion: boot.version, restoredMarker: boot.text.includes(marker)}))
    await expect.poll(async() => (await fs.readJson(readyFile)).text, {timeout: 10000}).toContain(marker)
    await expect.poll(() => fs.pathExists(path.join(path.dirname(target), prepared))).toBe(false)
    expect(await fs.readFile(note, 'utf8')).toBe(source)
    expect(await fs.pathExists(externalFile)).toBe(false)
    completed = true
    console.log(JSON.stringify({downloadClicks: 2, installClicks: 1, checksumRetry: true, version: updateVersion, unsavedBufferRestored: true, windowMode: 'hidden'}))
  } finally {
    if (app) await app.close().catch(() => {})
    const realRoot = await fs.realpath(root).catch(() => root)
    const ownedProcesses = async() => (await run('/bin/ps', ['-axo', 'pid=,args='])).stdout.split('\n').flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/)
      return match && (match[2].includes(root) || match[2].includes(realRoot))
        ? [{pid: Number(match[1]), command: match[2]}] : []
    })
    // Stop the installer first so cleanup cannot be mistaken for a failed
    // launch and trigger a rollback/relaunch while files are being removed.
    for (const child of await ownedProcesses()) {
      if (child.command.startsWith('/bin/sh ') && child.command.includes('/install.sh')) {
        try { process.kill(child.pid, 'SIGKILL') } catch {}
      }
    }
    await expect.poll(async() => {
      const children = await ownedProcesses()
      for (const child of children) { try { process.kill(child.pid, 'SIGTERM') } catch {} }
      return children.length
    }, {timeout: 10000}).toBe(0)
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (completed) await fs.remove(root)
    else console.log(`Preserved failed QA fixture: ${root}`)
    await fs.remove(cache)
  }
})
