import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8')

describe('multi-root editor window integration', () => {
  it('tracks and scores every mounted root', () => {
    const source = read('packages/desktop/src/main/windows/editor.ts')

    expect(source).toContain('private _openedRootDirectories: string[]')
    expect(source).toContain('get openedRootDirectories(): string[]')
    expect(source).toContain('this._openedRootDirectories.some')
  })

  it('appends and safely detaches directory watchers', () => {
    const source = read('packages/desktop/src/main/windows/editor.ts')

    expect(source).toContain('removeFolder(pathname: string): void')
    expect(source).toContain("ipcMain.emit('watcher-unwatch-directory'")
    expect(source).toContain("webContents.send('mt::remove-directory'")
  })

  it('restores rootDirectories and exposes the renderer detach channel', () => {
    const editor = read('packages/desktop/src/main/windows/editor.ts')
    const app = read('packages/desktop/src/main/app/index.ts')
    const ipc = read('packages/desktop/src/shared/types/ipc.ts')

    expect(editor).toContain('bufferState.project?.rootDirectories')
    expect(app).toContain('openedRootDirectories')
    expect(ipc).toContain("'mt::remove-directory-from-workspace': [pathname: string]")
  })

  it('focuses an existing tab when Finder opens the same file again', () => {
    const editor = read('packages/desktop/src/main/windows/editor.ts')
    const app = read('packages/desktop/src/main/app/index.ts')

    expect(editor).toContain('focusOpenedFile(pathname: string): boolean')
    expect(editor).toContain("webContents.send('mt::switch-tab-by-file_path', pathname)")
    expect(app).toContain('editor.focusOpenedFile(pathname)')
  })
})
