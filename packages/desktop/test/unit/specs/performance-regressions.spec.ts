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

  it('registers only the Element Plus components used by renderer templates', () => {
    const main = read('packages/desktop/src/renderer/src/main.ts')

    expect(main).not.toContain("import ElementPlus from 'element-plus'")
    expect(main).not.toContain("import 'element-plus/dist/index.css'")
    expect(main).toContain('const elementPlusComponents = [')
    expect(main).toContain('elementPlusComponents.forEach((component) => app.use(component))')
    expect(main).toContain("import 'element-plus/es/components/button/style/css'")
  })

  it('keeps comments and the MCP bridge off the default main-process startup path', () => {
    const main = read('packages/desktop/src/main/index.ts')
    const commentIpc = read('packages/desktop/src/main/ipc/comments.ts')

    expect(main).not.toMatch(/^import .*['"]\.\/comments(?:\/AgentBridgeServer)?['"]/m)
    expect(main).toContain("agentBridgeModule ??= import('./comments/AgentBridgeServer')")
    expect(main).toContain('if (!nextEnabled && !agentBridgeModule) return')
    expect(commentIpc).not.toMatch(/^import .*['"]\.\.\/comments/m)
    expect(commentIpc).toContain("await import('../comments')")
    expect(commentIpc).toContain("await import('../comments/AgentBridgeServer')")
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

  it('moves display-only derived state and history cloning off the keystroke path', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )
    const jsonChange = editor.match(
      /editor\.value\.on\('json-change',[\s\S]*?scheduleDerivedDocumentState\(id, markdown\)/
    )?.[0]

    expect(jsonChange).toBeTruthy()
    expect(jsonChange).not.toContain('muyaWordCount(markdown)')
    expect(jsonChange).not.toContain('editor.value.getTOC()')
    expect(jsonChange).not.toContain('editor.value.getHistory()')
    expect(editor).toContain('setTimeout(flushDerivedDocumentState, DERIVED_STATE_DELAY)')
    expect(editor).toContain('captureActiveEngineHistory()')
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
    expect(watcher).toContain("win.webContents.send('mt::update-object-tree-batch', updates)")
    expect(project).toContain("ipcRenderer.on('mt::update-object-tree-batch'")
    expect(project).toContain('addFiles(')
    expect(project).toContain('editorStore.UPDATE_CURRENT_FILE(getFileStateFromData({')
    expect(project).not.toContain('newFileNameCache')
  })

  it('reuses one comment range layout for highlights, anchors and text validation', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toContain(
      'commentRangeLayout = buildAnnotaMDCommentRangeLayout(root, currentFileComments.value)'
    )
    expect(editor).toContain("bus.emit('annotamd-comment-anchors', commentRangeLayout.anchorRects)")
    expect(editor).toContain('const readCommentText = createAnnotaMDCommentTextReader(root)')
  })
})
