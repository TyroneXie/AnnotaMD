import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD document density', () => {
  it('adds a small gap between sibling list items and aligns ordered markers to the text column', () => {
    const css = read('packages/muya/src/assets/styles/blockSyntax.css')

    expect(css).toMatch(
      /ol\.mu-order-list,\s*ul\.mu-bullet-list\s*\{[^}]*padding-inline-start:\s*22px;/s
    )
    expect(css).toMatch(
      /ol\.mu-order-list > li \+ li,\s*ul\.mu-bullet-list > li \+ li,\s*ul\.mu-task-list > li \+ li\s*\{[^}]*margin-top:\s*4px;/s
    )
  })

  it('uses the code-block surface color for the first table row', () => {
    const css = read('packages/muya/src/assets/styles/blockSyntax.css')

    expect(css).toMatch(
      /\.mu-table-inner tr:first-of-type td\s*\{[^}]*background:\s*var\(--code-block-bg-color\);/s
    )
  })

  it('does not upscale narrow rendered diagrams beyond their intrinsic width', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toMatch(
      /figure\.mu-diagram-block \.mu-diagram-preview > svg,[^{]+\{[^}]*max-width:\s*100%;[^}]*height:\s*auto !important;[^}]*margin:\s*0 auto;/s
    )
    expect(editor).not.toMatch(
      /figure\.mu-diagram-block \.mu-diagram-preview > svg,[^{]+\{[^}]*width:\s*100% !important;/s
    )
  })

  it('makes only overflowing tables horizontally scrollable in narrow editor layouts', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toMatch(
      /\.editor-component \.mu-container figure\.mu-table\s*\{[^}]*overflow-x:\s*auto !important;[^}]*overflow-y:\s*hidden !important;/s
    )
    expect(editor).toMatch(
      /figure\.mu-table::\-webkit-scrollbar\s*\{[^}]*height:\s*8px;/s
    )
  })

  it('mounts a synchronized sticky header above a table while its first row is scrolled away', () => {
    const editor = read(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toContain("import { AnnotaMDStickyTableHeader } from '@/util/annotamdStickyTableHeader'")
    expect(editor).toContain('stickyTableHeader = new AnnotaMDStickyTableHeader(container)')
    expect(editor).toContain('stickyTableHeader?.destroy()')
    expect(editor).toMatch(
      /\.annotamd-sticky-table-header\s*\{[^}]*position:\s*fixed;[^}]*overflow:\s*hidden;[^}]*pointer-events:\s*none;/s
    )
    expect(editor).toMatch(
      /\.annotamd-sticky-table-header \.mu-table-cell-content\s*\{[^}]*min-width:\s*0;/s
    )
  })

  it('keeps sidebar outline and file labels at 12px', () => {
    const toc = read('packages/desktop/src/renderer/src/components/sideBar/toc.vue')
    const file = read('packages/desktop/src/renderer/src/components/sideBar/treeFile.vue')
    const folder = read('packages/desktop/src/renderer/src/components/sideBar/treeFolder.vue')
    const opened = read('packages/desktop/src/renderer/src/components/sideBar/treeOpenedTab.vue')

    expect(toc).toMatch(/\.side-bar-toc \.el-tree\s*\{[^}]*font-size:\s*12px;/s)
    expect(toc).toMatch(/\.side-bar-toc \.el-tree-node\s*\{[^}]*margin-top:\s*0;/s)
    expect(toc).toMatch(/\.side-bar-toc \.el-tree-node__content\s*\{[^}]*height:\s*24px;/s)
    expect(toc).toMatch(
      /\.side-bar-toc-wordwrap \.el-tree-node__content\s*\{[^}]*min-height:\s*24px;/s
    )
    expect(file).toMatch(/\.side-bar-file\s*\{[^}]*font-size:\s*12px;/s)
    expect(folder).toMatch(/\.folder-name\s*\{[^}]*font-size:\s*12px;/s)
    expect(opened).toMatch(/\.opened-file\s*\{[^}]*font-size:\s*12px;/s)
  })
})
