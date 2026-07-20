import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')

describe('AnnotaMD block menu typography', () => {
  it('keeps the block menu compact while preserving a seven-column type grid', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontMenu/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-front-menu\s*\{[^}]*width:\s*222px;/s)
    expect(css).toMatch(/\.mu-front-menu > ul\s*\{[^}]*padding:\s*6px;/s)
    expect(css).toMatch(/\.mu-front-menu > ul li\.item\s*\{[^}]*height:\s*32px;[^}]*padding:\s*0 8px;/s)
    expect(css).toMatch(/li\.turn-into-menu\s*\{[^}]*grid-template-columns:\s*repeat\(7, 28px\);[^}]*gap:\s*2px;/s)
    expect(css).toMatch(/\.turn-into-item\s*\{[^}]*height:\s*28px;[^}]*width:\s*28px;/s)
    expect(css).toMatch(/\.turn-into-item:focus-visible\s*\{[^}]*outline:\s*2px solid #3370ff;/s)
  })

  it('keeps the floating block menu labels compact and readable', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontMenu/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-front-menu\s*\{[^}]*font-size:\s*13px;/s)
    expect(css).toMatch(/\.short-cut\s*\{[^}]*font-size:\s*11px;/s)
    expect(css).toMatch(/li\.item \.text\s*\{[^}]*flex:\s*0 1 auto;/s)
    expect(css).toMatch(/li > \.short-cut\s*\{[^}]*margin-left:\s*auto;[^}]*padding-left:\s*10px;/s)
    expect(css).toMatch(/li\.item \.text\s*\{[^}]*white-space:\s*nowrap;/s)
    expect(css).toMatch(/li\.item \.text\s*\{[^}]*text-overflow:\s*ellipsis;/s)
  })

  it('keeps heading labels compact beside the six-dot grip', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontButton/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-block-label\s*\{[^}]*font-size:\s*12px;/s)
    expect(css).toMatch(/\.mu-block-label\s*\{[^}]*padding:\s*0;/s)
    expect(css).toMatch(/\.mu-block-label-glyph\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s)
    expect(css).toMatch(/\.mu-list-icon\s*\{[^}]*height:\s*16px;/s)
    expect(css).toMatch(/\.mu-diagram-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s)
    expect(css).toMatch(/\.mu-block-grip\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*16px;[^}]*height:\s*22px;/s)
    expect(css).toMatch(/\.mu-block-label\.heading \.mu-block-label-glyph\s*\{[^}]*font-size:\s*11px;/s)
  })

  it('keeps graphical table labels visually aligned with 12px text labels', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontButton/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-table-icon\s*\{[^}]*grid-template-columns:\s*repeat\(3, 3px\);/s)
    expect(css).toMatch(/\.mu-table-icon\s+i\s*\{[^}]*width:\s*3px;[^}]*height:\s*3px;/s)
  })

  it('uses smaller ordered-list markers without shrinking the block control', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontButton/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-front-button\s*\{[^}]*min-width:\s*48px;[^}]*height:\s*24px;/s)
    expect(css).toMatch(/\.mu-list-icon-marker\s*\{[^}]*font-size:\s*6px;/s)
  })

  it('uses a flat shadow-free block control for crisp text and diagrams', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontButton/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-icon-wrapper\s*\{[^}]*height:\s*24px;/s)
    expect(css).toMatch(/\.mu-icon-wrapper:focus-visible\s*\{[^}]*outline:\s*2px solid #3370ff;/s)
    expect(css).toMatch(/\.mu-block-label\s*\{[^}]*height:\s*22px;/s)
    expect(css).toMatch(/\.mu-block-grip\s*\{[^}]*height:\s*22px;/s)
    expect(css).not.toContain('backdrop-filter: blur')
    expect(css).not.toMatch(/\.mu-icon-wrapper[^}]*box-shadow:/s)
    expect(css).not.toMatch(/\.mu-block-label\.diagram \.node[^}]*box-shadow:/s)
  })

  it('uses the shared themed icon renderer for diagram block labels', () => {
    const source = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontButton/index.ts'),
      'utf8'
    )

    expect(source).toContain("import { renderActionIcon } from '../actionIcons'")
    expect(source).toContain("renderActionIcon(kind === 'image' ? 'inline-image' : getIcon(block))")
    expect(source).not.toContain("h('i.node.root')")
  })

  it('uses one visual canvas for shared block-type SVG icons', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/paragraphFrontButton/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-block-label-glyph \.mu-action-icon,\s*\.mu-block-label-glyph \.mu-action-icon svg\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s)
    expect(css).toMatch(/\.mu-block-label\.quote \.mu-block-label-glyph\s*\{[^}]*color:\s*#3370ff;/s)
  })
})
