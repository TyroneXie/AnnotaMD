import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const sourceCodePath = resolve(
  here,
  '../../../src/renderer/src/components/editorWithTabs/sourceCode.vue'
)

describe('sourceCode block tools', () => {
  it('hides body-level Muya block controls for the source view lifetime', () => {
    const source = readFileSync(sourceCodePath, 'utf8')

    expect(source).toContain("document.body.classList.add('annotamd-source-code-mode')")
    expect(source).toContain("document.body.classList.remove('annotamd-source-code-mode')")
    expect(source).toMatch(
      /body\.annotamd-source-code-mode \.mu-front-button-wrapper,[\s\S]*body\.annotamd-source-code-mode \.mu-float-wrapper[\s\S]*display:\s*none\s*!important/
    )
  })
})
