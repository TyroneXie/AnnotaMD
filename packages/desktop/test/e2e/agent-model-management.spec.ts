import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import type { PiSettingsState, PiModelsUpdateRequest } from '../../src/shared/types/piProvider'
import { expectNoRendererErrors, launchElectron, launchWithMarkdown, waitForEditor } from './helpers'

async function openSettings(multipleProviders: boolean) {
  const launched = process.env.ANNOTAMD_QA_DOCUMENT
    ? await launchElectron([process.env.ANNOTAMD_QA_DOCUMENT], { suppressErrorDialog: true })
    : await launchWithMarkdown('# Model management\n\nDocument remains open while configuring models.\n', { suppressErrorDialog: true })
  const { app, page } = launched
  await waitForEditor(page)
  await app.evaluate(({ ipcMain }, multiple) => {
    const state: PiSettingsState = {
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          kind: 'openai',
          enabled: true,
          baseUrl: 'https://api.deepseek.com/v1',
          defaultModel: 'deepseek-flash',
          models: [{ id: 'deepseek-flash', enabled: true }]
        },
        ...(multiple
          ? [{
            id: 'openai',
            name: 'OpenAI',
            kind: 'openai' as const,
            enabled: true,
            baseUrl: 'https://api.openai.com/v1',
            defaultModel: 'test-model',
            models: [{ id: 'test-model', enabled: true }]
          }]
          : [])
      ],
      defaultProviderId: 'deepseek',
      keyedProviderIds: ['deepseek', 'openai']
    }
    ;(globalThis as unknown as { __annotamdModelManagement: PiSettingsState }).__annotamdModelManagement = state
    ipcMain.removeHandler('annotamd::pi::settings:get')
    ipcMain.removeHandler('annotamd::pi::models:update')
    ipcMain.handle('annotamd::pi::settings:get', () => state)
    ipcMain.handle('annotamd::pi::models:update', (_event, request: PiModelsUpdateRequest) => {
      const provider = state.providers.find(item => item.id === request.providerId)!
      if ('models' in request) provider.models = request.models
      if ('defaultModel' in request && request.defaultModel) provider.defaultModel = request.defaultModel
      return state
    })
  }, multipleProviders)
  const pending = app.waitForEvent('window')
  await page.evaluate(() => window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent'))
  const settings = await pending
  await settings.waitForLoadState('domcontentloaded')
  await expect(settings.locator('.pref-ai-provider')).toHaveCount(multipleProviders ? 2 : 1)
  return { app, page, settings }
}

const settingsState = (app: ElectronApplication) => app.evaluate(() => (
  (globalThis as unknown as { __annotamdModelManagement: PiSettingsState }).__annotamdModelManagement
))

test('shows inline model controls without a redundant manage action for a single provider', async({ browserName: _browserName }, testInfo) => {
  const { app, settings } = await openSettings(false)
  try {
    await expect(settings.getByRole('button', { name: 'Manage models', exact: true })).toHaveCount(0)
    await expect(settings.locator('.pref-ai-model-id')).toHaveText('deepseek-flash')
    await expect(settings.locator('.pref-ai-model-add input')).toBeVisible()
    await settings.screenshot({ path: testInfo.outputPath('single-provider.png') })

    await settings.locator('.pref-ai-model-add input').fill('extra-model')
    await settings.locator('.pref-ai-model-add button').click()
    await expect(settings.locator('.pref-ai-model-id')).toHaveText(['deepseek-flash', 'extra-model'])
    await expect.poll(() => settingsState(app)).toMatchObject({
      defaultProviderId: 'deepseek',
      providers: [{ id: 'deepseek', models: [{ id: 'deepseek-flash', enabled: true }, { id: 'extra-model', enabled: true }] }]
    })
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})

test('switches the managed provider with visible selected state while preserving the default provider', async({ browserName: _browserName }, testInfo) => {
  const { app, settings } = await openSettings(true)
  try {
    const deepseek = settings.locator('.pref-ai-provider').filter({ hasText: 'DeepSeek' })
    const openai = settings.locator('.pref-ai-provider').filter({ has: settings.getByText('OpenAI', { exact: true }) })
    await expect(deepseek.getByRole('button', { name: 'Managing', exact: true })).toBeDisabled()
    await openai.getByRole('button', { name: 'Manage models', exact: true }).click()
    await expect(openai.getByRole('button', { name: 'Managing', exact: true })).toBeDisabled()
    await expect(settings.locator('.pref-ai-model-id')).toHaveText('test-model')
    await expect(settings.locator('.pref-ai-summary').first()).toContainText('OpenAI')
    await settings.screenshot({ path: testInfo.outputPath('multiple-providers.png') })

    await settings.locator('.pref-ai-model .el-switch').click()
    await expect.poll(() => settingsState(app)).toMatchObject({
      defaultProviderId: 'deepseek',
      providers: [
        { id: 'deepseek', models: [{ id: 'deepseek-flash', enabled: true }] },
        { id: 'openai', models: [{ id: 'test-model', enabled: false }] }
      ]
    })
    await settings.locator('.pref-ai-model-add input').fill('unsaved-draft')
    await deepseek.getByRole('button', { name: 'Manage models', exact: true }).click()
    await expect(settings.locator('.pref-ai-model-id')).toHaveText('deepseek-flash')
    await expect(settings.locator('.pref-ai-model-add input')).toHaveValue('')
    await expect(deepseek.getByRole('button', { name: 'Managing', exact: true })).toBeDisabled()
    await expect(deepseek.locator('em')).toHaveText('Default')
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
