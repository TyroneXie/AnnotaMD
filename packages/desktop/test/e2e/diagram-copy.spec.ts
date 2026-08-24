import { expect, test } from '@playwright/test'
import { launchWithMarkdown } from './helpers'

const SOURCE = 'flowchart LR\n  A["source"] --> B["target"]'

test('diagram copy button copies source code in every view', async() => {
  const { app, page } = await launchWithMarkdown(`\`\`\`mermaid\n${SOURCE}\n\`\`\`\n`)
  try {
    const figure = page.locator('figure.mu-diagram-block')
    const copy = figure.locator('.mu-diagram-copy')
    await expect(figure).toBeVisible()

    for (const view of ['chart', 'code', 'both']) {
      await figure.hover()
      await figure.locator('.mu-diagram-view-toggle').click()
      await figure.locator(`[data-diagram-view="${view}"]`).click()
      await app.evaluate(({ clipboard }) => clipboard.clear())

      await figure.hover()
      await copy.click()

      await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toBe(SOURCE)
    }
  } finally {
    await app.close()
  }
})
