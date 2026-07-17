import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

describe('appearance preferences', () => {
  it('groups visual, language, icon and code settings on the appearance page', () => {
    const appearance = read('packages/desktop/src/renderer/src/prefComponents/theme/index.vue')
    const general = read('packages/desktop/src/renderer/src/prefComponents/general/index.vue')
    const editor = read('packages/desktop/src/renderer/src/prefComponents/editor/index.vue')
    const markdown = read('packages/desktop/src/renderer/src/prefComponents/markdown/index.vue')

    expect(appearance).toContain("onSelectChange('language', value)")
    expect(appearance).toContain("onSelectChange('fontSize', value)")
    expect(appearance).toContain("onSelectChange('iconTheme', value)")
    expect(appearance).toContain("onSelectChange('codeBlockLineNumbers', value)")
    expect(general).not.toContain("onSelectChange('language', value)")
    expect(editor).not.toContain("onSelectChange('fontSize', value)")
    expect(editor).not.toContain("onSelectChange('iconTheme', value)")
    expect(markdown).not.toContain("onSelectChange('codeBlockLineNumbers', value)")
  })

  it('replaces the theme card wall with a hover-only dropdown preview', () => {
    const appearance = read('packages/desktop/src/renderer/src/prefComponents/theme/index.vue')
    const themeSelect = read(
      'packages/desktop/src/renderer/src/prefComponents/theme/themeSelect.vue'
    )

    expect(appearance).not.toContain('v-for="themeItem of themes"')
    expect(appearance).toContain('v-if="hoveredTheme"')
    expect(appearance).toContain('class="offcial-themes theme-hover-preview"')
    expect(themeSelect).toContain('@mouseenter="showPreview(item.value, $event)"')
    expect(themeSelect).toContain('@mouseleave="hidePreview"')
  })

  it('uses one manual theme selector and keeps custom CSS outside advanced settings', () => {
    const appearance = read('packages/desktop/src/renderer/src/prefComponents/theme/index.vue')

    expect(appearance).toContain(':disable="followSystemTheme"')
    expect(appearance).toContain("onSelectChange('theme', value)")
    expect(appearance).not.toContain("onSelectChange('lightModeTheme', value)")
    expect(appearance).not.toContain("onSelectChange('darkModeTheme', value)")
    expect(appearance).not.toContain('<advanced')
    expect(appearance).toContain('class="custom-css-input"')
  })

  it('uses a numeric stepper with a visible default for editor width', () => {
    const appearance = read('packages/desktop/src/renderer/src/prefComponents/theme/index.vue')

    expect(appearance).toContain(':value="editorWidthValue"')
    expect(appearance).toContain(':min="600"')
    expect(appearance).toContain(':max="1600"')
    expect(appearance).toContain(':step="20"')
    expect(appearance).toContain('const DEFAULT_EDITOR_WIDTH = 980')
    expect(appearance).not.toContain('maxWidthNotes')
  })

  it('uses a pointer cursor across the font family picker', () => {
    const fontPicker = read(
      'packages/desktop/src/renderer/src/prefComponents/common/fontTextBox/index.vue'
    )

    expect(fontPicker).toContain('& .font-autocomplete .el-input__wrapper')
    expect(fontPicker).toContain('& input.el-input__inner')
    expect(fontPicker).toMatch(/\.font-autocomplete[\s\S]*cursor: pointer;/)
  })

  it('merges editor, Markdown and spelling into one Edit category', () => {
    const sidebar = read('packages/desktop/src/renderer/src/prefComponents/sideBar/config.ts')
    const routes = read('packages/desktop/src/renderer/src/router/index.ts')
    const editing = read('packages/desktop/src/renderer/src/prefComponents/editing/index.vue')
    const editor = read('packages/desktop/src/renderer/src/prefComponents/editor/index.vue')
    const markdown = read('packages/desktop/src/renderer/src/prefComponents/markdown/index.vue')
    const spelling = read('packages/desktop/src/renderer/src/prefComponents/spellchecker/index.vue')

    expect(sidebar).toContain("path: '/preference/editor'")
    expect(sidebar).not.toContain("path: '/preference/markdown'")
    expect(sidebar).not.toContain("path: '/preference/spelling'")
    expect(routes).toContain("redirect: '/preference/editor'")
    expect(editing).toContain('<editor-settings />')
    expect(editing).toContain('<markdown-settings />')
    expect(editing).toContain('<spellchecker-settings />')
    expect(editing).toContain('.pref-markdown > h4')
    expect(editing).toContain('.pref-spellchecker > h4')
    expect(editing).toContain('display: none')
    expect(editor).not.toContain("t('preferences.editor.misc.title')")
    expect(markdown).not.toContain("t('preferences.markdown.compatibility.title')")
    expect(spelling).toContain("t('preferences.categories.spelling')")
  })
})
