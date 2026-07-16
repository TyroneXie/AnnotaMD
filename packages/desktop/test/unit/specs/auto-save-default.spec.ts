import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (path: string) => readFileSync(resolve(process.cwd(), '../..', path), 'utf8')

describe('Typora-style automatic saving', () => {
  it('is enabled by default in every preference source', () => {
    const store = readRepoFile('packages/desktop/src/renderer/src/store/preferences.ts')
    const defaults = JSON.parse(
      readRepoFile('packages/desktop/static/preference.json')
    ) as { autoSave: boolean; autoSaveDelay: number }
    const schema = JSON.parse(
      readRepoFile('packages/desktop/src/main/preferences/schema.json')
    ) as { autoSave: { default: boolean }; autoSaveDelay: { default: number } }

    expect(store).toMatch(/autoSave:\s*true/)
    expect(store).toMatch(/autoSaveDelay:\s*1000/)
    expect(defaults.autoSave).toBe(true)
    expect(defaults.autoSaveDelay).toBe(1000)
    expect(schema.autoSave.default).toBe(true)
    expect(schema.autoSaveDelay.default).toBe(1000)
  })

  it('uses a fixed one-second delay without exposing a tuning control', () => {
    const editorStore = readRepoFile('packages/desktop/src/renderer/src/store/editor.ts')
    const generalPreferences = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/general/index.vue'
    )

    expect(editorStore).toContain('const AUTO_SAVE_DELAY = 1000')
    expect(editorStore).toContain('}, AUTO_SAVE_DELAY)')
    expect(generalPreferences).not.toContain('autoSaveDelay')
  })

  it('routes WYSIWYG and source edits through the shared save pipeline', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )
    const source = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/sourceCode.vue'
    )

    expect(editor).toContain("editor.value.on('json-change'")
    expect(editor).toContain('editorStore.LISTEN_FOR_CONTENT_CHANGE({')
    expect(source).toContain("editor.value.on('cursorActivity'")
    expect(source).toContain('editorStore.LISTEN_FOR_CONTENT_CHANGE({')
  })
})
