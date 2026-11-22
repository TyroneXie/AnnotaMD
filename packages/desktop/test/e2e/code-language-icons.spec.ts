import { expect, test } from '@playwright/test'
import { clickMenuById, expectNoRendererErrors, launchWithMarkdown } from './helpers'

test('shows language SVGs in the code picker, including search aliases and expanded languages', async({ browserName: _browserName }, testInfo) => {
  const { app, page } = await launchWithMarkdown(
    '# 领域模型\n\n```typescript\ntype AiDslPanelContext = {\n  visible: boolean\n  mode: \'create\' | \'edit\' | \'mixed\'\n}\n```\n\n面板状态。\n',
    { suppressErrorDialog: true }
  )
  try {
    const code = page.locator('.editor-component pre.mu-code-block').first()
    await code.hover()
    await code.locator('.mu-code-language-toggle').click()
    const picker = page.locator('.mu-list-picker').filter({ has: page.locator('.mu-language-search') })
    await expect(picker).toBeVisible()
    await expect(picker.locator('..')).toHaveCSS('opacity', '1')
    const screenshotPath = testInfo.outputPath('language-picker.png')
    await page.screenshot({ path: screenshotPath })
    await testInfo.attach('language-picker', { path: screenshotPath, contentType: 'image/png' })

    const rows = picker.locator('li.item')
    await expect(rows).toHaveCount(21)
    await expect(picker.locator('li.item .icon-wrapper svg')).toHaveCount(21)
    const shapes = await Promise.all(['javascript', 'typescript', 'python', 'java'].map(name =>
      picker.locator(`[data-label="${name}"] .icon-wrapper svg`).innerHTML()
    ))
    expect(new Set(shapes).size).toBe(4)
    const sizes = await picker.locator('.icon-wrapper svg').evaluateAll(icons => icons.map(icon => {
      const rect = icon.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    expect(sizes.every(size => size.width === 18 && size.height === 18)).toBe(true)

    const search = picker.locator('.mu-language-search')
    for (const [alias, language] of [['js', 'javascript'], ['ts', 'typescript'], ['py', 'python'], ['sh', 'bash'], ['c++', 'cpp']]) {
      await search.fill(alias)
      await expect(picker.locator(`[data-label="${alias}"] [data-language="${language}"] svg`)).toHaveCount(1)
    }
    await search.fill('')
    await picker.locator('[data-label="__more-languages__"]').click()
    await expect(picker.locator('[data-label="haskell"] .icon-wrapper svg')).toHaveCount(1)
    await expect(picker.locator('[data-label="wren"] .mu-action-icon-code svg')).toHaveCount(1)
    await expect(picker.locator('li.item .icon-wrapper svg')).toHaveCount(await rows.count())

    await search.fill('py')
    await picker.locator('[data-label="py"]').click()
    await expect(code.locator('.mu-language-input')).toHaveText('py')
    await expect(picker.locator('..')).toHaveCSS('opacity', '0')

    await clickMenuById(app, 'dracula')
    await expect(page.locator('body')).toHaveClass(/\bdark\b/)
    await code.hover()
    await code.locator('.mu-code-language-toggle').click()
    await expect(picker.locator('..')).toHaveCSS('opacity', '1')
    const colors = await picker.evaluate(element => {
      const style = getComputedStyle(element)
      const input = getComputedStyle(element.querySelector('input')!)
      const label = getComputedStyle(element.querySelector('.language')!)
      return { background: style.backgroundColor, inputBackground: input.backgroundColor, foreground: style.color, label: label.color }
    })
    expect(colors.background).not.toBe('rgb(255, 255, 255)')
    expect(colors.inputBackground).toBe(colors.background)
    expect(colors.foreground).toBe(colors.label)
    await expect(picker.locator('li.item .icon-wrapper svg')).toHaveCount(21)
    const darkScreenshotPath = testInfo.outputPath('language-picker-dark.png')
    await picker.screenshot({ path: darkScreenshotPath })
    await testInfo.attach('language-picker-dark', { path: darkScreenshotPath, contentType: 'image/png' })
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
