import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(
  path.resolve(__dirname, '../../../src/renderer/src/components/sideBar/search.vue'),
  'utf8'
)

describe('sidebar search controls', () => {
  it('provides a visible tooltip and accessible name for every search option', () => {
    expect(source.match(/:data-tooltip="t\('search\.[^']+'\)"/g)).toHaveLength(3)
    expect(source.match(/:aria-label="t\('search\.[^']+'\)"/g)).toHaveLength(3)
    expect(source).toContain('content: attr(data-tooltip)')
  })

  it('does not duplicate the open-folder action in search', () => {
    expect(source).not.toContain("t('sideBar.search.openFolder')")
    expect(source).not.toContain('const openFolder =')
  })
})
