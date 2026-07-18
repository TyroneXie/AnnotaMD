import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const css = readFileSync(
  resolve(repoRoot, 'packages/muya/src/assets/styles/blockSyntax.css'),
  'utf8'
)
const diagramSource = readFileSync(
  resolve(repoRoot, 'packages/muya/src/block/extra/diagram/index.ts'),
  'utf8'
)

describe('AnnotaMD diagram toolbar styling', () => {
  it('uses a compact Feishu-style toolbar instead of large segmented buttons', () => {
    expect(css).toMatch(
      /\.mu-diagram-toolbar\s*\{[^}]*box-sizing:\s*border-box;[^}]*height:\s*28px;[^}]*border-radius:\s*6px;[^}]*box-shadow:\s*0 2px 6px rgb\(31 35 41 \/ 6%\);/s
    )
    expect(css).toMatch(
      /\.mu-diagram-toolbar button\s*\{[^}]*height:\s*26px;[^}]*padding:\s*0 6px;[^}]*font-size:\s*12px;[^}]*line-height:\s*26px;/s
    )
    expect(css).toMatch(
      /\.mu-diagram-fullscreen,\s*\.mu-diagram-color-toggle,\s*\.mu-diagram-copy,\s*\.mu-diagram-download\s*\{[^}]*width:\s*28px;[^}]*padding:\s*0;/s
    )
    expect(css).toMatch(/\.mu-diagram-control-svg\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s)
    expect(css).toMatch(
      /\.mu-diagram-tooltip\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*2147483000;[^}]*background:\s*#1f2329;/s
    )
    expect(css).not.toMatch(/\.mu-diagram-toolbar \[data-tooltip\]::after/)
    expect(css).not.toMatch(/\.mu-diagram-toolbar > button,[^{]+\{[^}]*border-left:/s)
  })

  it('only adds tooltips to icon-only controls', () => {
    expect(diagramSource).toContain("createButton('mu-diagram-view-toggle', '', [")
    expect(diagramSource).not.toContain("viewToggle.dataset.tooltip = i18n.t('Diagram View')")
    expect(diagramSource).toContain("fullscreen.dataset.tooltip = i18n.t('Fullscreen')")
    expect(diagramSource).toContain("colorToggle.dataset.tooltip = i18n.t('Diagram Background')")
  })
})
