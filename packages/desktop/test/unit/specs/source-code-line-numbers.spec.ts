import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const sourceCodePath = resolve(
  here,
  '../../../src/renderer/src/components/editorWithTabs/sourceCode.vue'
)

describe('sourceCode line numbers', () => {
  it('uses CodeMirror line numbers without a sparse formatter', () => {
    const source = readFileSync(sourceCodePath, 'utf8')

    expect(source).toMatch(/lineNumbers:\s*true/)
    expect(source).not.toContain('lineNumberFormatter')
  })
})
