import { expect, test } from '@playwright/test'
import { mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchElectron } from './helpers'

test('native directory watcher tracks create, rename and delete', async() => {
  const workspace = mkdtempSync(join(tmpdir(), 'annotamd-native-watcher-'))
  const created = join(workspace, 'created.md')
  const renamed = join(workspace, 'renamed.md')
  const fileByTitle = (title: string) => `[class~="side-bar-file"][title="${title}"]`
  let app: Awaited<ReturnType<typeof launchElectron>>['app'] | null = null

  try {
    ;({ app } = await launchElectron([workspace]))
    const page = await app.firstWindow()
    await expect(page.locator(`.project-tree [title="${workspace}"]`)).toBeAttached()

    writeFileSync(created, '# native create\n', 'utf8')
    await expect(page.locator(fileByTitle(created))).toBeAttached({ timeout: 5000 })

    renameSync(created, renamed)
    await expect(page.locator(fileByTitle(created))).toHaveCount(0, { timeout: 5000 })
    await expect(page.locator(fileByTitle(renamed))).toBeAttached({ timeout: 5000 })

    unlinkSync(renamed)
    await expect(page.locator(fileByTitle(renamed))).toHaveCount(0, { timeout: 5000 })
  } finally {
    if (app) await app.close()
    rmSync(workspace, { recursive: true, force: true })
  }
})
