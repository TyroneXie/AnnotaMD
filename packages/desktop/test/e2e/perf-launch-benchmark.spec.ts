import { test } from '@playwright/test'
import { performance } from 'node:perf_hooks'
import { launchWithMarkdown } from './helpers'

test('manual production launch benchmark', async() => {
  test.skip(process.env.ANNOTAMD_RUN_PERF_BENCH !== '1')
  test.setTimeout(120000)
  const samples: number[] = []
  for (let index = 0; index < 10; index++) {
    const started = performance.now()
    const { app, page } = await launchWithMarkdown('# Startup benchmark\n')
    await page.locator('.editor-component').waitFor({ state: 'attached' })
    samples.push(performance.now() - started)
    await app.close()
  }
  samples.sort((a, b) => a - b)
  const p50 = samples[Math.floor(samples.length * 0.5)]
  const p95 = samples[Math.floor(samples.length * 0.95)]
  process.stdout.write(`launch samples=${samples.map((value) => value.toFixed(1)).join(',')} p50=${p50.toFixed(1)} p95=${p95.toFixed(1)}\n`)
})
