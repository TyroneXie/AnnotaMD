import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'

const environment = vi.hoisted(() => ({ userData: '', appPath: '' }))
vi.mock('electron', () => ({ app: { getPath: () => environment.userData, getAppPath: () => environment.appPath } }))
import { assertFileAccess, canonicalPath, grantFileAccess } from 'main_renderer/security/fileAccess'
import { hasImageHeader } from 'main_renderer/security/imageAccess'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'annotamd-file-access-'))
  directories.push(root)
  environment.userData = path.join(root, 'user-data')
  environment.appPath = path.join(root, 'app')
  const allowed = path.join(root, 'document')
  const outside = path.join(root, 'outside')
  for (const directory of [environment.userData, environment.appPath, allowed, outside]) mkdirSync(directory)
  const sender = { id: directories.length + Math.random(), once: vi.fn() } as unknown as WebContents
  grantFileAccess(sender, allowed)
  return { allowed, outside, sender }
}
describe('filesystem capabilities', () => {
  it('allows document assets and new files while rejecting traversal and unapproved paths', () => {
    const { allowed, outside, sender } = setup()
    expect(assertFileAccess(sender, path.join(allowed, 'assets/new.png'), true)).toContain('assets')
    expect(() => assertFileAccess(sender, path.join(allowed, '../outside/key'))).toThrow('authorized')
    expect(() => assertFileAccess(sender, path.join(outside, 'key'), true)).toThrow('authorized')
    expect(() => canonicalPath('../relative')).toThrow('absolute')
    expect(() => canonicalPath('file:///etc/passwd')).toThrow('absolute')
    expect(() => canonicalPath(`${allowed}\0file`)).toThrow('absolute')
    expect(() => assertFileAccess(sender, path.join(environment.appPath, 'index.js'), true)).toThrow('authorized')
  })

  it.skipIf(process.platform === 'win32')('rejects existing and dangling symlinks that escape the authorized directory', () => {
    const { allowed, outside, sender } = setup()
    symlinkSync(outside, path.join(allowed, 'link'))
    symlinkSync(path.join(outside, 'missing'), path.join(allowed, 'dangling'))
    expect(() => assertFileAccess(sender, path.join(allowed, 'link/new'), true)).toThrow('authorized')
    expect(() => assertFileAccess(sender, path.join(allowed, 'dangling'), true)).toThrow('authorized')
  })

  it('keeps grants isolated by window and releases them when the window closes', () => {
    const { allowed, sender } = setup()
    const other = { id: sender.id + 1 } as WebContents
    expect(() => assertFileAccess(other, path.join(allowed, 'note.md'))).toThrow('authorized')
    const cleanup = vi.mocked(sender.once).mock.calls[0][1] as () => void
    cleanup()
    expect(() => assertFileAccess(sender, path.join(allowed, 'note.md'))).toThrow('authorized')
  })

  it('keeps external image grants read-only and limited to one file', () => {
    const { sender, outside } = setup()
    const image = path.join(outside, 'image.png')
    grantFileAccess(sender, image, false, false)
    expect(assertFileAccess(sender, image)).toBe(canonicalPath(image))
    expect(() => assertFileAccess(sender, image, true)).toThrow('authorized')
    expect(() => assertFileAccess(sender, path.join(outside, 'secret'))).toThrow('authorized')
  })

  it('validates image contents before authorizing an out-of-directory image', async() => {
    const { outside } = setup()
    const fakeImage = path.join(outside, 'credentials.png')
    const svg = path.join(outside, 'drawing.svg')
    writeFileSync(fakeImage, 'private text')
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(await hasImageHeader(fakeImage)).toBe(false)
    expect(await hasImageHeader(svg)).toBe(true)
  })
})
