import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  clearRendererErrors,
  expectNoRendererErrors,
  launchWithMarkdown
} from './helpers'

test('starts an Agent turn from the live Muya checkpoint when the sidebar snapshot is stale', async() => {
  const runtimeDirectory = mkdtempSync(join(tmpdir(), 'annotamd-agent-checkpoint-'))
  const executablePath = join(runtimeDirectory, 'mock-codex')
  writeFileSync(executablePath, [
    '#!/bin/sh',
    'printf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"Live checkpoint accepted."}}\'',
    'printf \'%s\\n\' \'{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\''
  ].join('\n'), 'utf8')
  chmodSync(executablePath, 0o755)
  const { app, page } = await launchWithMarkdown(
    '# Live checkpoint\n\nThe renderer owns this current document.\n',
    { suppressErrorDialog: true }
  )

  try {
    await clearRendererErrors(app)
    await page.locator('.sidebar-agent-toggle').click()
    const pane = page.locator('.annotamd-agent-workspace')
    await expect(pane).toBeVisible()

    const result = await pane.evaluate(async(_element, mockExecutable) => {
      type EditorStore = {
        currentFile?: {
          id?: string
          pathname?: string
          markdown?: string
          isSaved?: boolean
        }
      }
      type VueAppRoot = HTMLElement & {
        __vue_app__?: {
          config?: {
            globalProperties?: {
              $pinia?: { _s?: Map<string, unknown> }
            }
          }
        }
      }
      const root = document.querySelector('#app') as VueAppRoot | null
      const editor = root?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get('editor') as
        EditorStore | undefined
      const file = editor?.currentFile
      if (!file?.id || !file.pathname) throw new Error('Agent document context is unavailable.')
      const config = await window.electron.ipcRenderer.invoke('annotamd::ai::configs:save', {
        input: {
          name: 'Checkpoint test CLI',
          kind: 'cli',
          provider: 'codex',
          executablePath: mockExecutable
        },
        isDefault: true,
        enabled: true
      })
      const normalizedPath = file.pathname.replace(/\\/g, '/')
      const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23').replace(/\?/g, '%3F')
      const documentUri = normalizedPath.startsWith('/')
        ? `file://${encodedPath}`
        : `file:///${encodedPath}`
      return await window.electron.ipcRenderer.invoke('annotamd::ai::send', {
        text: 'Read the current document.',
        selection: {
          mode: 'agent',
          configId: config.id,
          permissionMode: 'full-access',
          templateIds: []
        },
        workspacePath: window.path.dirname(file.pathname),
        documentHandleId: file.id,
        documentId: file.id,
        documentUri,
        filePath: file.pathname,
        documentRevision: 0,
        documentDirty: !file.isSaved,
        markdown: '# Stale sidebar snapshot\n'
      })
    }, executablePath)

    expect(result.turnId).toBeTruthy()
    await expect(pane).toContainText('Live checkpoint accepted.')
    await expect(pane.locator('.annotamd-agent-error')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    rmSync(runtimeDirectory, { recursive: true, force: true })
  }
})
