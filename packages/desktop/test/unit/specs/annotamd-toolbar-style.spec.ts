import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')

describe('AnnotaMD compact inline toolbar', () => {
  it('uses the approved compact dimensions', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.css'),
      'utf8'
    )

    expect(css).toMatch(/\.mu-format-picker\s*\{[^}]*height:\s*40px;/s)
    expect(css).toMatch(/\.mu-format-picker li\.item\s*\{[^}]*min-width:\s*32px;/s)
    expect(css).toMatch(/\.mu-format-picker li\.item\s*\{[^}]*height:\s*32px;/s)
  })

  it('defines a visible color palette and swatches', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.css'),
      'utf8'
    )

    expect(css).toContain('.mu-color-palette')
    expect(css).toContain('.mu-color-swatch')
  })

  it('uses a compact paragraph dropdown and a uniform inline-code button', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.css'),
      'utf8'
    )
    const toolbar = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.ts'),
      'utf8'
    )

    expect(toolbar).toContain('TEXT_STYLE_OPTIONS')
    expect(toolbar).toContain('data-paragraph-type')
    expect(toolbar).toContain('this.muya.updateParagraph(type)')
    expect(css).toContain('.mu-text-style-menu')
    expect(css).toMatch(
      /\.mu-format-picker li\.item\.inline_code\s*\{[^}]*width:\s*32px;[^}]*padding:\s*0;/s
    )
    expect(css).toMatch(
      /\.mu-format-picker li\.item \.icon-wrapper\s*\{[^}]*width:\s*18px;[^}]*min-width:\s*18px;[^}]*height:\s*18px;/s
    )
    expect(toolbar).toContain('renderActionIcon(formatActionIcon(icon.type)!')
  })

  it('uses immediate Feishu-style tooltips instead of native title bubbles', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.css'),
      'utf8'
    )
    const toolbar = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.ts'),
      'utf8'
    )

    expect(toolbar).toContain("'data-tooltip': tooltip")
    expect(toolbar).toContain("'aria-label': i18n.t(icon.tooltip)")
    expect(toolbar).not.toContain("title: `${i18n.t(icon.tooltip)}\\n${icon.shortcut}`")
    expect(css).toMatch(
      /\.mu-format-picker li\.item\[data-tooltip\]::after\s*\{[^}]*content:\s*attr\(data-tooltip\);[^}]*background:\s*#1f2329;/s
    )
    expect(css).toMatch(
      /\.mu-format-picker li\.item\[data-tooltip\]:hover::after\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*1;/s
    )
  })

  it('renders a separated, neutral comment-bubble action wired to selection comments', () => {
    const css = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.css'),
      'utf8'
    )
    const config = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/config.ts'),
      'utf8'
    )
    const toolbar = readFileSync(
      resolve(repoRoot, 'packages/muya/src/ui/inlineFormatToolbar/index.ts'),
      'utf8'
    )

    expect(config).toMatch(
      /type:\s*'annotamd_comment',[^}]*tooltip:\s*'Comment',[^}]*label:\s*'',[^}]*groupBreakBefore:\s*true/s
    )
    expect(config).not.toContain("type: 'mark'")
    expect(toolbar).toContain("renderActionIcon('comment')")
    expect(toolbar).toContain("import '../actionIcons.css'")
    expect(css).not.toMatch(/\.mu-format-picker li\.item\.annotamd_comment\s*\{[^}]*background:/s)
    expect(toolbar).toContain("this.muya.eventCenter.emit('annotamd-comment-selection'")
  })
})
