import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const source = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8')

describe('AnnotaMD Agent document MCP boundary', () => {
  it('keeps comment access independent from the internal document gateway', () => {
    const bridge = source('packages/desktop/src/main/comments/AgentBridgeServer.ts')

    expect(bridge).toContain('let documentGateway: AnnotaMDAgentDocumentGateway | null = null')
    expect(bridge).toMatch(/case 'list_comments':[\s\S]*if \(!enabled\)/)
    expect(bridge).toMatch(/case 'reply_comment':[\s\S]*if \(!enabled\)/)
    expect(bridge).toContain('if (documentGateway)')
    expect(bridge).toContain('startAgentBridgeTransport()')
  })

  it('routes all four document methods through the scoped gateway', () => {
    const bridge = source('packages/desktop/src/main/comments/AgentBridgeServer.ts')

    for (const method of [
      'agent_get_context',
      'agent_read_document',
      'agent_edit_document',
      'agent_replace_document'
    ]) {
      expect(bridge).toContain(`case '${method}'`)
    }
    expect(bridge.match(/stringParam\(params, 'scopeToken'\)/g)).toHaveLength(4)
  })

  it('does not expose shell or general file mutation methods', () => {
    const mcp = source('tools/annotamd-mcp/src/index.ts')

    expect(mcp).toContain("if (agentScopeToken) {")
    expect(mcp).toContain("registerTool('annotamd_edit_document'")
    expect(mcp).toContain("registerTool('annotamd_replace_document'")
    expect(mcp).not.toMatch(/registerTool\('(?:write_file|shell|execute_command)'/)
  })
})
