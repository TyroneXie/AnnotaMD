import { readSource as readFileSync } from '../readSource'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('sidebar width', () => {
  it('shares one width across every right-column panel', () => {
    const layout = read('packages/desktop/src/renderer/src/store/layout.ts')
    const sideBar = read('packages/desktop/src/renderer/src/components/sideBar/index.vue')

    // Agent used to keep a separate width, so switching icons resized the sidebar.
    expect(layout).not.toContain('agentSideBarWidth')
    // The Agent panel needs the shared minimum, so a narrow drag cannot break it.
    expect(layout).toContain('export const SIDEBAR_MIN_WIDTH = 320')
    expect(layout).not.toContain('agent-side-bar-width')
    expect(sideBar).not.toContain('agentSideBarWidth')
    expect(sideBar).toMatch(
      /finalSideBarWidth = computed<number>\(\(\) => \{[^}]*return sideBarViewWidth\.value < SIDEBAR_MIN_WIDTH \? SIDEBAR_MIN_WIDTH : sideBarViewWidth\.value/s
    )
    expect(sideBar).toMatch(
      /if \(rightColumn\.value === name\)[\s\S]*?layoutStore\.CHANGE_SIDE_BAR_WIDTH\(widthToPersist\)/
    )
  })
})
