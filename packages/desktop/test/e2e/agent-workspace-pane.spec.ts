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

test('carries selected document text into Agent context and adds text attachments', async() => {
  const phrase = 'Select this exact phrase for Agent.'
  const { app, page } = await launchWithMarkdown(
    `# Agent context\n\n${phrase}\n`,
    { suppressErrorDialog: true }
  )

  try {
    await clearRendererErrors(app)
    await selectEditorPhrase(page, phrase)
    await page.locator('.tab-agent-toggle').click()

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
    await page.locator('.tab-agent-toggle').click()

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
    await page.locator('.tab-agent-toggle').click()

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

test('keeps the no-config Agent sidebar controls clickable and the header minimal', async() => {
  const { app, page } = await launchWithMarkdown(
    '# AI workspace controls\n\nNo configuration interaction test.\n',
    { suppressErrorDialog: true }
  )

  try {
    await clearRendererErrors(app)
    await page.locator('.tab-agent-toggle').click()

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
      [agentPane.getByTestId('ai-toggle-maximize'), 'Maximize'],
      [agentPane.getByTestId('ai-close'), 'Close AI Assistant']
    ] as const
    for (const [control, label] of headerTooltips) {
      await control.hover()
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

    const agentPane = page.locator('.annotamd-agent-workspace')
    const commentPane = page.locator('.annotamd-comment-pane')
    const titleBar = page.locator('.title-bar')
    const commentToggle = titleBar.locator('.tab-comment-toggle')
    const agentToggle = titleBar.locator('.tab-agent-toggle')
    await expect(commentToggle).toBeVisible()
    await expect(agentToggle).toBeVisible()
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await expect(agentToggle).not.toHaveClass(/is-active/)
    await expect.poll(async() => {
      const [bar, comment, agent] = await Promise.all([
        titleBar.boundingBox(),
        commentToggle.boundingBox(),
        agentToggle.boundingBox()
      ])
      if (!bar || !comment || !agent) return null
      return {
        sameWidth: Math.abs(comment.width - agent.width) <= 1,
        sameHeight: Math.abs(comment.height - agent.height) <= 1,
        commentInside: comment.y >= bar.y && comment.y + comment.height <= bar.y + bar.height + 1,
        agentInside: agent.y >= bar.y && agent.y + agent.height <= bar.y + bar.height + 1
      }
    }).toEqual({
      sameWidth: true,
      sameHeight: true,
      commentInside: true,
      agentInside: true
    })
    await agentToggle.click()
    await expect(agentPane).toBeVisible()
    await expect(agentToggle).toHaveClass(/is-active/)
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await expect(agentPane).toHaveCSS('width', '360px')
    await expect(agentPane).toHaveCSS('box-sizing', 'border-box')
    await agentPane.getByTestId('ai-history-toggle').click()
    const activeHistoryDot = page.locator(
      '.annotamd-agent-history-row.is-active .annotamd-agent-history-select > i'
    )
    await expect(activeHistoryDot).toHaveCSS('background-color', 'rgb(32, 161, 98)')
    await agentPane.getByTestId('ai-history-toggle').click()
    await expect(page.locator('.annotamd-agent-history')).not.toBeVisible()
    const sharedPaneWidth = await agentPane.evaluate(element => element.getBoundingClientRect().width)
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
    await expect(userMessage).toContainText('Revise this document')
    await expect(assistantMessage).toContainText('Mocked unified response')
    await expect(agentPane.locator('.annotamd-agent-message-labels')).toHaveCount(0)
    await expect(userMessage).toHaveCSS('align-self', 'flex-end')
    await expect(assistantMessage).toHaveCSS('align-self', 'flex-start')
    await expect(agentPane.locator('.annotamd-agent-message-meta')).toHaveCount(2)
    expect(await userMessage.locator('.annotamd-agent-message-bubble').evaluate((element) => {
      const userColor = getComputedStyle(element).backgroundColor
      const assistant = document.querySelector(
        '.annotamd-agent-message.is-assistant .annotamd-agent-message-bubble'
      )
      return assistant ? userColor !== getComputedStyle(assistant).backgroundColor : false
    })).toBe(true)
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

    await agentPane.getByTestId('ai-toggle-maximize').click()
    await expect(agentPane).toHaveClass(/is-maximized/)
    await agentPane.getByTestId('ai-toggle-maximize').click()
    await expect(agentPane).not.toHaveClass(/is-maximized/)

    await commentToggle.click()
    await expect(commentPane).toBeVisible()
    await expect(commentToggle).toHaveClass(/is-active/)
    await expect(agentToggle).not.toHaveClass(/is-active/)
    const commentClose = commentPane.locator('.annotamd-pane-close')
    await expect(commentClose.locator('.el-icon')).toBeVisible()
    const commentCloseLabel = await commentClose.getAttribute('aria-label')
    expect(commentCloseLabel).toBeTruthy()
    await commentClose.hover()
    await expect(page.getByRole('tooltip')).toContainText(commentCloseLabel ?? '')
    await expect(commentPane).toHaveCSS('box-sizing', 'border-box')
    await expect(agentPane).toHaveCount(0)
    await expect.poll(() => commentPane.evaluate(element => element.getBoundingClientRect().width))
      .toBe(sharedPaneWidth)
    await expect.poll(() => page.locator('.editor-component').evaluate(element => element.clientWidth))
      .toBe(agentEditorClientWidth)
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
    await expect(agentToggle).toHaveClass(/is-active/)
    await expect(commentToggle).not.toHaveClass(/is-active/)
    await expect.poll(() => agentPane.evaluate(element => element.getBoundingClientRect().width))
      .toBe(sharedPaneWidth)
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
    await expect(page.getByTestId('empty-agent-toggle')).toHaveCount(0)

    await agentPane.getByTestId('ai-close').click()
    await expect(agentPane).toHaveCount(0)
    await expect(page.getByTestId('empty-agent-toggle')).toBeVisible()
    await page.getByTestId('empty-agent-toggle').click()
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
