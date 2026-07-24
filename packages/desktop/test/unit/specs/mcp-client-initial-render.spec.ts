import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const source = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/renderer/src/prefComponents/agent/McpClientSetup.vue'),
  'utf8'
)
const mainSource = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/main/mcpClients/index.ts'),
  'utf8'
)
const ipcSource = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/main/ipc/mcpClients.ts'),
  'utf8'
)
const bootstrapSource = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/main/index.ts'),
  'utf8'
)
const bridgeSource = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/main/comments/AgentBridgeServer.ts'),
  'utf8'
)
const mcpServerSource = readFileSync(
  resolve(repoRoot, 'tools/annotamd-mcp/src/index.ts'),
  'utf8'
)

describe('MCP client initial rendering', () => {
  it('keeps supported Agents available while only rendering configured or added Agents', () => {
    expect(source).toContain("const clientIds: ClientId[] = ['codex', 'claude-code']")
    expect(source).toContain('clientIds.map(emptyClientState)')
    expect(source).toContain('v-for="client in visibleInspectedClients"')
    expect(source).toContain('v-if="showAddClientCard"')
    expect(source).toContain('v-for="clientId in availableClientIds"')
    expect(source).toContain('@change="confirmClientSelection"')
    expect(source).toContain("t('preferences.agent.clientCancel')")
    expect(source).toContain("t('preferences.agent.clientAdd')")
    expect(source).toContain('v-else-if="initialInspectionPending"')
    expect(source).toContain('detectingText()')
    expect(source).toContain("te(key) ? t(key) : t('preferences.agent.clientConfiguring')")
  })

  it('uses cached installation inspection without exposing a misleading refresh action', () => {
    expect(source).toContain('void refresh()')
    expect(source).not.toContain('@click="refresh(true)"')
    expect(source).not.toContain('clientRefresh')
    expect(mainSource).toContain('if (!forceRefresh && cachedInspection) return cachedInspection')
    expect(mainSource).toContain('if (!forceRefresh && inspectionInFlight) return inspectionInFlight')
    expect(ipcSource).not.toMatch(/registerMcpClientHandlers[\s\S]*?void inspectMcpClients\(\)/)
    expect(ipcSource).toContain('export const scheduleMcpClientInspection')
    expect(bootstrapSource).toMatch(
      /webContents\.once\('did-finish-load',[\s\S]*?scheduleMcpClientInspection\(\)/
    )
  })

  it('subscribes to real MCP heartbeat status and renders arbitrary connected Agents', () => {
    expect(source).toContain("invoke('annotamd::comments::mcp-status')")
    expect(source).toContain("'annotamd::comments::mcp-status-changed'")
    expect(source).toContain('v-for="client in otherClients"')
    expect(source).toContain("if (normalized.includes('workbuddy')) return 'WorkBuddy'")
    expect(source).toContain("if (normalized.includes('qoderwork') || normalized === 'qoder') return 'QoderWork'")
  })

  it('uses MCP handshake identity and retains disconnected clients for connection history', () => {
    expect(mcpServerSource).toContain('server.server.getClientVersion()')
    expect(mcpServerSource).toContain('server.server.oninitialized')
    expect(bridgeSource).toContain('connected: true')
    expect(bridgeSource).toContain('client.connected = false')
    expect(bridgeSource).not.toContain('clients.delete(name)')
  })

  it('keeps Skill installation out of the MCP connection state', () => {
    expect(source).not.toContain("t('preferences.agent.clientSkillMissing')")
    expect(source).toContain("if (client.mcpConfigured) return t('preferences.agent.clientConfiguredWaiting')")
    expect(source).toContain("t('preferences.agent.skillRecommendation')")
    expect(source).toContain(':class="{ configured: connectedClient(client.id) != null }"')
    expect(source).toContain(':class="{ configured: client.connected }"')
  })

  it('installs the portable comment skill when copying setup for other Agents', () => {
    expect(source).toContain("invoke('annotamd::mcp-clients::install-portable-skill')")
    expect(source).toContain("t('preferences.agent.customClientStepSkill')")
    expect(source).toContain('v-if="connectedClient(client.id) && client.mcpConfigured"')
  })

  it('shows actionable manual steps when automatic MCP or skill setup fails', () => {
    expect(source).toContain('configureErrors')
    expect(source).toContain('mcp-client-error-toggle')
    expect(source).toContain('expandedErrorClientId === client.id')
    expect(source).toContain("t('preferences.agent.clientManualFallback'")
    expect(source).toContain('customConfigError')
    expect(source).toContain("t('preferences.agent.customClientManualFallback')")
    expect(source).toContain('customDetailsExpanded.value = true')
  })
})
