import { expect, test } from '@playwright/test'
import { launchWithMarkdown } from './helpers'

const longTableDocument = Array.from({ length: 24 }, (_, tableIndex) => {
  const rows = Array.from(
    { length: 18 },
    (_, rowIndex) => `| ${tableIndex}-${rowIndex} | value ${rowIndex} |`
  ).join('\n')
  return `## Table ${tableIndex}\n\n| Key | Value |\n| --- | --- |\n${rows}`
}).join('\n\n')

test('sticky table scrolling does not remeasure every table and header cell', async() => {
  const { app, page } = await launchWithMarkdown(longTableDocument)
  try {
    await expect(page.locator('figure.mu-table')).toHaveCount(24)
    const measurements = await page.evaluate(async() => {
      const root = document.querySelector<HTMLElement>('.editor-component')
      const figures = root?.querySelectorAll<HTMLElement>('figure.mu-table')
      const target = figures?.[12]
      if (!root || !target) throw new Error('long table fixture did not render')

      root.scrollTop = target.offsetTop + 80
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      const original = Element.prototype.getBoundingClientRect
      let count = 0
      Element.prototype.getBoundingClientRect = function(): DOMRect {
        if (
          this.matches(
            '.editor-component, figure.mu-table, table.mu-table-inner, table.mu-table-inner tr, table.mu-table-inner td'
          )
        ) {
          count++
        }
        return original.call(this)
      }

      try {
        for (let index = 0; index < 12; index++) {
          root.scrollTop += 3
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }
        return count
      } finally {
        Element.prototype.getBoundingClientRect = original
      }
    })

    expect(measurements).toBeLessThanOrEqual(60)
    process.stdout.write(`sticky-header layout reads=${measurements} for 12 scroll frames\n`)
    await expect(page.locator('.annotamd-sticky-table-header')).toBeVisible()
  } finally {
    await app.close()
  }
})
