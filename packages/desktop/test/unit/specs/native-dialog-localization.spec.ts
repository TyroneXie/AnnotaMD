import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const builderConfig = readFileSync(resolve(__dirname, '../../../electron-builder.yml'), 'utf8')

describe('native macOS dialog localization', () => {
  it('keeps the macOS localizations supported by AnnotaMD', () => {
    const macConfig = builderConfig.match(/^mac:\n([\s\S]*?)(?=^dmg:)/m)?.[1]

    expect(macConfig).toBeTruthy()
    for (const locale of [
      'de',
      'en',
      'es',
      'fr',
      'ja',
      'ko',
      'pt_BR',
      'pt_PT',
      'tr',
      'zh_CN',
      'zh_TW'
    ]) {
      expect(macConfig).toContain(`    - ${locale}`)
    }
  })
})
