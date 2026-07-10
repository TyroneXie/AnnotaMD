import { describe, expect, it } from 'vitest'
import {
  addProjectRoot,
  findProjectRootForPath,
  readBufferedProjectRoots,
  removeProjectRoot
} from '@/store/projectRoots'

describe('multi-root workspace helpers', () => {
  it('appends independent roots and rejects duplicate or nested roots', () => {
    expect(addProjectRoot(['/work/a'], '/work/b')).toEqual({
      roots: ['/work/a', '/work/b'],
      added: true
    })
    expect(addProjectRoot(['/work/a'], '/work/a')).toEqual({
      roots: ['/work/a'],
      added: false
    })
    expect(addProjectRoot(['/work/a'], '/work/a/docs')).toEqual({
      roots: ['/work/a'],
      added: false
    })
    expect(addProjectRoot(['/work/a/docs'], '/work/a')).toEqual({
      roots: ['/work/a/docs'],
      added: false
    })
  })

  it('removes only the requested root', () => {
    expect(removeProjectRoot(['/work/a', '/work/b'], '/work/a')).toEqual(['/work/b'])
  })

  it('routes a path to the most specific mounted root', () => {
    expect(
      findProjectRootForPath(['/work', '/work/a'], '/work/a/docs/file.md')
    ).toBe('/work/a')
    expect(findProjectRootForPath(['/work/a'], '/elsewhere/file.md')).toBeNull()
  })

  it('restores new root arrays and migrates legacy single-root state', () => {
    expect(readBufferedProjectRoots({ rootDirectories: ['/work/a', '/work/b'] })).toEqual([
      '/work/a',
      '/work/b'
    ])
    expect(readBufferedProjectRoots({ rootDirectory: '/legacy' })).toEqual(['/legacy'])
    expect(readBufferedProjectRoots({ projectTree: { pathname: '/older' } })).toEqual(['/older'])
  })
})
