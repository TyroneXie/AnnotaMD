import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { expectNoRendererErrors, launchElectron, launchWithMarkdown, waitForEditor } from './helpers'

const readChannels = ['annotamd::ai::snapshot', 'annotamd::ai::configs:list', 'annotamd::pi::settings:get'] as const

async function setup(deny: boolean) {
  const launched = process.env.ANNOTAMD_QA_DOCUMENT
    ? await launchElectron([process.env.ANNOTAMD_QA_DOCUMENT], { suppressErrorDialog: true })
    : await launchWithMarkdown('# Keychain reads\n\nKeep document editing available.\n', { suppressErrorDialog: true })
  await waitForEditor(launched.page)
  await launched.app.evaluate(({ app }, denied) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json')
    const fs = process.getBuiltinModule('fs')
    const native = require('keytar')
    const state = { reads: 0, writes: 0, denied, value: 'qa-key' }
    ;(globalThis as unknown as { keychainReadTest: typeof state }).keychainReadTest = state
    const assertTestEntry = (service: string, account: string) => {
      if (service !== 'annotamd.ai.workspace' || account !== 'pi-provider:qa-keychain') {
        throw new Error('The test must not access another keychain entry')
      }
    }
    // Replace only the native credential boundary; use real stores and IPC.
    native.getPassword = async(service: string, account: string) => {
      assertTestEntry(service, account)
      state.reads++
      if (state.denied) throw new Error('Keychain access denied by QA')
      return state.value
    }
    native.setPassword = async(service: string, account: string, value: string) => {
      assertTestEntry(service, account)
      state.writes++
      state.value = value
    }
    native.deletePassword = async(service: string, account: string) => {
      assertTestEntry(service, account)
      state.value = ''
      return true
    }
    fs.writeFileSync(app.getPath('userData') + '/pi-provider.json', JSON.stringify({
      providers: [{
        id: 'qa-keychain',
        name: 'QA provider',
        kind: 'openai',
        enabled: true,
        baseUrl: 'https://example.invalid/v1',
        models: [{ id: 'qa-model', enabled: true }]
      }],
      defaultProviderId: 'qa-keychain'
    }))
  }, deny)
  return launched
}

async function readFromAllEntrypoints(page: Page) {
  return page.evaluate(async channels => await Promise.all(channels.map(async channel => {
    try {
      await window.electron.ipcRenderer.invoke(channel)
      return 'ok'
    } catch (error) {
      return String(error)
    }
  })), readChannels)
}

const counts = (app: ElectronApplication) => app.evaluate(() => {
  const state = (globalThis as unknown as { keychainReadTest: { reads: number; writes: number } }).keychainReadTest
  return { reads: state.reads, writes: state.writes }
})

async function openSettings(app: ElectronApplication, page: Page) {
  const opened = app.waitForEvent('window')
  await page.evaluate(() => window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent'))
  const settings = await opened
  await settings.waitForLoadState('domcontentloaded')
  await expect(settings.locator('.pref-ai-provider')).toHaveCount(1)
  await expect(settings.locator('.pref-ai-provider-text')).toContainText('QA provider')
  return settings
}

test('shares a keychain read across Agent and preferences and updates it after saving', async() => {
  const { app, page } = await setup(false)
  try {
    for (let index = 0; index < 3; index++) {
      expect(await readFromAllEntrypoints(page)).toEqual(['ok', 'ok', 'ok'])
    }
    const settings = await openSettings(app, page)
    expect(await counts(app)).toEqual({ reads: 1, writes: 0 })
    await page.evaluate(async() => await window.electron.ipcRenderer.invoke('annotamd::pi::provider:save', {
      id: 'qa-keychain',
      name: 'QA provider',
      kind: 'openai',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'qa-replacement'
    }))
    expect(await readFromAllEntrypoints(page)).toEqual(['ok', 'ok', 'ok'])
    expect(await counts(app)).toEqual({ reads: 1, writes: 1 })
    await settings.close()
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})

test('stops automatic retries after denial and retries on an explicit visit to Agent settings', async({ browserName: _browserName }, testInfo) => {
  const { app, page } = await setup(true)
  try {
    for (let index = 0; index < 3; index++) {
      expect(await readFromAllEntrypoints(page)).toEqual(Array(3).fill(expect.stringContaining('Keychain access denied by QA')))
    }
    expect(await counts(app)).toEqual({ reads: 1, writes: 0 })
    await app.evaluate(() => {
      (globalThis as unknown as { keychainReadTest: { denied: boolean } }).keychainReadTest.denied = false
    })
    const settings = await openSettings(app, page)
    expect(await readFromAllEntrypoints(page)).toEqual(['ok', 'ok', 'ok'])
    expect(await counts(app)).toEqual({ reads: 2, writes: 0 })
    await settings.screenshot({ path: testInfo.outputPath('keychain-recovered.png'), animations: 'disabled' })
    await settings.close()
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
