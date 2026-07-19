import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const readRepoFile = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD Agent defaults', () => {
  it('allows Agents to access document comments by default everywhere', () => {
    const schema = JSON.parse(
      readRepoFile('packages/desktop/src/main/preferences/schema.json')
    ) as { commentMcpEnabled: { default: boolean } }
    const defaults = JSON.parse(
      readRepoFile('packages/desktop/static/preference.json')
    ) as { commentMcpEnabled: boolean }
    const store = readRepoFile('packages/desktop/src/renderer/src/store/preferences.ts')

    expect(schema.commentMcpEnabled.default).toBe(true)
    expect(defaults.commentMcpEnabled).toBe(true)
    expect(store).toMatch(/commentMcpEnabled:\s*true/)
  })
})
