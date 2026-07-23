import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD blockquote style', () => {
  it('keeps quote colors neutral instead of inheriting theme accents', () => {
    const blocks = read('packages/muya/src/assets/styles/blockSyntax.css')
    const oneDark = read('packages/desktop/src/renderer/src/assets/themes/one-dark.theme.css')
    const ulysses = read('packages/desktop/src/renderer/src/assets/themes/ulysses.theme.css')

    expect(blocks).toMatch(
      /\.mu-container blockquote\s*\{[^}]*--annotamd-blockquote-text-color:\s*#646a73;[^}]*--annotamd-blockquote-border-color:\s*#bbbfc4;[^}]*--strong-color:\s*var\(--annotamd-blockquote-text-color\);[^}]*--em-color:\s*var\(--annotamd-blockquote-text-color\);/s
    )
    expect(blocks).toMatch(
      /body\.dark \.mu-container blockquote\s*\{[^}]*--annotamd-blockquote-text-color:\s*#8f959e;[^}]*--annotamd-blockquote-border-color:\s*#646a73;/s
    )
    expect(blocks).toMatch(/color:\s*var\(--annotamd-blockquote-text-color\);/)
    expect(blocks).toMatch(/background:\s*var\(--annotamd-blockquote-border-color\);/)
    expect(blocks).toMatch(
      /\.mu-container blockquote p\.mu-paragraph,\s*\.mu-container blockquote li\.mu-list-item\s*\{[^}]*color:\s*var\(--annotamd-blockquote-text-color\);/s
    )
    expect(oneDark).not.toMatch(/blockquote::before/)
    expect(ulysses).not.toMatch(/\.mu-container blockquote/)
  })
})
