import { expect, test } from '@playwright/test'
import { expectNoRendererErrors, launchWithMarkdown } from './helpers'

test('keeps the preceding table header while another table is folded and unfolded', async() => {
  const rows = Array.from({ length: 30 }, (_, index) => `| Row ${index + 1} | Table content |\n`).join('')
  const { app, page } = await launchWithMarkdown(
    '# Previous section\n\n| Category | Strategy |\n| --- | --- |\n' + rows +
      '\n# Current section\n\n## Fold this table\n\n' +
      '| Hidden name | Hidden value |\n| --- | --- |\n| Example | Content |\n\n' +
      '## Next section\n\nNext content.\n',
    { suppressErrorDialog: true }
  )
  try {
    const editor = page.locator('.editor-component')
    const heading = editor.locator('h2').filter({ hasText: 'Fold this table' })
    await heading.evaluate((element) => {
      const root = element.closest<HTMLElement>('.editor-component')!
      const viewport = root.getBoundingClientRect()
      root.scrollTop += element.getBoundingClientRect().top - viewport.top - viewport.height * 0.56
    })
    const sticky = page.locator('.annotamd-sticky-table-header')
    await expect(sticky).toBeVisible()
    await expect(sticky).toContainText('Category')
    const foldedTable = editor.locator('figure.mu-table').nth(1)

    for (let index = 0; index < 2; index++) {
      await heading.hover()
      await heading.locator('.mu-section-collapse-indicator').click()
      await expect(foldedTable).toBeHidden()
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      await expect(sticky).toBeVisible()
      await expect(sticky).toContainText('Category')
      await expect(sticky).not.toContainText('Hidden name')
      await heading.hover()
      await heading.locator('.mu-section-collapse-indicator').click()
      await expect(foldedTable).toBeVisible()
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      await expect(sticky).toBeVisible()
      await expect(sticky).toContainText('Category')
    }
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
