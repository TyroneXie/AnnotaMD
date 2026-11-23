import { expect, test, type Page } from '@playwright/test'
import type { AiConfigSummary, AiConversation, AiMessage } from '../../src/shared/types/aiWorkspace'
import type { PiSettingsState } from '../../src/shared/types/piProvider'
import type { MuyaElement } from './editor-elements'
import { clickMenuById, expectNoRendererErrors, launchElectron, launchWithMarkdown, sendIpcToRenderer, waitForEditor } from './helpers'

async function expectReadable(page: Page, selector: string, backgroundSelector: string) {
  const contrast = await page.evaluate(({ selector, backgroundSelector }) => {
    const text = document.querySelector(selector)
    const surface = document.querySelector(backgroundSelector)
    if (!text || !surface) throw new Error('The contrast target is missing')
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const blend = (foreground: number[], background: number[]) => {
      const alpha = foreground[3] / 255
      return foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha))
    }
    const ancestors: Element[] = []
    for (let node: Element | null = surface; node; node = node.parentElement) ancestors.unshift(node)
    const background = ancestors.reduce((color, node) => blend(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255])
    const foreground = blend(rgba(getComputedStyle(text).color), background)
    const luminance = (color: number[]) => {
      const rgb = color.map(value => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    }
    const a = luminance(foreground)
    const b = luminance(background)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }, { selector, backgroundSelector })
  expect(contrast, `${selector} must remain readable`).toBeGreaterThanOrEqual(4.5)
}

