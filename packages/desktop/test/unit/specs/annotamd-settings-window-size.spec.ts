import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')

describe('AnnotaMD settings window defaults', () => {
  it('opens with a compact default size while retaining resize safety limits', () => {
    const config = readFileSync(resolve(repoRoot, 'packages/desktop/src/main/config.ts'), 'utf8')
    const preferences = config.match(
      /export const preferencesWinOptions:[\s\S]*?Object\.freeze\(\{([\s\S]*?)webPreferences:/
    )?.[1]

    expect(preferences).toMatch(/minWidth:\s*450/)
    expect(preferences).toMatch(/minHeight:\s*350/)
    expect(preferences).toMatch(/width:\s*820/)
    expect(preferences).toMatch(/height:\s*580/)
  })
})
