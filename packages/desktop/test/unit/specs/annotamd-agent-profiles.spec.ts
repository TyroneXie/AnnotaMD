import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD CLI Agent configurations', () => {
  it('uses the DBX-style configuration cards for local CLI Agents only', () => {
    const source = read('packages/desktop/src/renderer/src/prefComponents/agent/index.vue')

    expect(source).toContain('@click="openConfigDialog"')
    expect(source).toContain('settings.saveConfig(configInput()')
    expect(source).toContain("config.kind === 'cli'")
    expect(source).toContain('config.executablePath')
    expect(source).toContain('config.isDefault')
    expect(source).toContain('settings.testConfig(config.id)')
    expect(source).not.toContain("kind: 'api'")
    expect(source).not.toContain('apiKey')
    expect(source).not.toContain('baseUrl')
    expect(source).not.toContain('<direct-agent-setup')
    expect(source).not.toContain('<cli-agent-profiles')
    expect(source).not.toContain('agentReadiness')
  })

  it('keeps dormant API credentials out of renderer persistence', () => {
    const settings = read('packages/desktop/src/renderer/src/store/aiSettings.ts')
    const page = read('packages/desktop/src/renderer/src/prefComponents/agent/index.vue')

    expect(page).not.toContain('apiKey')
    expect(settings).toContain('apiKey: undefined')
    expect(settings).not.toContain('apiKeyConfigured: config.apiKey')
    expect(settings).not.toContain('JSON.stringify(this.configs')
  })

  it('shows manual Skill and MCP setup without inspecting external Agent apps', () => {
    const page = read('packages/desktop/src/renderer/src/prefComponents/agent/index.vue')
    const guide = read(
      'packages/desktop/src/renderer/src/prefComponents/agent/AgentIntegrationGuide.vue'
    )

    expect(page).toContain('<AgentIntegrationGuide />')
    expect(guide).toContain("invoke('annotamd::mcp-clients::manual-guide')")
    expect(guide).toContain('data-testid="copy-agent-mcp-config"')
    expect(guide).toContain('data-testid="copy-agent-skill-content"')
    expect(guide).toContain("t('preferences.agent.aiWorkspace.commentAgentLink')")
    expect(guide).not.toContain("invoke('annotamd::mcp-clients::inspect')")
    expect(guide).not.toContain("invoke('annotamd::mcp-clients::configure')")
  })
})