test('keeps desktop surfaces, comments and controls coherent in light and dark themes', async({ browserName: _browserName }, testInfo) => {
  const { app, page } = process.env.ANNOTAMD_QA_DOCUMENT
    ? await launchElectron([process.env.ANNOTAMD_QA_DOCUMENT], { suppressErrorDialog: true })
    : await launchWithMarkdown('# 文档批注与智能协作\n\n新增能力应保持一致的操作体验。\n\n## 修改流程\n\n正文和评论保持清楚的上下文。\n', { suppressErrorDialog: true })
  try {
    await waitForEditor(page)
    await page.evaluate(() => window.electron.ipcRenderer.send('annotamd::set-user-preference', { language: 'zh-CN' }))
    await sendIpcToRenderer(app, 'language-changed', 'zh-CN')
    await sendIpcToRenderer(app, 'annotamd::user-preference', { language: 'zh-CN' })
    await app.evaluate(({ BrowserWindow, ipcMain }) => {
      BrowserWindow.getAllWindows()[0].setSize(1400, 880)
      const config: AiConfigSummary = {
        id: 'visual-pi',
        name: 'Pi',
        kind: 'cli',
        provider: 'pi',
        enabled: true,
        isDefault: true,
        defaultModelId: 'deepseek/deepseek-flash'
      }
      const conversation: AiConversation = {
        id: 'visual-conversation',
        title: '文档与评论',
        mode: 'agent',
        configId: config.id,
        provider: 'pi',
        modelId: config.defaultModelId,
        permissionMode: 'request',
        templateIds: [],
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      const messages: AiMessage[] = [
        { id: 'question', conversationId: conversation.id, role: 'user', content: '请结合所有评论，帮我完善这份文档。', status: 'complete', createdAt: Date.now() },
        { id: 'answer', conversationId: conversation.id, role: 'assistant', content: '我会先阅读正文和评论，保留现有结构，再逐项整理修改建议。\n\n评论、编辑和对话应保持一致的视觉层级。', status: 'complete', createdAt: Date.now() + 1 }
      ]
      for (const channel of ['snapshot', 'configs:list', 'configs:models', 'preferences:get']) {
        ipcMain.removeHandler(`annotamd::ai::${channel}`)
      }
      ipcMain.handle('annotamd::ai::configs:list', () => [config])
      ipcMain.handle('annotamd::ai::preferences:get', () => ({ maxApiRetries: 2 }))
      ipcMain.handle('annotamd::ai::configs:models', () => [{ id: config.defaultModelId, name: 'deepseek-flash', effortLevels: ['low', 'high'] }])
      ipcMain.handle('annotamd::ai::snapshot', () => ({
        readiness: { status: 'ready', configId: config.id, modelId: config.defaultModelId, modelIds: [config.defaultModelId], modelProviders: { deepseek: { name: 'DeepSeek', icon: 'deepseek' } } },
        configs: [config],
        conversations: [conversation],
        activeConversationId: conversation.id,
        messages,
        changeSets: [],
        running: false
      }))
      const settings: PiSettingsState = {
        providers: [{ id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', enabled: true, models: [{ id: 'deepseek-flash', enabled: true }, { id: 'deepseek-v4-pro', enabled: false }] }],
        defaultProviderId: 'deepseek',
        keyedProviderIds: ['deepseek']
      }
      ipcMain.removeHandler('annotamd::pi::settings:get')
      ipcMain.handle('annotamd::pi::settings:get', () => settings)
    })
    await page.locator('.sidebar-agent-toggle').click()
    await expect(page.locator('.annotamd-agent-message.is-assistant')).toBeVisible()

    await page.evaluate(() => {
      const target = document.querySelector('.editor-component .mu-paragraph-content') as MuyaElement
      const muya = target.__MUYA_BLOCK__.muya
      muya.domNode.focus({ preventScroll: true })
      const range = document.createRange()
      range.selectNodeContents(target)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      const selection = muya.editor.selection.getSelection()
      if (!selection) throw new Error('The comment selection is missing')
      muya.editor.selection.setSelection(selection.anchor, selection.focus)
      document.dispatchEvent(new Event('selectionchange'))
      target.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    })
    await page.locator('.mu-format-picker li.annotamd_comment').click()
    const composer = page.locator('.annotamd-composer-card')
    await composer.locator('textarea').fill('侧栏、评论区和菜单的视觉层级，最好一起统一。')
    await composer.locator('.annotamd-composer-actions button:not(.annotamd-send-agent)').click()
    const comment = page.locator('.annotamd-comment-card[data-comment-id]')
    await expect(comment).toBeVisible()
    await comment.locator('.annotamd-reply-editor textarea').fill('评论也可以更紧凑，让上下文连在一起。')
    await comment.locator('.annotamd-reply-submit').click()

    const draft = page.getByTestId('ai-composer')
    await draft.fill('请整理这些修改建议。')
    await expect(page.locator('.annotamd-agent-primary-action')).toBeEnabled()
    await expect(page.locator('.editor-tabs')).toHaveCSS('box-shadow', 'none')
    const headerSizes = await page.locator('.editor-tabs, .annotamd-agent-header, .annotamd-comment-header').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
    expect(new Set(headerSizes).size).toBe(1)

    for (const theme of ['light', 'dark']) {
      await clickMenuById(app, theme)
      await expect.poll(() => page.locator('body').evaluate(node => node.classList.contains('dark'))).toBe(theme === 'dark')
      await expectReadable(page, '.annotamd-agent-message-content', '.annotamd-agent-workspace')
      await expectReadable(page, '.annotamd-message-author', '.annotamd-comment-card')
      await expectReadable(page, '.annotamd-agent-primary-action', '.annotamd-agent-primary-action')
      await page.screenshot({ path: testInfo.outputPath(`workspace-${theme}.png`), animations: 'disabled' })
      await page.getByTestId('ai-model-selector').click()
      await expect(page.locator('.annotamd-agent-model-popover')).toBeVisible()
      await expectReadable(page, '.annotamd-agent-model-menu header strong', '.annotamd-agent-model-popover')
      await page.screenshot({ path: testInfo.outputPath(`model-menu-${theme}.png`), animations: 'disabled' })
      await page.keyboard.press('Escape')
    }

    const opened = app.waitForEvent('window')
    await page.evaluate(() => window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent'))
    const settings = await opened
    await expect(settings.locator('.pref-ai-provider')).toBeVisible()
    for (const theme of ['dark', 'light']) {
      await clickMenuById(app, theme)
      await expect.poll(() => settings.locator('body').evaluate(node => node.classList.contains('dark'))).toBe(theme === 'dark')
      await settings.screenshot({ path: testInfo.outputPath(`settings-${theme}.png`), animations: 'disabled' })
      await expectReadable(settings, '.pref-ai-title', '.pref-setting')
      await expectReadable(settings, '.pref-ai-heading .el-button--primary', '.pref-ai-heading .el-button--primary')
      await expect(settings.locator('.category .item.active > svg')).toBeVisible()
      await settings.screenshot({ path: testInfo.outputPath(`settings-${theme}.png`), animations: 'disabled' })
    }
    await settings.close()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
