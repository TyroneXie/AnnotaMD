import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')

describe('AnnotaMD checked task styling', () => {
  it('strikes only the text paragraphs of checked task items', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/assets/styles/blockSyntax.css'),
      'utf8'
    )

    expect(css).toMatch(
      /li\.mu-task-list-item > input\.mu-checkbox-checked ~ \.mu-paragraph,[\s\S]*li\.mu-task-list-item > span\.mu-checkbox-checked ~ \.mu-paragraph\s*\{[^}]*text-decoration-line:\s*line-through;/
    )
  })
})
