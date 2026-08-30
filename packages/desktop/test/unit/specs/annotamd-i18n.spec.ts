import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import en from '../../../static/locales/en.json'
import zhCN from '../../../static/locales/zh-CN.json'

const __dirname = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(__dirname, '../../../src/renderer/src')
const desktop = resolve(__dirname, '../../../src')

const getMessage = (messages: Record<string, unknown>, key: string): string => {
  let value: unknown = messages
  for (const segment of key.split('.')) {
    if (!value || typeof value !== 'object') return ''
    value = (value as Record<string, unknown>)[segment]
  }
  return typeof value === 'string' ? value : ''
}

const annotaMDKeys = [
  'annotamd.mode.label',
  'annotamd.mode.blockEdit',
  'annotamd.mode.source',
  'annotamd.comments.title',
  'annotamd.comments.titleWithCount',
  'annotamd.comments.pendingSummary',
  'annotamd.comments.documentTitle',
  'annotamd.comments.selectionScope',
  'annotamd.comments.replyPlaceholder',
  'annotamd.comments.send',
  'annotamd.comments.emptyTitle',
  'annotamd.agentWorkspace.open',
  'annotamd.agentWorkspace.newSession',
  'annotamd.agentWorkspace.emptyTitle',
  'annotamd.agentWorkspace.emptyDescription',
  'annotamd.agentWorkspace.placeholder',
  'annotamd.agentWorkspace.send',
  'annotamd.agentWorkspace.stop',
  'annotamd.agentWorkspace.workspace',
  'annotamd.agentWorkspace.status.initializing',
  'annotamd.agentWorkspace.status.ready',
  'annotamd.agentWorkspace.status.missing',
  'annotamd.agentWorkspace.status.incompatible',
  'annotamd.agentWorkspace.status.needs-auth',
  'annotamd.agentWorkspace.status.running',
  'annotamd.agentWorkspace.status.error',
  'preferences.agent.aiWorkspace.integrationTitle',
  'preferences.agent.aiWorkspace.integrationDescription',
  'preferences.agent.aiWorkspace.manualSetup',
  'preferences.agent.aiWorkspace.commentAgentLink',
  'preferences.agent.aiWorkspace.mcpGuideTitle',
  'preferences.agent.aiWorkspace.skillGuideTitle',
  'editor.blockConversion.title',
  'editor.blockConversion.structuralSelection',
  'sideBar.tree.newMarkdownFilePlaceholder'
]

describe('AnnotaMD UI localization', () => {
  it('defines the added UI copy in both English and Simplified Chinese', () => {
    for (const key of annotaMDKeys) {
      const english = getMessage(en as Record<string, unknown>, key)
      const chinese = getMessage(zhCN as Record<string, unknown>, key)

      expect(english, `missing English translation: ${key}`).not.toBe('')
      expect(english, `English translation contains Chinese: ${key}`).not.toMatch(/[\u3400-\u9fff]/)
      expect(chinese, `missing Chinese translation: ${key}`).not.toBe('')
      expect(chinese, `Chinese translation has no Chinese text: ${key}`).toMatch(/[\u3400-\u9fff]/)
    }
  })

  it('uses the same reply and consult labels in comment composers and threads', () => {
    expect(getMessage(zhCN as Record<string, unknown>, 'annotamd.comments.send')).toBe('回复')
    expect(getMessage(zhCN as Record<string, unknown>, 'annotamd.comments.reply')).toBe('回复')
    expect(getMessage(zhCN as Record<string, unknown>, 'annotamd.comments.sendAgent')).toBe('咨询')
    expect(getMessage(en as Record<string, unknown>, 'annotamd.comments.send')).toBe('Reply')
    expect(getMessage(en as Record<string, unknown>, 'annotamd.comments.reply')).toBe('Reply')
    expect(getMessage(en as Record<string, unknown>, 'annotamd.comments.sendAgent')).toBe('Consult')
  })

  it('does not hard-code Chinese copy in the added Vue templates', () => {
    const componentPaths = [
      resolve(renderer, 'components/annotamd/CommentPane.vue'),
      resolve(renderer, 'components/annotamd/DocumentCommentFooter.vue'),
      resolve(renderer, 'components/agent/AgentWorkspacePanel.vue'),
      resolve(renderer, 'components/titleBar/index.vue')
    ]

    for (const componentPath of componentPaths) {
      const template = readFileSync(componentPath, 'utf8').split('<script setup')[0]
      expect(template, componentPath).not.toMatch(/[\u3400-\u9fff]/)
    }
  })

  it('localizes the new Markdown filename placeholder', () => {
    const tree = readFileSync(resolve(renderer, 'components/sideBar/tree.vue'), 'utf8')
    expect(tree).toContain(":placeholder=\"t('sideBar.tree.newMarkdownFilePlaceholder')\"")
    expect(tree).not.toContain('placeholder="Enter .md file name"')
  })

  it('refreshes the preferences search input when the locale changes', () => {
    const sidebar = readFileSync(resolve(renderer, 'prefComponents/sideBar/index.vue'), 'utf8')
    expect(sidebar).toContain(':key="locale"')
    expect(sidebar).toContain('const { t, locale } = useI18n()')
  })

  it('loads source locales before ignored minified artifacts in development', () => {
    const commonI18n = readFileSync(resolve(desktop, 'common/i18n.ts'), 'utf8')
    expect(commonI18n).toContain('fs.existsSync(rawPath) ? rawPath : minPath')
    expect(commonI18n).not.toContain('fs.existsSync(minPath) ? minPath : rawPath')
  })
})
