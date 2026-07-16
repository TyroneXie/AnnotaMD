import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const readRepoFile = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD preference styling', () => {
  it('uses 15px as the editor font-size default everywhere', () => {
    const schema = readRepoFile('packages/desktop/src/main/preferences/schema.json')
    const store = readRepoFile('packages/desktop/src/renderer/src/store/preferences.ts')
    const defaults = readRepoFile('packages/desktop/static/preference.json')
    const muya = readRepoFile('packages/muya/src/config/index.ts')

    expect(schema).toMatch(/"fontSize"\s*:\s*\{[^}]*"default"\s*:\s*15/s)
    expect(store).toMatch(/fontSize:\s*15/)
    expect(defaults).toMatch(/"fontSize":\s*15/)
    expect(muya).toMatch(/MUYA_DEFAULT_OPTIONS\s*=\s*\{[^}]*fontSize:\s*15/s)
  })

  it('renders every off switch with a gray track and visible white thumb', () => {
    const css = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/common/bool/index.vue'
    )

    expect(css).toMatch(
      /\.el-switch__core\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--editorColor\) 18%, var\(--editorBgColor\)\);/s
    )
    expect(css).toMatch(/\.el-switch__action\s*\{[^}]*background:\s*#fff;/s)
    expect(css).toMatch(/\.el-switch__core\s*\{[^}]*min-width:\s*34px;/s)
  })

  it('uses compact page spacing and typography', () => {
    const css = readRepoFile('packages/desktop/src/renderer/src/pages/preference.vue')

    expect(css).toContain('--prefSideBarWidth: 200px;')
    expect(css).toMatch(/& h4\s*\{[^}]*font-size:\s*17px;/s)
    expect(css).toMatch(/& \.pref-setting\s*\{[^}]*padding:\s*32px;/s)
  })

  it('uses compact shared control spacing', () => {
    const controls = ['bool', 'range', 'select', 'textBox', 'fontTextBox'].map((name) =>
      readRepoFile(`packages/desktop/src/renderer/src/prefComponents/common/${name}/index.vue`)
    )

    for (const css of controls) {
      expect(css).toMatch(/margin:\s*4px 0;/)
      expect(css).toMatch(/font-size:\s*14px;/)
    }
  })

  it('uses compact numeric steppers for editor size controls', () => {
    const range = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/common/range/index.vue'
    )
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/editor/index.vue'
    )

    expect(range).toContain('class="number-stepper"')
    expect(range).toContain('class="stepper-button"')
    expect(range).toContain('class="stepper-input"')
    expect(range).toContain('@change="handleInput"')
    expect(range).not.toContain('<el-slider')
    expect(range).not.toContain('<el-input-number')
    expect(editor).not.toContain('unit="px"')
    const preferencePage = readRepoFile(
      'packages/desktop/src/renderer/src/pages/preference.vue'
    )
    expect(preferencePage).toContain('--prefControlWidth: 260px;')
    const imagePreferences = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/image/index.vue'
    )
    expect(imagePreferences).toContain(
      ':description="t(\'preferences.image.defaultBehavior\')"'
    )
  })

  it('does not render a redundant Startup heading above its two labeled option groups', () => {
    const general = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/index.vue'
    )

    expect(general).not.toContain('preferences.general.startup.title')
    expect(general).toContain('preferences.general.startup.layoutOptions')
    expect(general).toContain('preferences.general.startup.startupFilesFolders')
  })

  it('keeps zoom controls in the Window menu instead of duplicating them in Settings', () => {
    const general = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/index.vue'
    )
    const config = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/config.ts'
    )
    const windowMenu = readRepoFile('packages/desktop/src/main/menu/templates/window.ts')
    const windowUtils = readRepoFile('packages/desktop/src/main/windows/utils.ts')
    const windowActions = readRepoFile('packages/desktop/src/main/menu/actions/window.ts')
    const macKeybindings = readRepoFile(
      'packages/desktop/src/main/keyboard/keybindingsDarwin.ts'
    )

    expect(general).not.toContain("preferences.general.window.zoom")
    expect(config).not.toContain('zoomOptions')
    expect(windowMenu).toContain("t('commands.view.actualSize')")
    expect(windowMenu).toContain("getAccelerator('window.actualSize')")
    expect(windowUtils).toMatch(/actualSize[\s\S]*'mt::window-zoom', 1\.0/)
    expect(windowActions).toContain('COMMANDS.WINDOW_ACTUAL_SIZE, actualSize')
    expect(macKeybindings).toContain("['window.actualSize', '']")
    expect(macKeybindings).toContain("['paragraph.paragraph', 'Command+0']")
  })

  it('keeps scrollbar visibility in the View menu instead of duplicating it in Settings', () => {
    const general = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/index.vue'
    )
    const viewMenu = readRepoFile('packages/desktop/src/main/menu/templates/view.ts')
    const appMenu = readRepoFile('packages/desktop/src/main/menu/index.ts')

    expect(general).not.toContain('preferences.general.window.hideScrollbars')
    expect(viewMenu).toContain("id: 'showScrollbarsMenuItem'")
    expect(viewMenu).toContain("label: t('menu.view.showScrollbars')")
    expect(viewMenu).toContain("preferences.setItem('hideScrollbar', !hideScrollbar)")
    expect(appMenu).toContain('updateScrollbarMenu(prefs.hideScrollbar)')
  })

  it('uses plain theme group labels without decorative dashes', () => {
    const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'tr', 'zh-CN', 'zh-TW']

    for (const locale of locales) {
      const messages = JSON.parse(
        readRepoFile(`packages/desktop/static/locales/${locale}.json`)
      )

      expect(messages.menu.theme.lightThemes).not.toMatch(/^—|—$/)
      expect(messages.menu.theme.darkThemes).not.toMatch(/^—|—$/)
    }
  })

  it('keeps low-frequency settings behind a shared advanced disclosure', () => {
    const advanced = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/common/advanced/index.vue'
    )
    const general = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/index.vue'
    )
    const editorPreferences = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/editor/index.vue'
    )
    const markdown = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/markdown/index.vue'
    )
    const theme = readRepoFile('packages/desktop/src/renderer/src/prefComponents/theme/index.vue')

    expect(advanced).toContain('<details>')
    expect(advanced).toContain('<summary>')
    for (const page of [general, editorPreferences, markdown, theme]) {
      expect(page).toContain('preferences.advancedSettings')
      expect(page).toContain('<advanced')
    }
    expect(general).toContain('openItemsInNewWindow')
    expect(general).not.toContain("t('preferences.general.window.openFilesInNewWindow')")
    expect(general).not.toContain("t('preferences.general.window.openFoldersInNewWindow')")
  })

  it('removes dead controls and uses the editor font size for code', () => {
    const markdown = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/markdown/index.vue'
    )
    const spellchecker = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/spellchecker/index.vue'
    )
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(markdown).not.toContain("onSelectChange('codeFontSize'")
    expect(markdown).not.toContain('preferHeadingStyle')
    expect(spellchecker).not.toContain('autoDetectLanguage')
    expect(spellchecker).not.toContain('const noop')
    expect(editor).not.toMatch(/^\s*codeFontSize,\s*$/m)
    expect(editor).toContain('codeFontSize: fontSize.value')
    expect(editor).toContain('setOptions({ fontSize: value, codeFontSize: value })')
  })

  it('keeps live editor typography connected to the Muya preference variables', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toMatch(
      /\.editor-component \.mu-container\s*\{[^}]*font-size:\s*var\(--mu-font-size, 15px\);[^}]*line-height:\s*var\(--mu-line-height, 1\.58\);/s
    )
    expect(editor).toMatch(
      /\.editor-component \.mu-container p,\s*\.editor-component \.mu-container li\s*\{[^}]*font-size:\s*inherit;[^}]*line-height:\s*inherit;/s
    )
    expect(editor).toMatch(/\.editor-component \.mu-container h1\s*\{[^}]*font-size:\s*1\.875em;/s)
    expect(editor).toMatch(/\.editor-component \.mu-container h2\s*\{[^}]*font-size:\s*1\.5em;/s)
    expect(editor).toMatch(/\.editor-component \.mu-container h3\s*\{[^}]*font-size:\s*1\.25em;/s)
    expect(editor).toMatch(
      /\.editor-component \.mu-container table th,\s*\.editor-component \.mu-container table td\s*\{[^}]*font-size:\s*inherit;[^}]*line-height:\s*var\(--mu-line-height, 1\.5\);/s
    )
    expect(editor).toMatch(
      /\.annotamd-sticky-table-header \.mu-table-cell\s*\{[^}]*font-size:\s*inherit;[^}]*line-height:\s*var\(--mu-line-height, 1\.5\);/s
    )
  })

  it('keeps the maximum-width setting connected to the live editor canvas', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )
    const theme = readRepoFile('packages/desktop/src/renderer/src/util/theme.ts')

    expect(editor).toMatch(
      /\.editor-component \.mu-container\s*\{[^}]*width:\s*min\(100%, var\(--annotamd-editor-area-width, 980px\)\);/s
    )
    expect(theme).toContain('--annotamd-editor-area-width: ${width}')
  })
})
