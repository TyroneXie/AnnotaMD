import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const search = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/renderer/src/components/search/index.vue'),
  'utf8'
)

describe('AnnotaMD search control tooltips', () => {
  it('labels every icon-only search action with the immediate tooltip style', () => {
    expect(search).toContain(`:data-tooltip="t('search.caseSensitive')"`)
    expect(search).toContain(`:data-tooltip="t('search.wholeWord')"`)
    expect(search).toContain(`:data-tooltip="t('search.useRegex')"`)
    expect(search).toContain(`:data-tooltip="t('menu.edit.findPrevious')"`)
    expect(search).toContain(`:data-tooltip="t('menu.edit.findNext')"`)
    expect(search).not.toContain(`:title="t('search.caseSensitive')"`)
    expect(search).toMatch(
      /\.search-bar \[data-tooltip\]::after\s*\{[^}]*content:\s*attr\(data-tooltip\);[^}]*background:\s*#1f2329;/s
    )
    expect(search).toMatch(
      /\.search-bar \[data-tooltip\]:hover::after\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*1;/s
    )
  })
})
