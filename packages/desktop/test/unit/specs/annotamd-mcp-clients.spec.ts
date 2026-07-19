import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/workspace/AnnotaMD/packages/desktop',
    getPath: () => '/Users/test/Library/Application Support/annotamd-dev'
  }
}))

import {
  createCliConfigureArgs,
  createCustomAgentManualConfig,
  createStandardMcpManualConfig,
  hasNamedMcpServer,
  type McpLaunchSpec
} from '../../../src/main/mcpClients'

const launch: McpLaunchSpec = {
  command: '/Applications/AnnotaMD.app/Contents/MacOS/AnnotaMD',
  args: ['/Applications/AnnotaMD.app/Contents/Resources/annotamd-mcp/index.mjs'],
  env: {
    ELECTRON_RUN_AS_NODE: '1',
    ANNOTAMD_CLIENT_NAME: 'codex',
    ANNOTAMD_BRIDGE_FILE: '/tmp/agent-bridge.json'
  }
}

describe('AnnotaMD MCP client setup', () => {
  it('builds Codex CLI arguments with the private-comment adapter environment', () => {
    expect(createCliConfigureArgs('codex', launch)).toEqual([
      'mcp', 'add', 'annotamd',
      '--env', 'ELECTRON_RUN_AS_NODE=1',
      '--env', 'ANNOTAMD_CLIENT_NAME=codex',
      '--env', 'ANNOTAMD_BRIDGE_FILE=/tmp/agent-bridge.json',
      '--', launch.command, ...launch.args
    ])
  })

  it('places the Claude server name before its variadic environment options', () => {
    expect(createCliConfigureArgs('claude-code', launch)).toEqual([
      'mcp', 'add', 'annotamd', '--scope', 'user',
      '-e', 'ELECTRON_RUN_AS_NODE=1',
      '-e', 'ANNOTAMD_CLIENT_NAME=codex',
      '-e', 'ANNOTAMD_BRIDGE_FILE=/tmp/agent-bridge.json',
      '--', launch.command, ...launch.args
    ])
  })

  it('creates a standard copyable MCP configuration for manual clients', () => {
    const config = JSON.parse(createStandardMcpManualConfig(launch))
    expect(config.mcpServers.annotamd).toEqual({
      command: launch.command,
      args: launch.args,
      env: launch.env
    })
  })

  it('creates a generic manual configuration without requiring an Agent name', () => {
    const result = createCustomAgentManualConfig()
    const config = JSON.parse(result.manualConfig)
    expect(config.mcpServers.annotamd.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(config.mcpServers.annotamd.env.ANNOTAMD_BRIDGE_FILE).toContain('agent-bridge.json')
    expect(config.mcpServers.annotamd.env).not.toHaveProperty('ANNOTAMD_CLIENT_NAME')
  })

  it('does not treat a missing named server error as configured', () => {
    expect(hasNamedMcpServer('No MCP server named "annotamd".')).toBe(false)
    expect(hasNamedMcpServer('{"name":"annotamd","enabled":true}')).toBe(true)
  })
})
