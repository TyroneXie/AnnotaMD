import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD user-visible branding', () => {
  it('does not expose the MarkText name in any desktop locale value', () => {
    const localeDir = resolve(repoRoot, 'packages/desktop/static/locales')
    const localeFiles = readdirSync(localeDir).filter((name) => name.endsWith('.json'))

    for (const localeFile of localeFiles) {
      const locale = JSON.parse(readFileSync(resolve(localeDir, localeFile), 'utf8'))
      expect(JSON.stringify(locale), localeFile).not.toContain('MarkText')
    }
  })

  it('uses AnnotaMD in visible window, About, and package metadata', () => {
    const renderer = read('packages/desktop/src/renderer/index.html')
    const about = read('packages/desktop/src/renderer/src/components/about/index.vue')
    const builder = read('packages/desktop/electron-builder.yml')
    const packageJson = JSON.parse(read('packages/desktop/package.json'))

    expect(renderer).toContain('<title>AnnotaMD</title>')
    expect(renderer).not.toContain('<title>MarkText</title>')
    expect(about).toContain("const name = 'AnnotaMD'")
    expect(builder).toMatch(/^productName:\s*AnnotaMD$/m)
    expect(builder).toContain("artifactName: 'annotamd-mac-${arch}-${version}.${ext}'")
    expect(packageJson.description).toBe('AnnotaMD')
  })
})
