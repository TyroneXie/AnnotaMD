import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { useAgentReadinessStore } from '@/store/agentReadiness'
import { usePreferencesStore } from '@/store/preferences'
import {
  ANNOTAMD_AGENT_PROFILE_PRESETS,
  claudeCodePermissionMode,
  classifyAgentReadiness,
  defaultAgentProfile,
  parseAgentCommand,
  withClaudeCodePermissionMode,
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
      .toBe('claude -p --output-format json --permission-mode bypassPermissions')
  })

  it('switches Claude Code between explicit standard and full-access modes', () => {
    const command = '"/Applications/Claude Code/claude" -p --permission-mode=default'
    const bypass = withClaudeCodePermissionMode(command, 'bypass')

    expect(bypass).toBe(
      '"/Applications/Claude Code/claude" -p --permission-mode bypassPermissions'
    )
    expect(claudeCodePermissionMode(bypass)).toBe('bypass')
    expect(withClaudeCodePermissionMode(bypass, 'standard')).toBe(
      '"/Applications/Claude Code/claude" -p --permission-mode default'
    )
    expect(claudeCodePermissionMode('claude -p')).toBe('standard')
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

  it('keeps the resolved status visible during background health checks', async() => {
    setActivePinia(createPinia())
    const readyStatus = {
      enabled: true,
      running: true,
      clients: [{ name: 'Codex', connected: true, lastSeenAt: Date.now() }]
    }
    let resolveBackgroundCheck: ((value: typeof readyStatus) => void) | undefined
    const invoke = vi.fn()
      .mockResolvedValueOnce(readyStatus)
      .mockImplementationOnce(() => new Promise<typeof readyStatus>((resolveCheck) => {
        resolveBackgroundCheck = resolveCheck
      }))
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { ipcRenderer: { invoke } }
    })
    Object.defineProperty(window, 'commandExists', {
      configurable: true,
      value: { exists: vi.fn().mockResolvedValue(true) }
    })

    const preferences = usePreferencesStore()
    preferences.$patch({
      commentMcpEnabled: true,
      agentProfiles: [{ ...profiles[1], command: 'claude -p' }],
      defaultAgentProfileId: profiles[1].id
    })
    const readiness = useAgentReadinessStore()

    await readiness.refresh()
    expect(readiness.loading).toBe(false)
    expect(readiness.level).toBe('ready')
    expect(readiness.checkRevision).toBe(1)

    const backgroundCheck = readiness.refresh()
    expect(readiness.loading).toBe(false)
    expect(readiness.level).toBe('ready')

    resolveBackgroundCheck?.(readyStatus)
    await backgroundCheck
    expect(readiness.loading).toBe(false)
    expect(readiness.level).toBe('ready')
    expect(readiness.checkRevision).toBe(2)
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
    expect(settingsSource).toContain("draft.kind === 'claude-code'")
    expect(settingsSource).toContain('v-model="draftClaudePermissionMode"')
    expect(settingsSource).toContain('withClaudeCodePermissionMode(draft.command, mode)')
    expect(settingsSource).not.toContain('inspectMcpClients')
    expect(settingsSource).toContain('name="annotamd-comment-agent"')
    expect(directSetupSource).toContain(':advanced="advancedOpen"')
    expect(directSetupSource).toContain('direct-agent-permission-badge')
    expect(directSetupSource).not.toContain('directCommentConnection')
    expect(agentSettingsSource).not.toContain('directAgentEnabled')
    expect(agentSettingsSource).toContain("t('preferences.agent.usageGuideTitle')")
    expect(agentSettingsSource).toContain('<advanced')
    expect(commentPaneSource).not.toContain('annotamd-agent-picker')
    expect(commentPaneSource).not.toContain('annotamd-mcp-status')
    expect(commentPaneSource).toContain('ref="agentStatusMenu"')
    expect(commentPaneSource).toContain('annotamd-agent-channel-dot')
    expect(commentPaneSource).toContain(':class="{ heartbeat: agentHeartbeatVisible }"')
    expect(commentPaneSource).toContain('() => agentReadiness.checkRevision')
    expect(commentPaneSource).toContain('@keyframes annotamd-agent-heartbeat')
    expect(commentPaneSource).toContain("'direct-channel': !agentReadiness.loading && index === 0")
    expect(commentPaneSource).toContain(
      "document.addEventListener('pointerdown', handleHeaderMenusOutsidePointerDown, true)"
    )
    expect(commentPaneSource).toContain(
      "document.removeEventListener('pointerdown', handleHeaderMenusOutsidePointerDown, true)"
    )
    expect(commentPaneSource).toContain('closeMenuOnOutsidePointerDown(agentStatusMenu.value, target)')
    expect(readinessSource).not.toContain("invoke('annotamd::mcp-clients::inspect')")
    expect(readinessSource).toContain('.filter((client) => client.connected)')
    expect(readinessSource).toContain('connectedAgentNames.length > 0')
    expect(readinessSource).toContain('if (this.checkRevision === 0) this.loading = true')
    expect(readinessSource).toContain('this.checkRevision += 1')
  })
})
