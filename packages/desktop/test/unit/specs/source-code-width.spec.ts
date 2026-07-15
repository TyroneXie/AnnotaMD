import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const componentDir = resolve(here, '../../../src/renderer/src/components/editorWithTabs')

describe('sourceCode width', () => {
  it('uses the same editor-area width as WYSIWYG mode', () => {
    const sourceCode = readFileSync(resolve(componentDir, 'sourceCode.vue'), 'utf8')
    const wysiwyg = readFileSync(resolve(componentDir, 'editor.vue'), 'utf8')
    const sharedWidth = 'width: min(100%, var(--annotamd-editor-area-width, 980px));'

    expect(sourceCode).toContain(sharedWidth)
    expect(wysiwyg).toContain(sharedWidth)
    expect(sourceCode).not.toContain('max-width: var(--editorAreaWidth)')
  })
})
