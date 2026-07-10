// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = resolve(import.meta.dirname, '../../..')
const repoRoot = resolve(desktopRoot, '../..')
const editorSource = readFileSync(
  resolve(desktopRoot, 'src/renderer/src/components/editorWithTabs/editor.vue'),
  'utf8'
)
const diagramStyles = readFileSync(
  resolve(repoRoot, 'packages/muya/src/assets/styles/blockSyntax.css'),
  'utf8'
)
const diagramSource = readFileSync(
  resolve(repoRoot, 'packages/muya/src/block/extra/diagram/index.ts'),
  'utf8'
)

describe('AnnotaMD diagram controls', () => {
  it('passes the selected diagram background into the fullscreen image viewer', () => {
    expect(editorSource).toMatch(/constructor \(container: HTMLElement, \{ url, background = 'transparent' \}/)
    expect(editorSource).toContain('this.img.style.backgroundColor = background')
    expect(editorSource).toMatch(/preview-image[\s\S]*background[\s\S]*new SimpleImageViewer/)
  })

  it('uses a bordered chart surface with a hover-only toolbar', () => {
    expect(diagramStyles).toMatch(/figure\.mu-diagram-block[\s\S]*border: 1px solid/)
    expect(diagramStyles).toMatch(/\.mu-diagram-toolbar[\s\S]*opacity: 0/)
    expect(diagramStyles).toMatch(/figure\.mu-diagram-block:hover > \.mu-diagram-toolbar[\s\S]*opacity: 1/)
  })

  it('clips the diagram surface to a sealed rounded border', () => {
    expect(editorSource).toMatch(
      /figure\.mu-diagram-block\s*\{[^}]*border:\s*1px solid #dee0e3;[^}]*border-radius:\s*8px;[^}]*overflow:\s*hidden !important;/s
    )
  })

  it('renders diagram hints in a body-level tooltip above clipped chart surfaces', () => {
    expect(diagramSource).toContain("tooltip.className = 'mu-diagram-tooltip'")
    expect(diagramSource).toContain('document.body.appendChild(tooltip)')
    expect(diagramSource).toContain('window.innerWidth')
    expect(diagramStyles).toMatch(
      /\.mu-diagram-tooltip\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*2147483000;/s
    )
    expect(diagramStyles).not.toContain('.mu-diagram-toolbar [data-tooltip]::after')
  })

  it('defines all three explicit diagram view layouts', () => {
    expect(diagramSource).toContain("'mu-diagram-view-chart'")
    expect(diagramStyles).toContain('.mu-diagram-block.mu-diagram-view-code')
    expect(diagramStyles).toContain('.mu-diagram-block.mu-diagram-view-both')
  })
})
