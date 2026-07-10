import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import en from '../../../static/locales/en.json'
import zhCN from '../../../static/locales/zh-CN.json'

const __dirname = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(__dirname, '../../../src/renderer/src')

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
  'annotamd.comments.pendingSummary',
  'annotamd.comments.documentTitle',
  'annotamd.comments.selectionScope',
  'annotamd.comments.replyPlaceholder',
  'annotamd.comments.send',
  'annotamd.comments.emptyTitle',
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

  it('does not hard-code Chinese copy in the added Vue templates', () => {
    const componentPaths = [
      resolve(renderer, 'components/annotamd/CommentPane.vue'),
      resolve(renderer, 'components/annotamd/DocumentCommentFooter.vue'),
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
})
