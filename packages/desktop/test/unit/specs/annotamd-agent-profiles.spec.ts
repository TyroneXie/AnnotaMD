import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD agent settings', () => {
  it('manages providers and their models instead of local CLI Agents', () => {
    const source = read('packages/desktop/src/renderer/src/prefComponents/agent/index.vue')

    expect(source).toContain("annotamd::pi::provider:save")
    expect(source).toContain("annotamd::pi::provider:delete")
    expect(source).toContain("annotamd::pi::provider:models")
    expect(source).toContain("annotamd::pi::models:update")
    expect(source).toContain('preferences.agent.provider.interfaceType')
    expect(source).toContain('preferences.agent.provider.baseUrl')
    expect(source).toContain('preferences.agent.provider.modelsUrl')
    expect(source).toContain('preferences.agent.provider.requestFormat')
    expect(source).toContain('preferences.agent.provider.authStyle')
    expect(source).toContain('preferences.agent.provider.addProvider')
    expect(source).toContain('preferences.agent.provider.addModel')
    expect(source).toContain('<AiProviderLogo')
    expect(source).not.toContain('detect-cli')
    expect(source).not.toContain('executablePath')
  })

  it('no longer ships the multi-CLI host or its detection layer', () => {
    expect(existsSync(resolve(repoRoot, 'packages/desktop/src/main/ai/CliAgentHost.ts'))).toBe(false)
    expect(existsSync(resolve(repoRoot, 'packages/desktop/src/main/ai/CliExecutableDetector.ts'))).toBe(false)
    expect(existsSync(resolve(repoRoot, 'packages/desktop/src/renderer/src/prefComponents/agent/AgentIntegrationGuide.vue'))).toBe(false)

    const service = read('packages/desktop/src/main/ai/AiWorkspaceService.ts')
    expect(service).not.toContain('cliHost')
    expect(service).not.toContain('detectCliExecutable')
  })
})
