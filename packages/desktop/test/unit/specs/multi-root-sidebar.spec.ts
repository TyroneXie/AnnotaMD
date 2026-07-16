import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

describe('multi-root sidebar integration', () => {
  it('shows an accessible tooltip for closing all opened files', () => {
    const tree = read('packages/desktop/src/renderer/src/components/sideBar/tree.vue')

    expect(tree).toContain(':content="t(\'sideBar.tree.closeAll\')"')
    expect(tree).toContain(':aria-label="t(\'sideBar.tree.closeAll\')"')
    expect(tree).not.toContain('#icon-save-all')
    expect(tree).toContain('ASK_FOR_SAVE_ALL(true)')
    expect(tree).toMatch(
      /\.opened-files \.title > a\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s
    )
    expect(tree).toMatch(
      /\.opened-files div\.title:hover > a,[^{]*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s
    )
    expect(tree).not.toMatch(/\.opened-files \.title > a\s*\{[^}]*display:\s*none;/s)
  })

  it('renders every project root and exposes add/remove controls', () => {
    const tree = read('packages/desktop/src/renderer/src/components/sideBar/tree.vue')

    expect(tree).toContain('v-for="projectTree of projectTrees"')
    expect(tree).toContain('removeRoot(projectTree.pathname)')
    expect(tree).toContain("t('sideBar.tree.addFolder')")
  })

  it('moves file sorting from preferences into the project sidebar toolbar', () => {
    const tree = read('packages/desktop/src/renderer/src/components/sideBar/tree.vue')
    const preferences = read('packages/desktop/src/renderer/src/prefComponents/general/index.vue')

    expect(tree).toContain('v-if="projectTree === projectTrees[0]"')
    expect(tree).toContain('class="sort-trigger"')
    expect(tree).toContain('class="sort-glyph"')
    expect(tree).toContain('class="sort-glyph-arrow"')
    expect(tree).toContain("SET_SINGLE_PREFERENCE({ type: 'fileSortBy', value })")
    expect(tree).toContain("SET_SINGLE_PREFERENCE({ type: 'fileSortOrder', value })")
    expect(preferences).not.toContain(':value="fileSortBy"')
    expect(preferences).not.toContain(':value="fileSortOrder"')
  })

  it('searches all mounted root directories', () => {
    const search = read('packages/desktop/src/renderer/src/components/sideBar/search.vue')

    expect(search).toContain('const { projectTrees } = storeToRefs(projectStore)')
    expect(search).toContain('projectTrees.value.map((tree) => tree.pathname)')
  })

  it('quick-open searches all mounted roots', () => {
    const quickOpen = read('packages/desktop/src/renderer/src/commands/quickOpen.ts')

    expect(quickOpen).toContain('projectTrees: { pathname: string }[]')
    expect(quickOpen).toContain('const rootPaths = _folderState.projectTrees.map')
    expect(quickOpen).toContain(".search(rootPaths, '', {")
  })
})
