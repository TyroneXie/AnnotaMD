import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const sourceCodePath = resolve(
  here,
  '../../../src/renderer/src/components/editorWithTabs/sourceCode.vue'
)

describe('sourceCode scrolling', () => {
  it('uses the outer source view without CodeMirror internal scrollbars', () => {
    const source = readFileSync(sourceCodePath, 'utf8')

    expect(source).toMatch(/scrollbarStyle:\s*'null'/)
    expect(source).toMatch(/\.source-code\s*\{[^}]*overflow:\s*auto/s)
  })
})
