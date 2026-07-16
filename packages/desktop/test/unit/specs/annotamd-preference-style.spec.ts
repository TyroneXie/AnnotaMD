import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const readRepoFile = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD preference styling', () => {
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
    const controls = [
      'bool',
      'range',
      'select',
      'textBox',
      'fontTextBox'
    ].map((name) =>
      readRepoFile(`packages/desktop/src/renderer/src/prefComponents/common/${name}/index.vue`)
    )

    for (const css of controls) {
      expect(css).toMatch(/margin:\s*8px 0;/)
      expect(css).toMatch(/font-size:\s*13px;/)
    }
  })

  it('does not render a redundant Startup heading above its two labeled option groups', () => {
    const general = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/index.vue'
    )

    expect(general).not.toContain("preferences.general.startup.title")
    expect(general).toContain("preferences.general.startup.layoutOptions")
    expect(general).toContain("preferences.general.startup.startupFilesFolders")
  })

  it('keeps live editor typography connected to the Muya preference variables', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toMatch(
      /\.editor-component \.mu-container\s*\{[^}]*font-size:\s*var\(--mu-font-size, 16px\);[^}]*line-height:\s*var\(--mu-line-height, 1\.58\);/s
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
