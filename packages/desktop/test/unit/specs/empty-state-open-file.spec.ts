import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const recentComponent = readFileSync(
  resolve(root, 'src/renderer/src/components/recent/index.vue'),
  'utf8'
)
const sidebarTree = readFileSync(
  resolve(root, 'src/renderer/src/components/sideBar/tree.vue'),
  'utf8'
)

describe('empty editor start actions', () => {
  it('makes Open File the primary action and keeps New File secondary', () => {
    expect(recentComponent).toContain("send('mt::cmd-open-file')")
    expect(recentComponent).toMatch(/class="start-primary"[^>]*@click="openFile"/s)
    expect(recentComponent).toMatch(/class="start-secondary"[^>]*@click="newFile"/s)
    expect(recentComponent).toContain("t('recent.dragHint')")
  })

  it('uses the contrast-controlled primary theme pair for primary actions', () => {
    expect(recentComponent).toMatch(
      /\.start-primary\s*\{[^}]*background:\s*var\(--buttonPrimaryBgColor\);/s
    )
    expect(recentComponent).toMatch(
      /\.start-primary:hover,[\s\S]*?\.start-secondary:hover,[\s\S]*?\{[^}]*background:\s*var\(--buttonPrimaryBgColor\);/s
    )
    expect(sidebarTree).toMatch(
      /\.open-project \.el-button\.is-text\.is-has-bg,[\s\S]*?\{[^}]*background-color:\s*var\(--buttonPrimaryBgColor\);/s
    )
    expect(sidebarTree).toMatch(
      /\.open-project \.el-button\.is-text\.is-has-bg:hover,[\s\S]*?\{[^}]*background-color:\s*var\(--buttonPrimaryBgColor\);/s
    )
  })

  it('localizes every new start-screen label in all supported languages', () => {
    const localeDir = resolve(root, 'static/locales')
    for (const locale of ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'tr', 'zh-CN', 'zh-TW']) {
      const messages = JSON.parse(readFileSync(resolve(localeDir, `${locale}.json`), 'utf8'))
      expect(messages.recent.startTitle, locale).toBeTruthy()
      expect(messages.recent.startDescription, locale).toBeTruthy()
      expect(messages.recent.openFile, locale).toBeTruthy()
      expect(messages.recent.newBlankFile, locale).toBeTruthy()
      expect(messages.recent.dragHint, locale).toBeTruthy()
    }
  })
})
