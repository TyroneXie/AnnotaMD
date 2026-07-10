import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const readRepoFile = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD code block controls', () => {
  it('keeps every code-block setting together in Markdown', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/editor/index.vue'
    )
    const markdown = readRepoFile(
      'packages/desktop/src/renderer/src/prefComponents/markdown/index.vue'
    )

    expect(editor).not.toContain("onSelectChange('codeFontSize', value)")
    expect(editor).not.toContain("onSelectChange('codeFontFamily', value)")
    expect(editor).not.toContain("onSelectChange('trimUnnecessaryCodeBlockEmptyLines', value)")
    expect(editor).not.toContain("onSelectChange('codeBlockLineNumbers', value)")
    expect(editor).not.toContain("onSelectChange('wrapCodeBlocks', value)")
    expect(markdown).toContain("onSelectChange('codeFontSize', value)")
    expect(markdown).toContain("onSelectChange('codeFontFamily', value)")
    expect(markdown).toContain("onSelectChange('trimUnnecessaryCodeBlockEmptyLines', value)")
    expect(markdown).toContain("onSelectChange('codeBlockLineNumbers', value)")
    expect(markdown).toContain("onSelectChange('wrapCodeBlocks', value)")
    expect(markdown).toContain("preferences.markdown.codeBlock.title")
  })

  it('shows code line numbers by default in both preference defaults', () => {
    const schema = readRepoFile('packages/desktop/src/main/preferences/schema.json')
    const store = readRepoFile('packages/desktop/src/renderer/src/store/preferences.ts')

    expect(schema).toMatch(/"codeBlockLineNumbers"\s*:\s*\{[^}]*"default"\s*:\s*true/s)
    expect(store).toMatch(/codeBlockLineNumbers:\s*true/)
  })

  it('uses bold hierarchy for preference page and section headings', () => {
    const preferencePage = readRepoFile('packages/desktop/src/renderer/src/pages/preference.vue')

    expect(preferencePage).toMatch(/& h4\s*\{[^}]*font-weight:\s*700;/s)
    expect(preferencePage).toMatch(/& h5,\s*& h6\s*\{[^}]*font-weight:\s*650;/s)
  })

  it('removes the title-bar mode switch but preserves the View menu entry', () => {
    const titleBar = readRepoFile(
      'packages/desktop/src/renderer/src/components/titleBar/index.vue'
    )
    const viewMenu = readRepoFile('packages/desktop/src/main/menu/templates/view.ts')

    expect(titleBar).not.toContain('annotamd-mode-switch')
    expect(titleBar).not.toContain('setSourceMode')
    expect(viewMenu).toContain("id: 'sourceCodeModeMenuItem'")
    expect(viewMenu).toContain("actions.toggleSourceCodeMode")
  })

  it('always bootstraps editor windows in quick-edit mode', () => {
    const editorWindow = readRepoFile('packages/desktop/src/main/windows/editor.ts')

    expect(editorWindow).toContain('appMenu.addEditorMenu(win, { sourceCodeModeEnabled: false })')
    expect(editorWindow.match(/sourceCodeModeEnabled: false/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('bridges Muya wrap toggles into the persisted preference', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toContain("editor.value.on('code-wrap-toggle'")
    expect(editor).toContain("type: 'wrapCodeBlocks'")
  })

  it('does not expose internal fenced or indented code-block type labels', () => {
    const codeBlockStyles = readRepoFile('packages/muya/src/assets/styles/blockSyntax.css')

    expect(codeBlockStyles).not.toContain("content: 'fenced'")
    expect(codeBlockStyles).not.toContain("content: 'indented'")
  })

  it('uses a unified hover-revealed code header without visible fence markers', () => {
    const codeBlockStyles = readRepoFile('packages/muya/src/assets/styles/blockSyntax.css')

    expect(codeBlockStyles).not.toContain('pre.mu-active.mu-fenced-code::before')
    expect(codeBlockStyles).not.toContain('pre.mu-active.mu-fenced-code::after')
    expect(codeBlockStyles).toMatch(/\.mu-code-actions\s*\{[^}]*opacity:\s*0;/s)
    expect(codeBlockStyles).toMatch(
      /\.mu-code-block:hover \.mu-code-actions\s*\{[^}]*opacity:\s*1;/
    )
    expect(codeBlockStyles).toMatch(/span\.mu-language-input\s*\{[^}]*display:\s*none;/s)
    expect(codeBlockStyles).toMatch(
      /input\.mu-code-caption\s*\{[^}]*display:\s*inline-flex;[^}]*background:\s*transparent;/s
    )
    expect(codeBlockStyles).toMatch(
      /input\.mu-code-caption:hover,\s*input\.mu-code-caption:focus\s*\{[^}]*background:\s*transparent;/s
    )
    expect(codeBlockStyles).toMatch(/input\.mu-code-caption::placeholder\s*\{/s)
    expect(codeBlockStyles).not.toContain('.mu-code-wrap .mu-code-wrap-toggle')
    expect(codeBlockStyles).toMatch(/\.mu-line-numbers-rows\s*\{[^}]*top:\s*40px;/s)
  })

  it('never reveals block-level Markdown fence decorations on focus', () => {
    const blockStyles = readRepoFile('packages/muya/src/assets/styles/blockSyntax.css')

    expect(blockStyles).not.toContain("content: '``` mermaid'")
    expect(blockStyles).not.toContain("content: '``` vega-lite'")
    expect(blockStyles).not.toContain("content: '```'")
    expect(blockStyles).not.toContain("content: '$$'")
    expect(blockStyles).not.toContain('content: attr(frontMatterStart)')
    expect(blockStyles).not.toContain('content: attr(frontMatterEnd)')
  })

  it('uses the text cursor over the editable page canvas', () => {
    const editor = readRepoFile(
      'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'
    )

    expect(editor).toMatch(/\.editor-component\s*\{[^}]*cursor:\s*text;/s)
  })
})
