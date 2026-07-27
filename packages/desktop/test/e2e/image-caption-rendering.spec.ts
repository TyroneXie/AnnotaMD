import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  enterSourceMode,
  exitSourceMode,
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const SVG = `  <svg viewBox="0 0 960 560" xmlns="http://www.w3.org/2000/svg">
  <rect width="960" height="560" fill="#faf7f2"/>
  <text x="480" y="280" text-anchor="middle">Trace and Turn</text>
</svg>
`

test.describe('Relative SVG followed by a formatted caption', () => {
  let app: ElectronApplication
  let page: Page
  let docDir: string

  test.beforeAll(async() => {
    docDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotamd-e2e-svg-caption-'))
    const assetsDir = path.join(docDir, 'assets')
    fs.mkdirSync(assetsDir)
    fs.writeFileSync(path.join(assetsDir, 'trace.svg'), SVG)
    const docPath = path.join(docDir, 'note.md')
    fs.writeFileSync(
      docPath,
      '![Trace and Turn](assets/trace.svg)\n\n**配图说明**：Trace 外壳内嵌 Turn。\n'
    )

    const launched = await launchElectron([docPath])
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await app.close()
    fs.rmSync(docDir, { recursive: true, force: true })
  })

  test('renders a viewBox-only relative SVG with a visible size', async() => {
    const image = page.locator('.editor-component .mu-image-success img').first()
    await image.waitFor({ state: 'visible', timeout: 10000 })

    const box = await image.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })

  test('keeps strong delimiters invisible after a source-mode selection handoff', async() => {
    await enterSourceMode(page, app)
    await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & {
          CodeMirror?: {
            setSelection: (
              anchor: { line: number; ch: number },
              focus: { line: number; ch: number }
            ) => void
          }
        })
        | null
      cm?.CodeMirror?.setSelection({ line: 2, ch: 0 }, { line: 2, ch: 1 })
    })
    await exitSourceMode(page, app)

    const caption = page.locator('.editor-component .mu-paragraph-content').filter({
      hasText: '配图说明'
    })
    await expect(caption).toBeVisible()
    await expect(caption.locator('strong')).toHaveText('配图说明')

    const markerRects = await caption.locator('.mu-remove').evaluateAll((markers) =>
      markers.map((marker) => {
        const rect = marker.getBoundingClientRect()
        return {
          width: rect.width,
          height: rect.height
        }
      })
    )
    expect(markerRects).toHaveLength(2)
    for (const marker of markerRects) {
      expect(marker.width).toBe(0)
      expect(marker.height).toBe(0)
    }
  })
})
