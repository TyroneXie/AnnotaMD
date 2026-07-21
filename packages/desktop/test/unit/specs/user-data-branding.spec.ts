import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getAnnotaMDCommentDatabasePath,
  getAnnotaMDDevUserDataPath,
  migrateLegacyAssetPath
} from 'main_renderer/app/userDataBranding'

describe('AnnotaMD user data branding', () => {
  it('moves the legacy development profile to the AnnotaMD directory', () => {
    const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'annotamd-branding-'))
    const legacyPath = path.join(appDataPath, 'marktext-dev')
    fs.mkdirSync(legacyPath)
    fs.writeFileSync(path.join(legacyPath, 'preferences.json'), '{}')

    const result = getAnnotaMDDevUserDataPath(appDataPath)

    expect(result).toBe(path.join(appDataPath, 'annotamd-dev'))
    expect(fs.existsSync(path.join(result, 'preferences.json'))).toBe(true)
    expect(fs.existsSync(legacyPath)).toBe(false)
    fs.rmSync(appDataPath, { recursive: true, force: true })
  })

  it('shares only the production comment database with the manual development app', () => {
    expect(getAnnotaMDCommentDatabasePath({
      appDataPath: '/Users/test/Library/Application Support',
      userDataPath: '/Users/test/Library/Application Support/annotamd-dev',
      isDevelopment: true
    })).toBe('/Users/test/Library/Application Support/AnnotaMD/annotamd.sqlite')
  })

  it('keeps automated tests on their isolated comment database', () => {
    expect(getAnnotaMDCommentDatabasePath({
      appDataPath: '/Users/test/Library/Application Support',
      userDataPath: '/tmp/annotamd-e2e',
      isDevelopment: true,
      isAutomatedTest: true
    })).toBe('/tmp/annotamd-e2e/annotamd.sqlite')
  })

  it('keeps the installed app on its configured user data directory', () => {
    expect(getAnnotaMDCommentDatabasePath({
      appDataPath: '/Users/test/Library/Application Support',
      userDataPath: '/Users/test/Library/Application Support/AnnotaMD',
      isDevelopment: false
    })).toBe('/Users/test/Library/Application Support/AnnotaMD/annotamd.sqlite')
  })

  it('rewrites only the old default asset paths', () => {
    const userDataPath = '/Users/test/Library/Application Support/annotamd-dev'
    expect(
      migrateLegacyAssetPath(
        '/Users/test/Library/Application Support/marktext-dev/images',
        userDataPath,
        'images'
      )
    ).toBe('/Users/test/Library/Application Support/annotamd-dev/images')
    expect(migrateLegacyAssetPath('/custom/images', userDataPath, 'images')).toBe('/custom/images')
  })
})
