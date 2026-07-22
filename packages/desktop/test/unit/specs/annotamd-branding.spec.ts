import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')
const forbiddenBrand = String.fromCharCode(77, 97, 114, 107, 84, 101, 120, 116)

describe('AnnotaMD user-visible branding', () => {
  it('does not expose the legacy brand in any desktop locale value', () => {
    const localeDir = resolve(repoRoot, 'packages/desktop/static/locales')
    const localeFiles = readdirSync(localeDir).filter((name) => name.endsWith('.json'))

    for (const localeFile of localeFiles) {
      const locale = JSON.parse(readFileSync(resolve(localeDir, localeFile), 'utf8'))
      expect(JSON.stringify(locale), localeFile).not.toContain(forbiddenBrand)
    }
  })

  it('uses AnnotaMD in visible window, About, and package metadata', () => {
    const renderer = read('packages/desktop/src/renderer/index.html')
    const about = read('packages/desktop/src/renderer/src/components/about/index.vue')
    const builder = read('packages/desktop/electron-builder.yml')
    const packageJson = JSON.parse(read('packages/desktop/package.json'))

    expect(renderer).toContain('<title>AnnotaMD</title>')
    expect(renderer).not.toContain(`<title>${forbiddenBrand}</title>`)
    expect(about).toContain("const name = 'AnnotaMD'")
    expect(builder).toMatch(/^productName:\s*AnnotaMD$/m)
    expect(builder).toContain("artifactName: 'annotamd-mac-${arch}-${version}.${ext}'")
    expect(packageJson.name).toBe('annotamd')
    expect(packageJson.description).toBe('AnnotaMD')
  })

  it('sets the Electron application name before resolving the user data directory', () => {
    const main = read('packages/desktop/src/main/index.ts')
    const setNameIndex = main.indexOf("app.setName('AnnotaMD')")
    const setupEnvironmentIndex = main.indexOf('setupEnvironment(')

    expect(setNameIndex).toBeGreaterThan(-1)
    expect(setNameIndex).toBeLessThan(setupEnvironmentIndex)
  })

  it('uses the AnnotaMD profile and database names for new installations', () => {
    const cli = read('packages/desktop/src/main/cli/index.ts')
    const comments = read('packages/desktop/src/main/comments/index.ts')
    const userDataBranding = read('packages/desktop/src/main/app/userDataBranding.ts')

    expect(cli).toContain("path.join(getPath('appData'), 'AnnotaMD')")
    expect(comments).toContain('getAnnotaMDCommentDatabasePath')
    expect(userDataBranding).toContain("path.join(directory, 'annotamd.sqlite')")
    expect(comments).not.toContain("'annotations.sqlite'")
  })

  it('only exposes AnnotaMD repository links in product entry points', () => {
    const config = read('packages/desktop/src/main/config.ts')
    const helpMenu = read('packages/desktop/src/main/menu/templates/help.ts')
    const commands = read('packages/desktop/src/renderer/src/commands/index.ts')
    const exportSettings = read(
      'packages/desktop/src/renderer/src/components/exportSettings/index.vue'
    )
    const imageSettings = read(
      'packages/desktop/src/renderer/src/prefComponents/image/components/folderSetting/index.vue'
    )
    const keybindingSettings = read(
      'packages/desktop/src/renderer/src/prefComponents/keybindings/index.vue'
    )
    const themePreview = read(
      'packages/desktop/src/renderer/src/prefComponents/theme/theme.md'
    )
    const productEntryPoints = [
      config,
      helpMenu,
      commands,
      exportSettings,
      imageSettings,
      keybindingSettings,
      themePreview
    ].join('\n')

    expect(config).toContain(
      "export const GITHUB_REPO_URL = 'https://github.com/TyroneXie/AnnotaMD'"
    )
    expect(helpMenu).toContain('https://github.com/TyroneXie/AnnotaMD/releases')
    expect(helpMenu).toContain('https://github.com/TyroneXie/AnnotaMD/issues')
    expect(helpMenu).toContain('https://github.com/TyroneXie/AnnotaMD/blob/main/LICENSE')
    expect(productEntryPoints.toLowerCase()).not.toContain(forbiddenBrand.toLowerCase())
  })

  it('separates the product license from required third-party notices', () => {
    const productLicense = read('LICENSE')
    const upstreamNotices = read('THIRD-PARTY-NOTICES.txt')
    const dependencyLicenses = read('packages/desktop/build/THIRD-PARTY-LICENSES.txt')
    const builder = read('packages/desktop/electron-builder.yml')

    expect(productLicense).toContain('Copyright (c) 2026-present AnnotaMD Contributors')
    expect(productLicense).not.toContain(forbiddenBrand)
    expect(upstreamNotices).toContain(forbiddenBrand)
    expect(upstreamNotices).toContain(
      'The above copyright notice and this permission notice shall be included in all'
    )
    expect(dependencyLicenses).not.toMatch(/^undefined$/m)
    expect(builder).toContain('to: legal/AnnotaMD-LICENSE.txt')
    expect(builder).toContain('to: legal/THIRD-PARTY-NOTICES.txt')
    expect(builder).toContain('to: legal/DEPENDENCY-LICENSES.txt')
  })
})
