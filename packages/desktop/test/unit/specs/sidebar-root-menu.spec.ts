import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')

describe('workspace root context menu', () => {
  it('offers safe detach instead of filesystem delete/rename actions', () => {
    const source = readFileSync(
      resolve(repoRoot, 'packages/desktop/src/renderer/src/contextMenu/sideBar/index.ts'),
      'utf8'
    )

    const rootMenu = source.slice(source.indexOf('export const showRootContextMenu'))
    expect(rootMenu).toContain("label: t('sideBar.tree.removeFolderFromWorkspace')")
    expect(rootMenu).not.toContain('getDELETE()')
    expect(rootMenu).not.toContain('getRENAME()')
  })
})
