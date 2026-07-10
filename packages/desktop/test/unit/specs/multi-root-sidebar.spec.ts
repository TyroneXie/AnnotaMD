import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

describe('multi-root sidebar integration', () => {
  it('renders every project root and exposes add/remove controls', () => {
    const tree = read('packages/desktop/src/renderer/src/components/sideBar/tree.vue')

    expect(tree).toContain('v-for="projectTree of projectTrees"')
    expect(tree).toContain('removeRoot(projectTree.pathname)')
    expect(tree).toContain("t('sideBar.tree.addFolder')")
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
