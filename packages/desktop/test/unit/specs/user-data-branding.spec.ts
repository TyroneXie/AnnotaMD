import {
  getAnnotaMDCommentDatabasePath,
  getAnnotaMDDevUserDataPath,
  resolveAssetPath
} from 'main_renderer/app/userDataBranding'

describe('AnnotaMD user data branding', () => {
  it('uses the AnnotaMD development profile directly', () => {
    expect(getAnnotaMDDevUserDataPath('/Users/test/Library/Application Support'))
      .toBe('/Users/test/Library/Application Support/annotamd-dev')
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

  it('keeps configured asset paths and supplies AnnotaMD defaults', () => {
    const userDataPath = '/Users/test/Library/Application Support/annotamd-dev'
    expect(resolveAssetPath(undefined, userDataPath, 'images'))
      .toBe('/Users/test/Library/Application Support/annotamd-dev/images')
    expect(resolveAssetPath('/custom/images', userDataPath, 'images')).toBe('/custom/images')
  })
})
