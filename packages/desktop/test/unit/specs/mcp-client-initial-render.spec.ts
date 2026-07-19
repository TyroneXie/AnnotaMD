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

describe('MCP client initial rendering', () => {
  it('renders both supported Agents before asynchronous detection completes', () => {
    expect(source).toContain("const clientIds: ClientId[] = ['codex', 'claude-code']")
    expect(source).toContain('clientIds.map(emptyClientState)')
    expect(source).toContain('v-if="initialInspectionPending"')
    expect(source).toContain('detectingText()')
    expect(source).toContain("te(key) ? t(key) : t('preferences.agent.clientConfiguring')")
  })

  it('uses the cached inspection on mount and forces detection only on manual refresh', () => {
    expect(source).toContain("onMounted(() => refresh())")
    expect(source).toContain('@click="refresh(true)"')
    expect(mainSource).toContain('if (!forceRefresh && cachedInspection) return cachedInspection')
    expect(mainSource).toContain('if (!forceRefresh && inspectionInFlight) return inspectionInFlight')
    expect(ipcSource).not.toMatch(/registerMcpClientHandlers[\s\S]*?void inspectMcpClients\(\)/)
    expect(ipcSource).toContain('export const scheduleMcpClientInspection')
    expect(bootstrapSource).toMatch(
      /webContents\.once\('did-finish-load',[\s\S]*?scheduleMcpClientInspection\(\)/
    )
  })
})
