import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ANNOTAMD_AGENT_PROFILE_PRESETS,
  classifyAgentReadiness,
  defaultAgentProfile,
  parseAgentCommand,
  type AnnotaMDAgentProfile
} from '../../../src/shared/types/agentProfiles'

const profiles: AnnotaMDAgentProfile[] = [
  { id: 'codex-profile', name: 'Codex', kind: 'codex', command: 'codex exec --json' },
  {
    id: 'claude-profile',
    name: 'Claude',
    kind: 'claude-code',
    command: '/usr/local/bin/claude -p --output-format json'
  }
]

describe('AnnotaMD CLI Agent profiles', () => {
  it('ships explicit presets without inspecting the computer', () => {
    expect(ANNOTAMD_AGENT_PROFILE_PRESETS.map((preset) => preset.kind)).toEqual([
      'codex',
      'claude-code',
      'codebuddy-code',
      'custom'
    ])
    expect(ANNOTAMD_AGENT_PROFILE_PRESETS.find((preset) => preset.kind === 'codex')?.command)
      .toBe('codex exec --json')
    expect(ANNOTAMD_AGENT_PROFILE_PRESETS.find((preset) => preset.kind === 'claude-code')?.command)
      .toBe('claude -p --output-format stream-json --verbose --permission-mode auto')
  })

  it('uses one Agent selected in settings', () => {
    expect(defaultAgentProfile(profiles, 'claude-profile')?.id).toBe('claude-profile')
    expect(defaultAgentProfile(profiles, 'codex-profile')?.id).toBe('codex-profile')
  })

  it('falls back safely when the selected Agent was deleted', () => {
    expect(defaultAgentProfile(profiles, 'deleted-profile')?.id).toBe('codex-profile')
    expect(defaultAgentProfile([], '')).toBeUndefined()
  })

  it('parses a complete command without invoking a shell', () => {
    expect(parseAgentCommand('codex exec --json')).toEqual(['codex', 'exec', '--json'])
    expect(parseAgentCommand('"/Applications/Claude Code/claude" -p')).toEqual([
      '/Applications/Claude Code/claude',
      '-p'
    ])
    expect(parseAgentCommand('"C:\\Program Files\\Claude\\claude.exe" -p')).toEqual([
      'C:\\Program Files\\Claude\\claude.exe',
      '-p'
    ])
    expect(() => parseAgentCommand('claude "unfinished')).toThrow('unfinished quote')
  })

  it('treats any currently usable Agent channel as ready', () => {
    expect(classifyAgentReadiness(true, true, false, false)).toBe('ready')
    expect(classifyAgentReadiness(true, true, true, true)).toBe('ready')
    expect(classifyAgentReadiness(true, true, true, false)).toBe('ready')
    expect(classifyAgentReadiness(true, false, true, true)).toBe('ready')
    expect(classifyAgentReadiness(false, true, false, false)).toBe('unavailable')
    expect(classifyAgentReadiness(true, false, false, false)).toBe('unavailable')
    expect(classifyAgentReadiness(true, false, true, false)).toBe('partial')
  })

  it('keeps configuration in settings and removes technical controls from the comment header', () => {
    const repoRoot = resolve(__dirname, '../../../../..')
    const settingsSource = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/prefComponents/agent/CliAgentProfiles.vue'
    ), 'utf8')
    const directSetupSource = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/prefComponents/agent/DirectAgentSetup.vue'
    ), 'utf8')
    const agentSettingsSource = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/prefComponents/agent/index.vue'
    ), 'utf8')
    const commentPaneSource = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'
    ), 'utf8')
    const readinessSource = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/store/agentReadiness.ts'
    ), 'utf8')

    expect(settingsSource).toContain("t('preferences.agent.cliAdd')")
    expect(settingsSource).toContain("t('preferences.agent.cliTest')")
    expect(settingsSource).not.toContain('inspectMcpClients')
    expect(settingsSource).toContain('name="annotamd-comment-agent"')
    expect(directSetupSource).toContain(':advanced="advancedOpen"')
    expect(directSetupSource).not.toContain('directCommentConnection')
    expect(agentSettingsSource).not.toContain('directAgentEnabled')
    expect(agentSettingsSource).toContain("t('preferences.agent.usageGuideTitle')")
    expect(agentSettingsSource).toContain('<advanced')
    expect(commentPaneSource).not.toContain('annotamd-agent-picker')
    expect(commentPaneSource).not.toContain('annotamd-mcp-status')
    expect(commentPaneSource).toContain('annotamd-agent-channel-dot')
    expect(commentPaneSource).toContain("'direct-channel': !agentReadiness.loading && index === 0")
    expect(readinessSource).not.toContain("invoke('annotamd::mcp-clients::inspect')")
    expect(readinessSource).toContain('.filter((client) => client.connected)')
    expect(readinessSource).toContain('connectedAgentNames.length > 0')
  })
})
