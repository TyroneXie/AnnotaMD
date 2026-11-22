import { expect, test, type Page, type Locator } from '@playwright/test'
import type { AiConfigSummary, AiModelInfo } from '../../src/shared/types/aiWorkspace'
import { expectNoRendererErrors, launchElectron, launchWithMarkdown, waitForEditor } from './helpers'

async function openAndMeasure(page: Page, trigger: Locator, menuSelector: string) {
  await trigger.evaluate((element, selector) => {
    const state = window as unknown as { modelMenuPaintMs?: number }
    delete state.modelMenuPaintMs
    element.addEventListener('pointerdown', () => {
      const started = performance.now()
      const frame = () => {
        const menu = document.querySelector(selector)
        if (menu && menu.getBoundingClientRect().width && getComputedStyle(menu).opacity === '1' && getComputedStyle(menu).visibility !== 'hidden') {
          state.modelMenuPaintMs = performance.now() - started
        } else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }, { once: true })
  }, menuSelector)
  await trigger.click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { modelMenuPaintMs?: number }).modelMenuPaintMs)).toBeGreaterThanOrEqual(0)
  return page.evaluate(() => (window as unknown as { modelMenuPaintMs: number }).modelMenuPaintMs)
}

test('opens the model menu immediately and keeps configured models usable during slow discovery', async({ browserName: _browserName }, testInfo) => {
  const launched = process.env.ANNOTAMD_QA_DOCUMENT
    ? await launchElectron([process.env.ANNOTAMD_QA_DOCUMENT], { suppressErrorDialog: true })
    : await launchWithMarkdown('# Model menu responsiveness\n\nEditor stays available during discovery.\n', { suppressErrorDialog: true })
  const { app, page } = launched
  try {
    await waitForEditor(page)
    await app.evaluate(({ ipcMain }) => {
      const config: AiConfigSummary = {
        id: 'responsive-pi',
        name: 'Pi',
        kind: 'cli',
        provider: 'pi',
        enabled: true,
        isDefault: true,
        defaultModelId: 'deepseek/deepseek-flash'
      }
      const models: AiModelInfo[] = [
        { id: config.defaultModelId!, name: 'deepseek-flash', effortLevels: ['off', 'low', 'high'] },
        { id: 'deepseek/deepseek-pro', name: 'deepseek-pro', effortLevels: ['off', 'high'] },
        ...Array.from({ length: 40 }, (_, index) => ({
          id: `deepseek/extra-${index}`, name: `extra-${index}`, effortLevels: ['off', 'high']
        }))
      ]
      const state = globalThis as unknown as {
        modelDiscoveryCalls: number
        releaseModelDiscovery: () => void
      }
      state.modelDiscoveryCalls = 0
      const gate = new Promise<void>(resolve => { state.releaseModelDiscovery = resolve })
      for (const channel of ['snapshot', 'configs:list', 'configs:models', 'preferences:get']) {
        ipcMain.removeHandler(`annotamd::ai::${channel}`)
      }
      ipcMain.handle('annotamd::ai::snapshot', () => ({
        readiness: { status: 'ready', configId: config.id, modelId: config.defaultModelId, modelIds: models.map(model => model.id) },
        configs: [config],
        conversations: [],
        messages: [],
        changeSets: [],
        running: false
      }))
      ipcMain.handle('annotamd::ai::configs:list', () => [config])
      ipcMain.handle('annotamd::ai::preferences:get', () => ({ maxApiRetries: 2 }))
      ipcMain.handle('annotamd::ai::configs:models', async() => {
        state.modelDiscoveryCalls++
        await gate
        return models
      })
    })
    await page.locator('.sidebar-agent-toggle').click()
    const modelTrigger = page.getByTestId('ai-model-selector')
    const permissionTrigger = page.getByTestId('ai-permission-trigger')
    await expect(modelTrigger).toHaveText('deepseek-flash')
    const permissionMs = await openAndMeasure(page, permissionTrigger, '.annotamd-agent-permission-menu')
    const modelMs = await openAndMeasure(page, modelTrigger, '.annotamd-agent-model-popover')
    const menu = page.locator('.annotamd-agent-model-menu:visible')
    await menu.getByRole('combobox', { name: 'Model ID' }).click()
    const dropdown = page.locator('.el-select-dropdown:visible')
    await expect(dropdown.getByRole('option')).toHaveCount(42)
    await expect(dropdown.getByRole('option', { name: 'deepseek-pro', exact: true })).toBeVisible({ timeout: 1500 })
    await dropdown.getByRole('option', { name: 'deepseek-pro', exact: true }).click()
    await expect(modelTrigger).toHaveText('deepseek-pro')
    await app.evaluate(() => (globalThis as unknown as { releaseModelDiscovery: () => void }).releaseModelDiscovery())
    await expect(menu.getByRole('combobox', { name: 'Reasoning effort' })).toBeVisible()
    await page.locator('.annotamd-agent-timeline').click({ position: { x: 8, y: 8 } })
    const repeatPaintMs: number[] = []
    for (let index = 0; index < 5; index++) {
      repeatPaintMs.push(await openAndMeasure(page, modelTrigger, '.annotamd-agent-model-popover'))
      await expect(menu).toBeVisible()
      await permissionTrigger.click()
      await expect(menu).toHaveCount(0)
      await expect(page.getByTestId('ai-permission-menu')).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('ai-permission-menu')).toHaveCount(0)
    expect(await app.evaluate(() => (globalThis as unknown as { modelDiscoveryCalls: number }).modelDiscoveryCalls)).toBe(1)
    expect(modelMs).toBeLessThan(permissionMs + 80)
    console.log(JSON.stringify({ permissionMs, modelMs, repeatPaintMs }))
    await modelTrigger.click()
    await menu.getByRole('combobox', { name: 'Model ID' }).click()
    const picker = menu.getByRole('combobox', { name: 'Model ID' })
    await picker.fill('extra-39')
    await expect(dropdown.getByRole('option', { name: 'extra-39', exact: true })).toBeVisible()
    await expect(page.locator('.el-select__popper:visible')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('model-menu-ready.png'), animations: 'disabled' })
    await dropdown.getByRole('option', { name: 'extra-39', exact: true }).click()
    await expect(modelTrigger).toHaveText('extra-39')
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})

test('keeps empty-state settings access, outside click and Escape working', async() => {
  const { app, page } = await launchWithMarkdown('# No model configured\n', { suppressErrorDialog: true })
  try {
    await page.locator('.sidebar-agent-toggle').click()
    const trigger = page.getByTestId('ai-model-selector')
    const menu = page.locator('.annotamd-agent-model-menu:visible')
    await trigger.click()
    await expect(menu.getByTestId('ai-model-open-settings')).toBeVisible()
    await trigger.press('Escape')
    await expect(menu).toHaveCount(0)
    await trigger.click()
    await page.locator('.annotamd-agent-timeline').click({ position: { x: 8, y: 8 } })
    await expect(menu).toHaveCount(0)
    await trigger.click()
    const settingsOpened = app.waitForEvent('window')
    await menu.getByTestId('ai-model-open-settings').click()
    const settings = await settingsOpened
    await settings.waitForLoadState('domcontentloaded')
    await expect.poll(() => settings.url()).toContain('/preference/agent')
    await expect(settings.locator('.pref-ai')).toBeVisible()
    await settings.close()
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
