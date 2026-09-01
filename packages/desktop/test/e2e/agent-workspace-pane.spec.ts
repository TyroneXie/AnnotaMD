import { expect, test } from '@playwright/test'
import {
  clearRendererErrors,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

const selectEditorPhrase = async(page: import('@playwright/test').Page, phrase: string) => {
  await page.evaluate((selectedPhrase) => {
    const root = document.querySelector('.editor-component') as HTMLElement | null
    if (!root) throw new Error('editor unavailable')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode() as Text | null
    while (textNode && !textNode.data.includes(selectedPhrase)) {
      textNode = walker.nextNode() as Text | null
    }
    if (!textNode) throw new Error('selection target unavailable')
    const start = textNode.data.indexOf(selectedPhrase)
    const range = document.createRange()
    range.setStart(textNode, start)
    range.setEnd(textNode, start + selectedPhrase.length)
    root.focus({ preventScroll: true })
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
  }, phrase)
  await page.waitForTimeout(150)
}

test('opens Agent from the selection toolbar, carries context, and adds text attachments', async() => {
  const phrase = 'Select this exact phrase for Agent.'
  const { app, page } = await launchWithMarkdown(
    `# Agent context\n\n${phrase}\n`,
    { suppressErrorDialog: true }
  )

  try {
    await clearRendererErrors(app)
    await selectEditorPhrase(page, phrase)
    const agentAction = page.locator('.mu-format-picker li.annotamd_agent')
    await expect(agentAction).toBeVisible()
    await agentAction.click()

    const pane = page.locator('.annotamd-agent-workspace')
    await expect(pane.getByTestId('ai-selection-context')).toContainText(phrase)

    await pane.getByTestId('ai-attachment-input').setInputFiles({
      name: 'reference.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Reference\nSupporting material.')
    })
    await expect(pane.getByTestId('ai-attachments')).toContainText('reference.md')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('keeps the model card open while selecting model and reasoning effort', async() => {
  const { app, page } = await launchWithMarkdown(
    '# Model picker\n\nKeep the card open between selections.\n',
    { suppressErrorDialog: true }
  )

  try {
    await app.evaluate(({ ipcMain }) => {
      for (const channel of [
        'annotamd::ai::snapshot',
        'annotamd::ai::configs:list',
        'annotamd::ai::configs:models',
        'annotamd::ai::preferences:get'
      ]) ipcMain.removeHandler(channel)
      const config = {
        id: 'picker-cli',
        name: 'Codex CLI',
        kind: 'cli',
        provider: 'codex',
        isDefault: true,
        enabled: true,
        defaultModelId: 'model-a'
      }
      const claudeConfig = {
        id: 'picker-claude',
        name: 'Claude Code CLI',
        kind: 'cli',
        provider: 'claude-code',
        isDefault: false,
        enabled: true,
        defaultModelId: 'claude-default'
      }
      ipcMain.handle('annotamd::ai::snapshot', () => ({
        readiness: { status: 'ready', configId: config.id, modelId: config.defaultModelId },
        configs: [config, claudeConfig],
        conversations: [],
        messages: [],
        changeSets: [],
        running: false
      }))
      ipcMain.handle('annotamd::ai::configs:list', () => [config, claudeConfig])
      ipcMain.handle('annotamd::ai::configs:models', (_event, configId) => (
        configId === claudeConfig.id
          ? [{ id: 'claude-default', name: 'Claude Default', effortLevels: ['low', 'medium', 'high'] }]
          : [
              { id: 'model-a', name: 'Model A', effortLevels: ['low', 'high'] },
              { id: 'model-b', name: 'Model B', effortLevels: ['medium', 'high'] }
            ]
      ))
      ipcMain.handle('annotamd::ai::preferences:get', () => ({ maxApiRetries: 2 }))
    })
    await clearRendererErrors(app)
    await page.locator('.sidebar-agent-toggle').click()

    const pane = page.locator('.annotamd-agent-workspace')
    await pane.getByTestId('ai-model-selector').click()
    const modelMenu = page.locator('.annotamd-agent-model-menu:visible')
    await expect(modelMenu).toBeVisible()
    const providerButtons = modelMenu.locator('.annotamd-agent-provider-list > button')
    await expect(providerButtons).toHaveCount(2)
    expect(await providerButtons.evaluateAll(buttons => buttons.every((button) => {
      const style = getComputedStyle(button)
      return style.borderTopStyle === 'solid' && style.borderTopWidth === '1px'
    }))).toBe(true)
    await providerButtons.nth(1).click()
    await expect(providerButtons.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(500)
    await expect(modelMenu).toBeVisible()
    await providerButtons.nth(0).click()
    await expect(providerButtons.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(modelMenu).toBeVisible()
    await modelMenu.locator('label').nth(0).locator('.el-select__wrapper').click()
    await page.locator('.el-select-dropdown:visible').getByText('Model B', { exact: true }).click()
    await expect(modelMenu).toBeVisible()
    await expect(page.locator('.el-select-dropdown:visible')).toHaveCount(0)

    await modelMenu.locator('label').nth(1).locator('.el-select__wrapper').click()
    await page.locator('.el-select-dropdown:visible').getByText('High', { exact: true }).click()
    await expect(modelMenu).toBeVisible()

    await pane.locator('.annotamd-agent-timeline').click({ position: { x: 8, y: 8 } })
    await expect(modelMenu).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('shows two or three suggested document tasks and fills the composer without sending', async() => {
  const { app, page } = await launchWithMarkdown(
    '# Suggested tasks\n\nA document for Agent prompt suggestions.\n',
    { suppressErrorDialog: true }
  )

  try {
    await clearRendererErrors(app)
    await page.locator('.sidebar-agent-toggle').click()

    const agentPane = page.locator('.annotamd-agent-workspace')
    const suggestions = agentPane.getByTestId('ai-suggested-prompt')
    await expect(suggestions.first()).toBeVisible()
    const count = await suggestions.count()
    expect(count).toBeGreaterThanOrEqual(2)
    expect(count).toBeLessThanOrEqual(3)

    const firstSuggestion = (await suggestions.first().textContent())?.trim() ?? ''
    await suggestions.first().click()
    await expect(agentPane.getByTestId('ai-composer')).toHaveValue(firstSuggestion)
    await expect(agentPane.locator('.annotamd-agent-message')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('adjusts Agent message text size from the Agent settings page', async() => {
  const { app, page } = await launchWithMarkdown(
    '# Agent typography\n\nKeep Agent text compact and adjustable.\n',
    { suppressErrorDialog: true }
  )

  try {
    await app.evaluate(({ ipcMain }) => {
      for (const channel of [
        'annotamd::ai::snapshot',
        'annotamd::ai::configs:list',
        'annotamd::ai::configs:models',
        'annotamd::ai::preferences:get'
      ]) ipcMain.removeHandler(channel)
      const now = Date.now()
      const config = {
        id: 'font-size-cli',
        name: 'Codex CLI',
        kind: 'cli',
        provider: 'codex',
        isDefault: true,
        enabled: true,
        defaultModelId: 'font-size-model'
      }
      const conversation = {
        id: 'font-size-conversation',
        title: 'Agent typography',
        mode: 'agent',
        configId: config.id,
        modelId: config.defaultModelId,
        templateIds: [],
        status: 'completed',
        createdAt: now,
        updatedAt: now
      }
      ipcMain.handle('annotamd::ai::snapshot', () => ({
        readiness: { status: 'ready', configId: config.id, modelId: config.defaultModelId },
        configs: [config],
        conversations: [conversation],
        activeConversationId: conversation.id,
        messages: [{
          id: 'font-size-answer',
          conversationId: conversation.id,
          role: 'assistant',
          content: 'Compact Agent answer.',
          status: 'complete',
          createdAt: now
        }],
        changeSets: [],
        running: false
      }))
      ipcMain.handle('annotamd::ai::configs:list', () => [config])
      ipcMain.handle('annotamd::ai::configs:models', () => [
        { id: config.defaultModelId, name: 'Font Size Model', provider: 'codex' }
      ])
      ipcMain.handle('annotamd::ai::preferences:get', () => ({ maxApiRetries: 2 }))
    })
    await clearRendererErrors(app)
    await page.locator('.sidebar-agent-toggle').click()

    const pane = page.locator('.annotamd-agent-workspace')
    const message = pane.locator('.annotamd-agent-message-content')
    await expect(message).toHaveCSS('font-size', '12px')

    const settingsWindowPromise = app.waitForEvent('window')
    await page.evaluate(() => {
      window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent')
    })
    const settingsWindow = await settingsWindowPromise
    await settingsWindow.waitForLoadState('domcontentloaded')
    await expect.poll(() => settingsWindow.url()).toContain('/preference/agent')

    const fontSizeInput = settingsWindow.locator('.pref-ai .stepper-input').first()
    await expect(fontSizeInput).toHaveAttribute('min', '10')
    await expect(fontSizeInput).toHaveAttribute('max', '18')
    await expect(fontSizeInput).toHaveValue('12')
    await fontSizeInput.fill('16')
    await fontSizeInput.press('Tab')

    await expect(message).toHaveCSS('font-size', '16px')
    await settingsWindow.close()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('keeps one process disclosure with plain text and flat tool events', async() => {
  const { app, page } = await launchWithMarkdown(
    '# Tool activity\n\nCompact the Agent execution trace.\n',
    { suppressErrorDialog: true }
  )

  try {
    await app.evaluate(({ ipcMain }) => {
      for (const channel of [
        'annotamd::ai::snapshot',
        'annotamd::ai::configs:list',
        'annotamd::ai::configs:models',
        'annotamd::ai::preferences:get'
      ]) ipcMain.removeHandler(channel)
      const now = Date.now()
      const config = {
        id: 'tool-trace-cli',
        name: 'Codex CLI',
        kind: 'cli',
        provider: 'codex',
        isDefault: true,
        enabled: true,
        defaultModelId: 'tool-trace-model'
      }
      const conversation = {
        id: 'tool-trace-conversation',
        title: 'Review document',
        mode: 'agent',
        configId: config.id,
        modelId: config.defaultModelId,
        templateIds: [],
        status: 'completed',
        createdAt: now,
        updatedAt: now
      }
      const messages = [
        {
          id: 'tool-trace-user', conversationId: conversation.id, role: 'user',
          content: 'Review this document', status: 'complete', createdAt: now
        },
        {
          id: 'tool-trace-summary', conversationId: conversation.id, role: 'system',
          content: JSON.stringify({ durationMs: 125_000 }), status: 'complete',
          toolName: 'annotamd:run-summary', createdAt: now + 1
        },
        {
          id: 'tool-trace-reasoning', conversationId: conversation.id, role: 'system',
          content: 'Checking the document structure.', status: 'complete',
          toolName: 'annotamd:reasoning', createdAt: now + 2
        },
        {
          id: 'tool-trace-intro', conversationId: conversation.id, role: 'assistant',
          content: 'I will inspect the document first.', status: 'complete', createdAt: now + 3
        },
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `tool-trace-${index + 1}`,
          conversationId: conversation.id,
          role: 'tool',
          content: `Output ${index + 1}`,
          status: 'complete',
          createdAt: now + index + 4,
          toolCallId: `call-${index + 1}`,
          toolName: index === 0 ? 'commandExecution' : 'mcpToolCall'
        })),
        {
          id: 'tool-trace-progress', conversationId: conversation.id, role: 'assistant',
          content: 'I found three issues and will apply the fixes.', status: 'complete',
          createdAt: now + 7
        },
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `tool-trace-${index + 4}`,
          conversationId: conversation.id,
          role: 'tool',
          content: `Output ${index + 4}`,
          status: 'complete',
          createdAt: now + index + 8,
          toolCallId: `call-${index + 4}`,
          toolName: 'mcpToolCall'
        })),
        {
          id: 'tool-trace-final', conversationId: conversation.id, role: 'assistant',
          content: 'The full review is complete.', status: 'complete', createdAt: now + 11
        }
      ]
      ipcMain.handle('annotamd::ai::snapshot', () => ({
        readiness: { status: 'ready', configId: config.id, modelId: config.defaultModelId },
        configs: [config],
        conversations: [conversation],
        activeConversationId: conversation.id,
        messages,
        changeSets: [],
        running: false
      }))
      ipcMain.handle('annotamd::ai::configs:list', () => [config])
      ipcMain.handle('annotamd::ai::configs:models', () => [
        { id: config.defaultModelId, name: 'Tool Trace Model', provider: 'codex' }
      ])
      ipcMain.handle('annotamd::ai::preferences:get', () => ({ maxApiRetries: 2 }))
    })
    await clearRendererErrors(app)
    await page.locator('.sidebar-agent-toggle').click()

    const pane = page.locator('.annotamd-agent-workspace')
    const processToggle = pane.getByTestId('ai-process-group-toggle')
    await expect(processToggle).toHaveCount(1)
    await expect(processToggle).toContainText('6')
    await expect(processToggle).toContainText('2 min 5 sec')
    await expect(pane.getByTestId('ai-process-group-body')).toHaveCount(0)
    await expect(pane.getByText('The full review is complete.', { exact: true })).toBeVisible()

    await processToggle.click()
    const processBody = pane.getByTestId('ai-process-group-body')
    const toolLists = pane.getByTestId('ai-tool-list')
    const toolRows = pane.getByTestId('ai-tool-message')
    const processMessages = pane.getByTestId('ai-process-message')
    await expect(processBody).toBeVisible()
    await expect(toolLists).toHaveCount(2)
    await expect(toolRows).toHaveCount(6)
    await expect(processMessages).toHaveCount(3)
    await expect(pane.getByTestId('ai-tool-group')).toHaveCount(0)
    await expect(pane.getByTestId('ai-tool-group-viewport')).toHaveCount(0)
    await expect(pane.getByTestId('ai-tool-details')).toHaveCount(0)
    await expect(toolRows.locator('button')).toHaveCount(0)
    await expect(pane.getByText('I will inspect the document first.', { exact: true })).toBeVisible()
    await expect(pane.getByText(
      'I found three issues and will apply the fixes.', { exact: true }
    )).toBeVisible()
    await expect(pane.getByText('Run command', { exact: true })).toHaveCount(1)
    await expect(pane.getByText('Use MCP tool', { exact: true })).toHaveCount(5)
    await expect(processMessages.nth(0)).toHaveAttribute('aria-label', 'Reasoning summary')
    await expect(pane.getByText('Reasoning summary', { exact: true })).toHaveCount(0)
    expect(await processMessages.nth(0).evaluate((element) => (
      getComputedStyle(element).borderLeftWidth
    ))).toBe('0px')

    const introBox = await pane.getByText(
      'I will inspect the document first.', { exact: true }
    ).boundingBox()
    const firstToolBox = await toolRows.nth(0).boundingBox()
    const progressBox = await pane.getByText(
      'I found three issues and will apply the fixes.', { exact: true }
    ).boundingBox()
    const fourthToolBox = await toolRows.nth(3).boundingBox()
    const finalBox = await pane.getByText('The full review is complete.', { exact: true }).boundingBox()
    expect(firstToolBox?.y ?? 0).toBeGreaterThan(introBox?.y ?? 0)
    expect(progressBox?.y ?? 0).toBeGreaterThan(firstToolBox?.y ?? 0)
    expect(fourthToolBox?.y ?? 0).toBeGreaterThan(progressBox?.y ?? 0)
    expect(finalBox?.y ?? 0).toBeGreaterThan(fourthToolBox?.y ?? 0)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('keeps the no-config Agent sidebar controls clickable and the header minimal', async() => {
  const { app, page } = await launchWithMarkdown(
    '# AI workspace controls\n\nNo configuration interaction test.\n',
    { suppressErrorDialog: true }
  )

  try {
    await clearRendererErrors(app)
    await page.locator('.sidebar-agent-toggle').click()

    const agentPane = page.locator('.annotamd-agent-workspace')
    await expect(agentPane).toBeVisible()
    await expect(agentPane.getByTestId('ai-setup-required')).toBeVisible()
    await expect(agentPane.getByTestId('ai-open-comments')).toHaveCount(0)
    await expect.poll(async() => {
      const tabsBox = await page.locator('.editor-tabs').boundingBox()
      const headerBox = await agentPane.locator('.annotamd-agent-header').boundingBox()
      return Math.abs((tabsBox?.y ?? 0) + (tabsBox?.height ?? 0) - (
        (headerBox?.y ?? 0) + (headerBox?.height ?? 0)
      ))
    }).toBeLessThanOrEqual(1)

    const timeline = agentPane.locator('.annotamd-agent-timeline')
    const visibleTooltip = page.locator('.el-popper[role="tooltip"]:visible')
    const headerTooltips = [
      [agentPane.getByTestId('ai-new-session'), 'New chat'],
      [agentPane.getByTestId('ai-history-toggle'), 'Chat history'],
      [agentPane.getByTestId('ai-delete-current').locator('..'), 'Delete chat'],
      [agentPane.getByTestId('ai-close'), 'Close AI Assistant']
    ] as const
    for (const [control, label] of headerTooltips) {
      await control.hover()
      await page.waitForTimeout(200)
      await expect(visibleTooltip).toContainText(label)
      await timeline.hover()
      await expect(visibleTooltip).toHaveCount(0)
    }

    const historyToggle = agentPane.getByTestId('ai-history-toggle')
    await expect(historyToggle).toHaveCSS('border-top-width', '0px')
    await historyToggle.click()
    await expect(page.locator('.annotamd-agent-history')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(agentPane.getByTestId('ai-mode-selector')).toHaveCount(0)
    await expect(agentPane.getByTestId('ai-template-selector')).toHaveCount(0)

    await agentPane.getByTestId('ai-model-selector').click()
    await expect(page.locator('.annotamd-agent-model-menu')).toBeVisible()
    const modelSettingsButton = page.getByTestId('ai-model-open-settings')
    await expect(modelSettingsButton).toBeVisible()
    const settingsWindowPromise = app.waitForEvent('window')
    await modelSettingsButton.click()
    const settingsWindow = await settingsWindowPromise
    await settingsWindow.waitForLoadState('domcontentloaded')
    await expect.poll(() => settingsWindow.url()).toContain('/preference/agent')
    await settingsWindow.close()

    await page.waitForTimeout(100)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('copies the DBX provider picker and one-click CLI configuration flow', async() => {
  const { app, page } = await launchWithMarkdown(
    '# AI settings\n\nProvider configuration smoke test.\n',
    { suppressErrorDialog: true }
  )

  try {
    await app.evaluate(({ ipcMain }) => {
      for (const channel of [
        'annotamd::ai::configs:list',
        'annotamd::ai::configs:save',
        'annotamd::ai::configs:detect-cli',
        'annotamd::ai::preferences:get',
        'annotamd::ai::preferences:save'
      ]) ipcMain.removeHandler(channel)

      const state = { saves: [] as Array<Record<string, unknown>> }
      ;(global as unknown as { __annotamd_ai_settings_e2e__?: typeof state })
        .__annotamd_ai_settings_e2e__ = state
      ipcMain.handle('annotamd::ai::configs:list', () => [])
      ipcMain.handle('annotamd::ai::preferences:get', () => ({ maxApiRetries: 2 }))
      ipcMain.handle('annotamd::ai::preferences:save', (_event, preferences) => preferences)
      ipcMain.handle('annotamd::ai::configs:detect-cli', () => ({
        found: true,
        provider: 'codex',
        command: 'codex',
        executablePath: '/mock/bin/codex',
        version: 'codex-cli 1.2.3',
        message: 'Detected Codex CLI: codex-cli 1.2.3'
      }))
      ipcMain.handle('annotamd::ai::configs:save', (_event, request) => {
        const payload = request as Record<string, unknown> & {
          input: Record<string, unknown>
          enabled?: boolean
        }
        state.saves.push(payload)
        return {
          id: 'cli-e2e-config',
          ...payload.input,
          isDefault: true,
          enabled: payload.enabled ?? true
        }
      })
    })

    const settingsWindowPromise = app.waitForEvent('window')
    await page.evaluate(() => {
      window.electron.ipcRenderer.send('annotamd::open-setting-window', 'agent')
    })
    const settingsWindow = await settingsWindowPromise
    await settingsWindow.waitForLoadState('domcontentloaded')
    await expect.poll(() => settingsWindow.url()).toContain('/preference/agent')

    await expect(settingsWindow.getByText('Chat templates')).toHaveCount(0)
    await settingsWindow.getByRole('button', { name: 'Add configuration' }).click()
    const providerSelect = settingsWindow.locator('.pref-ai-provider-select .el-select__wrapper')
    await providerSelect.click()
    const providerMenu = settingsWindow.locator('.el-select-dropdown:visible')
    await expect(providerMenu.getByText('Custom', { exact: true })).toHaveCount(0)
    await expect(providerMenu.getByText('OpenAI', { exact: true })).toHaveCount(0)
    await expect(providerMenu.getByText('Claude Code CLI', { exact: true })).toBeVisible()
    await expect(providerMenu.locator('.annotamd-ai-provider-logo img').first()).toBeVisible()
    await providerMenu.getByText('Codex CLI', { exact: true }).click()

    await settingsWindow.getByRole('button', { name: 'Detect again' }).click()
    await expect(settingsWindow.getByTestId('ai-cli-detection')).toContainText('Local CLI detected')
    await expect(settingsWindow.getByTestId('ai-cli-detection')).toContainText('/mock/bin/codex')
    await settingsWindow.getByTestId('ai-cli-one-click-configure').click()
    await expect(settingsWindow.getByText('Codex CLI', { exact: true }).first()).toBeVisible()
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as {
        __annotamd_ai_settings_e2e__?: { saves: Array<Record<string, unknown>> }
      }).__annotamd_ai_settings_e2e__?.saves[0] ?? null
    ))).toMatchObject({
      input: {
        kind: 'cli',
        provider: 'codex',
        executablePath: '/mock/bin/codex'
      }
    })

    await settingsWindow.close()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('provides unified AI conversations and keeps Agent available without a document', async() => {
  const { app, page } = await launchWithMarkdown(
    '# AI workspace\n\nRight pane switching smoke test.\n',
    { suppressErrorDialog: true }
  )

  try {
    await app.evaluate(({ ipcMain }) => {
      const channels = [
        'annotamd::ai::snapshot',
        'annotamd::ai::configs:list',
        'annotamd::ai::configs:models',
        'annotamd::ai::conversations:create',
        'annotamd::ai::conversations:select',
        'annotamd::ai::conversations:delete',
        'annotamd::ai::templates:list',
        'annotamd::ai::send',
        'annotamd::ai::stop',
        'annotamd::ai::retry',
        'annotamd::ai::approvals:resolve',
        'annotamd::ai::change-sets:resolve'
      ]
      for (const channel of channels) ipcMain.removeHandler(channel)

      const now = Date.now()
      const cliConfig = {
        id: 'cli-e2e',
        name: 'Mock CLI Agent',
        kind: 'cli',
        provider: 'codex',
        isDefault: true,
        enabled: true,
        defaultModelId: 'mock-agent-model',
        supportsNativeResume: true
      }
      const initialConversation = {
        id: 'conversation-e2e-1',
        title: 'Existing conversation',
        mode: 'agent',
        configId: cliConfig.id,
        modelId: cliConfig.defaultModelId,
        templateIds: [],
        status: 'idle',
        createdAt: now,
        updatedAt: now
      }
      const state = {
        conversations: [initialConversation] as Array<Record<string, unknown>>,
        activeId: initialConversation.id,
        messages: [] as Array<Record<string, unknown>>,
        creates: [] as Array<Record<string, unknown>>,
        sends: [] as Array<Record<string, unknown>>,
        stops: [] as Array<Record<string, unknown>>,
        deletes: [] as string[],
        approvals: [] as Array<Record<string, unknown>>,
        resolves: [] as Array<Record<string, unknown>>
      }
      ;(global as unknown as { __annotamd_ai_e2e__?: typeof state }).__annotamd_ai_e2e__ = state

      ipcMain.handle('annotamd::ai::snapshot', () => ({
        readiness: { status: 'ready', configId: cliConfig.id, modelId: cliConfig.defaultModelId },
        configs: [cliConfig],
        conversations: state.conversations,
        activeConversationId: state.activeId,
        messages: state.messages,
        changeSets: [],
        running: false
      }))
      ipcMain.handle('annotamd::ai::configs:list', () => [cliConfig])
      ipcMain.handle('annotamd::ai::configs:models', () => [
        { id: 'mock-agent-model', name: 'Mock Agent Model', provider: 'codex' }
      ])
      ipcMain.handle('annotamd::ai::templates:list', () => [])
      ipcMain.handle('annotamd::ai::conversations:create', (event, request) => {
        state.creates.push(request as Record<string, unknown>)
        const conversation = {
          id: `conversation-e2e-${state.conversations.length + 1}`,
          title: (request as { title?: string }).title || 'New conversation',
          mode: (request as { mode: string }).mode,
          configId: (request as { configId?: string }).configId,
          modelId: (request as { modelId?: string }).modelId,
          templateIds: (request as { templateIds?: string[] }).templateIds ?? [],
          status: 'idle',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        state.conversations.unshift(conversation)
        state.activeId = conversation.id
        state.messages = []
        event.sender.send('annotamd::ai::event', { type: 'conversation-created', conversation })
        event.sender.send('annotamd::ai::event', {
          type: 'conversation-selected',
          conversationId: conversation.id,
          messages: [],
          changeSets: []
        })
        return conversation
      })
      ipcMain.handle('annotamd::ai::conversations:select', (_event, id: string) => {
        state.activeId = id
        return { messages: state.messages, changeSets: [] }
      })
      ipcMain.handle('annotamd::ai::conversations:delete', (_event, id: string) => {
        state.deletes.push(id)
        state.conversations = state.conversations.filter(conversation => conversation.id !== id)
        return true
      })
      ipcMain.handle('annotamd::ai::send', (event, request) => {
        const payload = request as Record<string, unknown> & { conversationId?: string; text: string }
        state.sends.push(payload)
        const conversationId = payload.conversationId || state.activeId
        const turnId = `turn-e2e-${state.sends.length}`
        const userMessage = {
          id: `user-e2e-${state.sends.length}`,
          conversationId,
          role: 'user',
          content: payload.text,
          status: 'complete',
          createdAt: Date.now()
        }
        const assistantMessage = {
          id: `assistant-e2e-${state.sends.length}`,
          conversationId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          createdAt: Date.now()
        }
        state.messages.push(userMessage, assistantMessage)
        event.sender.send('annotamd::ai::event', {
          type: 'message', conversationId, turnId, message: userMessage
        })
        event.sender.send('annotamd::ai::event', {
          type: 'message', conversationId, turnId, message: assistantMessage
        })
        event.sender.send('annotamd::ai::event', {
          type: 'turn-started', conversationId, turnId
        })
        event.sender.send('annotamd::ai::event', {
          type: 'message-delta',
          conversationId,
          turnId,
          messageId: assistantMessage.id,
          role: 'assistant',
          delta: 'Mocked unified response'
        })
        assistantMessage.content = 'Mocked unified response'
        return {
          conversationId,
          turnId,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id
        }
      })
      ipcMain.handle('annotamd::ai::stop', (event, request) => {
        const payload = request as { conversationId: string; turnId?: string }
        state.stops.push(payload)
        state.messages = state.messages.map(message => (
          message.status === 'streaming' ? { ...message, status: 'complete' } : message
        ))
        event.sender.send('annotamd::ai::event', {
          type: 'turn-finished',
          conversationId: payload.conversationId,
          turnId: payload.turnId || 'turn-e2e-1'
        })
        return true
      })
      ipcMain.handle('annotamd::ai::retry', () => {
        throw new Error('Retry is not expected in this smoke test.')
      })
      ipcMain.handle('annotamd::ai::approvals:resolve', (event, request) => {
        const payload = request as Record<string, unknown>
        state.approvals.push(payload)
        event.sender.send('annotamd::ai::event', {
          type: 'approval-resolved',
          conversationId: payload.conversationId,
          turnId: payload.runId,
          approvalId: payload.approvalId,
          decision: payload.decision
        })
        return true
      })
      ipcMain.handle('annotamd::ai::change-sets:resolve', (_event, request) => {
        const payload = request as { changeSetId: string; action: 'keep' | 'rollback' }
        state.resolves.push(payload)
        const status = payload.action === 'keep' ? 'kept' : 'rolled-back'
        return {
          changeSet: {
            id: payload.changeSetId,
            conversationId: state.activeId,
            turnId: 'turn-e2e-change',
            documentId: 'document-e2e',
            documentUri: 'file:///workspace/note.md',
            filePath: '/workspace/note.md',
            originalContent: '# Before',
            appliedContent: '# After',
            status,
            additions: 1,
            deletions: 1,
            createdAt: now,
            resolvedAt: Date.now()
          },
          transactionResult: { status, changed: false }
        }
      })
    })
    await clearRendererErrors(app)
    await page.locator('.editor-component').waitFor({ state: 'visible' })

    const agentPane = page.locator('.annotamd-agent-workspace')
    const commentPane = page.locator('.annotamd-comment-pane')
    const commentToggle = page.locator('.editor-tabs .tab-comment-toggle')
    const agentToggle = page.locator('.sidebar-agent-toggle')
    await expect(commentToggle).toBeVisible()
    await expect(agentToggle).toBeVisible()
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await expect(agentToggle).not.toHaveClass(/\bactive\b/)
    await expect.poll(async() => {
      const [comment, agent] = await Promise.all([
        commentToggle.boundingBox(),
        agentToggle.boundingBox()
      ])
      if (!comment || !agent) return null
      return agent.x < comment.x
    }).toBe(true)
    await agentToggle.click()
    await expect(agentPane).toBeVisible()
    await expect(agentToggle).toHaveClass(/\bactive\b/)
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await expect(page.locator('.side-bar')).toHaveCSS('width', '428px')
    await expect(agentPane).toHaveCSS('width', '380px')
    await expect(agentPane).toHaveCSS('box-sizing', 'border-box')
    await agentPane.getByTestId('ai-history-toggle').click()
    const activeHistoryDot = page.locator(
      '.annotamd-agent-history-row.is-active .annotamd-agent-history-select > i'
    )
    await expect(activeHistoryDot).toHaveCSS('background-color', 'rgb(32, 161, 98)')
    await agentPane.getByTestId('ai-history-toggle').click()
    await expect(page.locator('.annotamd-agent-history')).not.toBeVisible()
    const agentEditorClientWidth = await page.locator('.editor-component')
      .evaluate(element => element.clientWidth)
    await expect(page.locator('.annotamd-editor-scroll-container'))
      .toHaveCSS('scrollbar-gutter', 'stable')
    await expect(commentPane).toHaveCount(0)
    await expect(agentPane.getByTestId('ai-composer')).toBeEnabled()
    await expect(agentPane.getByTestId('ai-new-session')).toBeEnabled()
    const suggestions = agentPane.getByTestId('ai-suggested-prompt')
    await expect(suggestions.first()).toBeVisible()
    const suggestionCount = await suggestions.count()
    expect(suggestionCount).toBeGreaterThanOrEqual(2)
    expect(suggestionCount).toBeLessThanOrEqual(3)
    const suggestedText = (await suggestions.first().textContent())?.trim() ?? ''
    await suggestions.first().click()
    await expect(agentPane.getByTestId('ai-composer')).toHaveValue(suggestedText)
    expect(await app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { sends: unknown[] } })
        .__annotamd_ai_e2e__?.sends.length ?? 0
    ))).toBe(0)
    await expect.poll(() => agentPane.locator('.annotamd-agent-compose-toolbar').evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }))).toMatchObject({
      clientWidth: expect.any(Number),
      scrollWidth: expect.any(Number)
    })
    expect(await agentPane.locator('.annotamd-agent-compose-toolbar').evaluate(element => (
      element.scrollWidth <= element.clientWidth
    ))).toBe(true)

    await agentPane.getByTestId('ai-permission-trigger').click()
    const permissionMenu = page.locator('.annotamd-agent-permission-menu:visible')
    await expect(permissionMenu).toBeVisible()
    const permissionDescriptions = permissionMenu.locator('small.is-description')
    await expect(permissionDescriptions).toHaveCount(2)
    const permissionOptions = permissionMenu.locator(':scope > button')
    await expect(permissionOptions).toHaveCount(2)
    expect(await permissionOptions.evaluateAll(buttons => buttons.every((button) => {
      const style = getComputedStyle(button)
      return style.borderTopStyle === 'solid' && style.borderTopWidth === '1px'
    }))).toBe(true)
    await expect(permissionDescriptions.first()).toHaveCSS('white-space', 'nowrap')
    expect(await permissionDescriptions.evaluateAll(nodes => nodes.every(node => (
      node.scrollHeight <= node.clientHeight + 1
    )))).toBe(true)
    await page.waitForTimeout(750)
    await expect(agentPane.getByTestId('ai-permission-trigger')).toHaveAttribute('aria-expanded', 'true')
    await expect(permissionMenu).toBeVisible()
    await expect(permissionMenu.getByTestId('ai-permission-request')).toBeEnabled()
    await permissionMenu.getByTestId('ai-permission-full-access').click()
    await expect(agentPane.getByTestId('ai-permission-trigger')).toContainText('Full access')
    await agentPane.getByTestId('ai-permission-trigger').click()
    await page.locator('.annotamd-agent-permission-menu:visible')
      .getByTestId('ai-permission-request').click()
    await expect(agentPane.getByTestId('ai-permission-trigger')).toContainText('Request approval')

    await agentPane.getByTestId('ai-new-session').click()
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { creates: unknown[] } })
        .__annotamd_ai_e2e__?.creates.length ?? 0
    ))).toBe(1)
    await expect(agentPane).toContainText('New conversation')
    await expect(agentPane.getByTestId('ai-composer')).toHaveValue('')
    expect(await suggestions.count()).toBeGreaterThanOrEqual(2)
    expect(await suggestions.count()).toBeLessThanOrEqual(3)
    await agentPane.getByTestId('ai-composer').fill('Revise this document')
    await agentPane.getByTestId('ai-send').click()
    const userMessage = agentPane.locator('.annotamd-agent-message.is-user')
    const assistantMessage = agentPane.locator('.annotamd-agent-message.is-assistant')
    const streamingProcessMessage = agentPane.getByTestId('ai-process-message')
    await expect(userMessage).toContainText('Revise this document')
    await expect(streamingProcessMessage).toContainText('Mocked unified response')
    await expect(assistantMessage).toHaveCount(0)
    await expect(agentPane.locator('.annotamd-agent-message-labels')).toHaveCount(0)
    await expect(userMessage).toHaveCSS('align-self', 'flex-end')
    await expect(agentPane.locator('.annotamd-agent-message-meta')).toHaveCount(1)
    await expect(agentPane.getByTestId('ai-stop')).toBeVisible()
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { sends: Array<Record<string, unknown>> } })
        .__annotamd_ai_e2e__?.sends[0] ?? null
    ))).toMatchObject({
      text: 'Revise this document',
      selection: { mode: 'agent', configId: 'cli-e2e' },
      documentId: expect.any(String),
      markdown: expect.stringContaining('# AI workspace')
    })

    await agentPane.getByTestId('ai-stop').click()
    await expect(agentPane.getByTestId('ai-send')).toBeVisible()
    await expect(assistantMessage).toContainText('Mocked unified response')
    await expect(assistantMessage).toHaveCSS('align-self', 'flex-start')
    await expect(agentPane.locator('.annotamd-agent-message-meta')).toHaveCount(2)
    expect(await userMessage.locator('.annotamd-agent-message-bubble').evaluate((element) => {
      const userColor = getComputedStyle(element).backgroundColor
      const assistant = document.querySelector(
        '.annotamd-agent-message.is-assistant .annotamd-agent-message-bubble'
      )
      return assistant ? userColor !== getComputedStyle(assistant).backgroundColor : false
    })).toBe(true)
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { stops: unknown[] } })
        .__annotamd_ai_e2e__?.stops.length ?? 0
    ))).toBe(1)

    await sendIpcToRenderer(app, 'annotamd::ai::event', {
      type: 'approval-requested',
      approval: {
        id: 'turn-e2e-1:approval-1',
        runId: 'turn-e2e-1',
        conversationId: 'conversation-e2e-2',
        provider: 'codex',
        kind: 'command',
        title: 'Codex requests permission to run a command',
        detail: 'Run the document verification suite.',
        command: 'npm run verify:comments',
        options: ['allow-once', 'allow-session', 'deny'],
        requestedAt: Date.now()
      }
    })
    await expect(agentPane.getByTestId('ai-approval-card')).toContainText('npm run verify:comments')
    await agentPane.getByTestId('ai-approval-allow-once').click()
    await expect(agentPane.getByTestId('ai-approval-card')).toHaveCount(0)
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { approvals: unknown[] } })
        .__annotamd_ai_e2e__?.approvals.length ?? 0
    ))).toBe(1)

    await sendIpcToRenderer(app, 'annotamd::ai::event', {
      type: 'change-set',
      conversationId: 'conversation-e2e-2',
      turnId: 'turn-e2e-change',
      changeSet: {
        id: 'change-set-e2e',
        conversationId: 'conversation-e2e-2',
        turnId: 'turn-e2e-change',
        documentId: 'document-e2e',
        documentUri: 'file:///workspace/note.md',
        filePath: '/workspace/note.md',
        originalContent: '# Before',
        appliedContent: '# After',
        status: 'applied-unreviewed',
        additions: 1,
        deletions: 1,
        createdAt: Date.now(),
        transaction: {
          sessionId: 'conversation-e2e-2',
          turnId: 'turn-e2e-change',
          documentId: 'document-e2e',
          documentUri: 'file:///workspace/note.md',
          filePath: '/workspace/note.md',
          beforeMarkdown: '# Before',
          finalMarkdown: '# After',
          mutationCount: 1,
          diff: {
            additions: 1,
            deletions: 1,
            lines: [
              { kind: 'deletion', text: '# Before', beforeLine: 1 },
              { kind: 'addition', text: '# After', afterLine: 1 }
            ]
          },
          status: 'active'
        }
      }
    })
    await expect(agentPane.getByTestId('ai-change-set-card')).toContainText('# After')
    await agentPane.getByTestId('ai-change-set-keep').click()
    await expect(agentPane.getByTestId('ai-change-set-card')).toHaveClass(/is-kept/)
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { resolves: unknown[] } })
        .__annotamd_ai_e2e__?.resolves.length ?? 0
    ))).toBe(1)

    await commentToggle.click()
    await expect(commentPane).toBeVisible()
    await expect(commentToggle).toHaveClass(/is-active/)
    await expect(agentToggle).not.toHaveClass(/\bactive\b/)
    await commentToggle.click()
    await expect(commentPane).toHaveCount(0)
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await commentToggle.click()
    await expect(commentPane).toBeVisible()
    await expect(commentToggle).toHaveClass(/is-active/)
    const commentClose = commentPane.locator('.annotamd-pane-close')
    await expect(commentClose.locator('.el-icon')).toBeVisible()
    const commentCloseLabel = await commentClose.getAttribute('aria-label')
    expect(commentCloseLabel).toBeTruthy()
    await commentClose.hover()
    await expect(page.getByRole('tooltip')).toContainText(commentCloseLabel ?? '')
    await expect(commentPane).toHaveCSS('box-sizing', 'border-box')
    await expect(agentPane).toHaveCount(0)
    await expect.poll(() => page.locator('.editor-component').evaluate(element => element.clientWidth))
      .toBeGreaterThan(agentEditorClientWidth)
    await expect.poll(async() => {
      const [tabsBottom, commentHeaderBottom] = await Promise.all([
        page.locator('.editor-tabs').evaluate(element => element.getBoundingClientRect().bottom),
        commentPane.locator('.annotamd-comment-header')
          .evaluate(element => element.getBoundingClientRect().bottom)
      ])
      return Math.abs(tabsBottom - commentHeaderBottom)
    }).toBeLessThanOrEqual(1)
    await agentToggle.click()
    await expect(agentPane).toBeVisible()
    await expect(agentToggle).toHaveClass(/\bactive\b/)
    await expect(commentPane).toHaveCount(0)
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await page.setViewportSize({ width: 1500, height: 800 })
    await commentToggle.click()
    await expect(commentPane).toBeVisible()
    await expect(agentPane).toBeVisible()
    await expect(agentToggle).toHaveClass(/\bactive\b/)
    await expect(commentToggle).toHaveClass(/is-active/)
    await expect.poll(async() => {
      const [tabsShadow, agentHeaderShadow] = await Promise.all([
        page.locator('.editor-tabs').evaluate(element => getComputedStyle(element).boxShadow),
        agentPane.locator('.annotamd-agent-header')
          .evaluate(element => getComputedStyle(element).boxShadow)
      ])
      return tabsShadow === agentHeaderShadow
    }).toBe(true)
    await expect(agentPane.locator('.annotamd-agent-message')).toHaveCount(2)

    await page.locator('.tabs-container > li.active .close-icon').click()
    await expect(page.locator('.recent-files-projects')).toBeVisible()
    await expect(agentPane).toBeVisible()
    await expect(agentPane.getByTestId('ai-open-comments')).toHaveCount(0)

    await agentPane.getByTestId('ai-close').click()
    await expect(agentPane).toHaveCount(0)
    await expect(agentToggle).not.toHaveClass(/\bactive\b/)
    await agentToggle.click()
    await expect(agentPane).toBeVisible()
    await expect(agentPane.locator('.annotamd-agent-message')).toHaveCount(2)

    await expect(agentPane.getByTestId('ai-delete-current')).toBeEnabled()
    await agentPane.getByTestId('ai-delete-current').click()
    await expect.poll(() => app.evaluate(() => (
      (global as unknown as { __annotamd_ai_e2e__?: { deletes: unknown[] } })
        .__annotamd_ai_e2e__?.deletes.length ?? 0
    ))).toBe(1)
    await expect(agentPane.locator('.annotamd-agent-message')).toHaveCount(0)

    await page.waitForTimeout(100)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
