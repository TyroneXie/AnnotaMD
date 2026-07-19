import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (file: string): string => readFileSync(resolve(repoRoot, file), 'utf8')

describe('performance regression guards', () => {
  it('lazy-loads editor and preference routes', () => {
    const router = read('packages/desktop/src/renderer/src/router/index.ts')
    const bootstrap = read('packages/desktop/src/renderer/src/bootstrap.ts')
    const editorStore = read('packages/desktop/src/renderer/src/store/editor.ts')
    const editorWindow = read('packages/desktop/src/main/windows/editor.ts')

    expect(router).toContain("const App = () => import('@/pages/app.vue')")
    expect(router).toContain("const Preference = () => import('@/pages/preference.vue')")
    expect(router).toContain("const Agent = () => import('@/prefComponents/agent/index.vue')")
    expect(router).not.toMatch(/^import App from/m)
    expect(router).not.toMatch(/^import Preference from/m)
    expect(bootstrap).toContain("ipcRenderer.on('mt::bootstrap-editor'")
    expect(editorStore).toContain('listenForEditorBootstrap((config) =>')
    expect(editorWindow).toContain("ipcMain.on('mt::window-initialized'")
    expect(editorWindow).toContain('this._doOpenFilesToOpen()')
  })

  it('does not poll the preference locale', () => {
    const config = read(
      'packages/desktop/src/renderer/src/prefComponents/sideBar/config.ts'
    )
    const sidebar = read(
      'packages/desktop/src/renderer/src/prefComponents/sideBar/index.vue'
    )

    expect(config).not.toContain('setInterval(')
    expect(sidebar).toContain('watch(locale, () =>')
  })

  it('removes sidebar listeners when tree components unmount', () => {
    const tree = read('packages/desktop/src/renderer/src/components/sideBar/tree.vue')
    const folder = read('packages/desktop/src/renderer/src/components/sideBar/treeFolder.vue')

    expect(tree).toContain("bus.off('SIDEBAR::show-new-input', handleInputFocus)")
    expect(tree).toContain("document.removeEventListener('click', handleDocumentClick)")
    expect(tree).toContain(
      "document.removeEventListener('contextmenu', handleDocumentContextMenu)"
    )
    expect(tree).toContain("document.removeEventListener('keydown', handleDocumentKeydown)")
    expect(folder).toContain("bus.off('SIDEBAR::show-new-input', handleInputFocus)")
    expect(folder).toContain("bus.off('SIDEBAR::show-rename-input', focusRenameInput)")
    expect(folder).toContain(
      "folderEl.value?.removeEventListener('contextmenu', handleContextMenu)"
    )
  })

  it('reuses the json-change document snapshot for markdown and blocks', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )
    const muya = read('packages/muya/src/muya.ts')

    expect(muya).toContain('getMarkdownFromState(state: TState[])')
    expect(editor).toContain('const markdown = editor.value.getMarkdownFromState(doc)')
    expect(editor).toContain('blocks: doc')
    expect(editor).not.toMatch(
      /editor\.value\.on\('json-change',[\s\S]*?blocks:\s*editor\.value\.getState\(\)/
    )
  })

  it('does not use BigInt hashing in the per-keystroke dirty tracker', () => {
    const history = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/syntheticHistory.ts'
    )

    expect(history).toContain('Math.imul')
    expect(history).not.toContain('BigInt(')
    expect(history).not.toMatch(/\d+n\b/)
  })

  it('does not read every Markdown file while building the directory tree', () => {
    const watcher = read('packages/desktop/src/main/filesystem/watcher.ts')
    const project = read('packages/desktop/src/renderer/src/store/project.ts')

    expect(watcher).toMatch(/if \(type === 'file'\) \{[\s\S]*?loadMarkdownFile\(/)
    expect(project).toContain('editorStore.UPDATE_CURRENT_FILE(getFileStateFromData({')
    expect(project).not.toContain('newFileNameCache')
  })
})
