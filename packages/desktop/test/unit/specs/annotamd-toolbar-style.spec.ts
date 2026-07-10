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

    expect(css).toMatch(/\.mu-format-picker\s*\{[^}]*height:\s*34px;/s)
    expect(css).toMatch(/\.mu-format-picker li\.item\s*\{[^}]*min-width:\s*28px;/s)
    expect(css).toMatch(/\.mu-format-picker li\.item\s*\{[^}]*height:\s*26px;/s)
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
      /\.mu-format-picker li\.item\.inline_code\s*\{[^}]*width:\s*28px;[^}]*padding:\s*0;/s
    )
    expect(css).toMatch(
      /\.mu-format-picker li\.item\.inline_code \.text-icon\s*\{[^}]*width:\s*20px;[^}]*min-width:\s*20px;/s
    )
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
    expect(css).toMatch(
      /\.mu-format-picker li\.item\.annotamd_comment \.text-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*13px;[^}]*border:\s*1\.5px solid currentcolor;/s
    )
    expect(css).not.toMatch(/\.mu-format-picker li\.item\.annotamd_comment\s*\{[^}]*background:/s)
    expect(toolbar).toContain("this.muya.eventCenter.emit('annotamd-comment-selection'")
  })
})
