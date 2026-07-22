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
const appComponent = readFileSync(
  resolve(root, 'src/renderer/src/pages/app.vue'),
  'utf8'
)
const splitButton = readFileSync(
  resolve(root, 'src/renderer/src/components/OpenFileSplitButton.vue'),
  'utf8'
)

describe('empty editor start actions', () => {
  it('uses the same Open File split button in the sidebar and start panel', () => {
    expect(recentComponent).toContain("send('annotamd::cmd-open-file')")
    expect(recentComponent).toMatch(/<OpenFileSplitButton[\s\S]*?@open-file="openFile"[\s\S]*?@open-folder="openFolder"/)
    expect(sidebarTree).toMatch(/<OpenFileSplitButton[\s\S]*?@open-file="openFile"[\s\S]*?@open-folder="openFolder"/)
    expect(recentComponent).toMatch(/class="start-secondary"[^>]*@click="newFile"/s)
    expect(recentComponent).toContain("t('recent.dragHint')")
  })

  it('defaults to Open File and exposes Open Folder from the dropdown', () => {
    expect(splitButton).toContain("emit('open-file')")
    expect(splitButton).toContain("emit('open-folder')")
    expect(splitButton).toContain("t('recent.openFile')")
    expect(splitButton).toContain("t('sideBar.tree.openFolder')")
    expect(splitButton).toContain('aria-haspopup="menu"')
  })

  it('keeps both empty-state instances at the same 13px type size and theme colors', () => {
    expect(splitButton).toMatch(/\.open-file-split\s*\{[^}]*font-size:\s*13px;/s)
    expect(splitButton).toMatch(/background:\s*var\(--buttonPrimaryBgColor\);/)
    expect(splitButton).toMatch(/color:\s*var\(--buttonPrimaryFontColor\);/)
    expect(recentComponent).toMatch(
      /\.start-secondary\s*\{[^}]*color:\s*var\(--buttonPrimaryFontColor\);[^}]*background:\s*var\(--buttonPrimaryBgColor\);/s
    )
  })

  it('collapses the sidebar content panel whenever the editor becomes empty', () => {
    expect(appComponent).toMatch(
      /watch\(\[init, hasCurrentFile\],[\s\S]*?isInitialized && !hasFile[\s\S]*?SET_LAYOUT\(\{ rightColumn: '' \}\)/
    )
  })

  it('does not reserve comment-pane space while the editor is empty', () => {
    expect(appComponent).toMatch(
      /const commentPaneActive = computed<boolean>\(\(\) => \{[\s\S]*?init\.value && hasCurrentFile\.value && commentPaneVisible\.value/
    )
    expect(appComponent).toContain(":class=\"{ 'comment-pane-open': commentPaneActive }\"")
    expect(appComponent).toMatch(
      /'--annotamd-comment-pane-width': commentPaneActive\.value \? `\$\{commentPaneWidth\.value\}px` : '0px'/
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
