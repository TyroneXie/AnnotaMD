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
})
