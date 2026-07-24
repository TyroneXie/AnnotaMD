import { defineStore } from 'pinia'
import type { AnnotaMDMcpStatus } from '@shared/types/comments'
import type {
  AnnotaMDMcpClientState
} from '@shared/types/mcpClients'
import {
  classifyAgentReadiness,
  defaultAgentProfile,
  displayAgentProfileName,
  parseAgentCommand,
  type AgentReadinessLevel,
  type AnnotaMDAgentProfile
} from '@shared/types/agentProfiles'
import { usePreferencesStore } from './preferences'

interface AgentReadinessState {
  level: AgentReadinessLevel
  loading: boolean
  selectedAgentName: string
  selectedAgentKind: AnnotaMDAgentProfile['kind'] | ''
  selectedCliAvailable: boolean
  selectedDirectSupported: boolean
  directSendReady: boolean
  appAccessReady: boolean
}

let listening = false
let refreshSequence = 0

const executableAvailable = async(profile: AnnotaMDAgentProfile): Promise<boolean> => {
  let executable = ''
  try {
    executable = parseAgentCommand(profile.command)[0] ?? ''
  } catch {
    return false
  }
  if (!executable) return false
  return /[\\/]/.test(executable)
    ? window.fileUtils.isExecutable(executable)
    : window.commandExists.exists(executable)
}

export const useAgentReadinessStore = defineStore('agentReadiness', {
  state: (): AgentReadinessState => ({
    level: 'unavailable',
    loading: true,
    selectedAgentName: '',
    selectedAgentKind: '',
    selectedCliAvailable: false,
    selectedDirectSupported: false,
    directSendReady: false,
    appAccessReady: false
  }),

  actions: {
    async refresh(): Promise<void> {
      const sequence = ++refreshSequence
      const preferences = usePreferencesStore()
      const selectedProfile = defaultAgentProfile(
        preferences.agentProfiles,
        preferences.defaultAgentProfileId
      )
      this.loading = true

      try {
        const [status, clients, cliAvailable] = await Promise.all([
          window.electron.ipcRenderer.invoke('annotamd::comments::mcp-status')
            .catch((): AnnotaMDMcpStatus => ({
              enabled: preferences.commentMcpEnabled,
              running: false,
              clients: []
            })),
          window.electron.ipcRenderer.invoke('annotamd::mcp-clients::inspect')
            .catch((): AnnotaMDMcpClientState[] => []),
          selectedProfile ? executableAvailable(selectedProfile) : Promise.resolve(false)
        ])
        if (sequence !== refreshSequence) return

        const commentAccessEnabled = preferences.commentMcpEnabled
        const mcpServiceReady = commentAccessEnabled && status.running
        const anyMcpConfigured = clients.some((client: AnnotaMDMcpClientState) => (
          client.mcpConfigured
        )) || status.clients.length > 0
        const supportedDirectAgent = selectedProfile?.kind === 'claude-code'
        const directSendReady = Boolean(
          commentAccessEnabled &&
          selectedProfile &&
          cliAvailable &&
          supportedDirectAgent
        )
        const appAccessReady = mcpServiceReady && anyMcpConfigured

        this.selectedAgentName = selectedProfile ? displayAgentProfileName(selectedProfile) : ''
        this.selectedAgentKind = selectedProfile?.kind ?? ''
        this.selectedCliAvailable = cliAvailable
        this.selectedDirectSupported = supportedDirectAgent
        this.directSendReady = directSendReady
        this.appAccessReady = appAccessReady
        this.level = classifyAgentReadiness(
          commentAccessEnabled,
          appAccessReady,
          Boolean(selectedProfile),
          directSendReady
        )
      } catch {
        if (sequence !== refreshSequence) return
        this.level = 'unavailable'
        this.selectedAgentName = selectedProfile ? displayAgentProfileName(selectedProfile) : ''
        this.selectedAgentKind = selectedProfile?.kind ?? ''
        this.selectedCliAvailable = false
        this.selectedDirectSupported = selectedProfile?.kind === 'claude-code'
        this.directSendReady = false
        this.appAccessReady = false
      } finally {
        if (sequence === refreshSequence) this.loading = false
      }
    },

    start(): void {
      if (listening) {
        void this.refresh()
        return
      }
      listening = true
      void this.refresh()
      window.electron.ipcRenderer.on('annotamd::comments::mcp-status-changed', () => {
        void this.refresh()
      })
      window.addEventListener('focus', () => void this.refresh())
    }
  }
})
