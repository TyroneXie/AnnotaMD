import { defineStore } from 'pinia'
import {
  cloneAgentSessions,
  shouldRevealCommentAgentConversation,
  UNIFIED_AGENT_CONVERSATION_KEY,
  type AgentSessions,
  type AnnotaMDAgentTurnResult,
  type AnnotaMDAgentTurnRequest,
  type AnnotaMDAgentTurnStartedEvent
} from '@shared/types/agentTurns'
import type { AiConfigSummary, AiWorkspaceEvent } from '@shared/types/aiWorkspace'
import { useAgentConversationsStore } from './agentConversations'
import { useAiSettingsStore } from './aiSettings'
import { useEditorStore } from './editor'
import { usePreferencesStore } from './preferences'
import { useRightPaneStore } from './rightPane'

interface AgentTurnsState {
  runningByComment: Record<string, boolean>
  activeByComment: Record<string, AnnotaMDAgentTurnStartedEvent>
  errorByComment: Record<string, string>
  readinessLoading: boolean
  checkRevision: number
  selectedAgentName: string
  directSendReady: boolean
}

let readinessListening = false
let readinessSequence = 0

const documentUri = (filePath: string): string => {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23').replace(/\?/g, '%3F')
  return normalizedPath.startsWith('/') ? `file://${encodedPath}` : `file:///${encodedPath}`
}

const conversationFor = (
  sessions: AgentSessions,
  filePath: string,
  commentId: string
): string | undefined => sessions[filePath]?.[commentId]?.[UNIFIED_AGENT_CONVERSATION_KEY]

const setConversation = (
  sessions: AgentSessions,
  filePath: string,
  commentId: string,
  conversationId?: string
): AgentSessions => {
  const next = cloneAgentSessions(sessions)
  const documentSessions = next[filePath] ?? {}
  const commentSessions = documentSessions[commentId] ?? {}
  if (conversationId) commentSessions[UNIFIED_AGENT_CONVERSATION_KEY] = conversationId
  else delete commentSessions[UNIFIED_AGENT_CONVERSATION_KEY]
  documentSessions[commentId] = commentSessions
  next[filePath] = documentSessions
  return next
}

const errorMessage = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error)

const defaultCli = (configs: AiConfigSummary[]): AiConfigSummary | undefined => {
  const enabled = configs.filter(config => config.enabled && config.kind === 'cli')
  return enabled.find(config => config.isDefault) ?? enabled[0]
}

export const useAgentTurnsStore = defineStore('agentTurns', {
  state: (): AgentTurnsState => ({
    runningByComment: {},
    activeByComment: {},
    errorByComment: {},
    readinessLoading: true,
    checkRevision: 0,
    selectedAgentName: '',
    directSendReady: false
  }),

  getters: {
    readinessLevel(state): 'ready' | 'unavailable' {
      return state.directSendReady ? 'ready' : 'unavailable'
    }
  },

  actions: {
    isRunning(commentId: string): boolean {
      return Boolean(this.runningByComment[commentId])
    },

    errorFor(commentId: string): string {
      return this.errorByComment[commentId] ?? ''
    },

    async refreshReadiness(): Promise<void> {
      const sequence = ++readinessSequence
      if (this.checkRevision === 0) this.readinessLoading = true
      try {
        const settings = useAiSettingsStore()
        await settings.initialize()
        const selected = settings.selectedConfig('agent') ?? defaultCli(settings.configs)
        if (sequence !== readinessSequence) return
        this.selectedAgentName = selected?.name ?? ''
        this.directSendReady = Boolean(selected)
      } catch {
        if (sequence !== readinessSequence) return
        this.selectedAgentName = ''
        this.directSendReady = false
      } finally {
        if (sequence === readinessSequence) {
          this.readinessLoading = false
          this.checkRevision += 1
        }
      }
    },

    startReadiness(): void {
      if (readinessListening) {
        void this.refreshReadiness()
        return
      }
      readinessListening = true
      void this.refreshReadiness()
      window.electron.ipcRenderer.on('annotamd::ai::event', (_event, event: AiWorkspaceEvent) => {
        if (event.type === 'readiness' || event.type === 'snapshot') {
          void this.refreshReadiness()
        }
      })
      window.electron.ipcRenderer.on(
        'annotamd::agent-turns::started',
        (_event, event: AnnotaMDAgentTurnStartedEvent) => {
          this.activeByComment = { ...this.activeByComment, [event.commentId]: event }
        }
      )
      window.addEventListener('focus', () => void this.refreshReadiness())
      window.addEventListener('annotamd:ai-selection-changed', () => void this.refreshReadiness())
    },

    async stop(commentId: string): Promise<boolean> {
      const active = this.activeByComment[commentId]
      if (!active) return false
      try {
        const stopped = await window.electron.ipcRenderer.invoke('annotamd::agent-turns::stop', active)
        if (!stopped) {
          this.errorByComment = {
            ...this.errorByComment,
            [commentId]: '当前 Agent 任务已经结束'
          }
        }
        return stopped
      } catch (error) {
        this.errorByComment = {
          ...this.errorByComment,
          [commentId]: errorMessage(error)
        }
        return false
      }
    },

    async revealDocumentChange(result: AnnotaMDAgentTurnResult): Promise<void> {
      if (!shouldRevealCommentAgentConversation(result)) return
      const conversations = useAgentConversationsStore()
      await conversations.select(result.conversationId, true)
      useRightPaneStore().openAgent()
    },

    async send(
      filePath: string,
      commentId: string,
      latestMessage: string
    ): Promise<string | null> {
      if (!filePath || !commentId || !latestMessage.trim() || this.isRunning(commentId)) {
        return null
      }

      const editor = useEditorStore()
      editor.flushActiveEditor()
      const file = editor.currentFile
      if (!file?.id || file.pathname !== filePath || file.isMissingOnDisk) {
        this.errorByComment = {
          ...this.errorByComment,
          [commentId]: '当前批注与活动文档不匹配'
        }
        return null
      }

      const preferences = usePreferencesStore()
      const settings = useAiSettingsStore()
      await settings.initialize()
      const selectedConfig = settings.selectedConfig('agent') ?? defaultCli(settings.configs)
      if (!selectedConfig) {
        this.errorByComment = {
          ...this.errorByComment,
          [commentId]: '请先在 Agent 设置中添加并选择 CLI Agent'
        }
        return null
      }
      let conversationId = conversationFor(
        preferences.agentSessionByDocument,
        filePath,
        commentId
      )
      const request = (): AnnotaMDAgentTurnRequest => ({
        filePath,
        commentId,
        latestMessage: latestMessage.trim(),
        workspacePath: window.path.dirname(filePath),
        document: {
          documentHandleId: file.id,
          documentId: file.id,
          documentUri: documentUri(filePath),
          filePath,
          markdown: file.markdown ?? '',
          revision: 0,
          dirty: !file.isSaved
        },
        selection: {
          configId: selectedConfig.id,
          modelId: settings.selections.agent.modelId,
          effort: settings.selections.agent.effort,
          permissionMode: settings.selections.agent.permissionMode
        },
        ...(conversationId ? { conversationId } : {})
      })

      this.runningByComment = { ...this.runningByComment, [commentId]: true }
      this.errorByComment = { ...this.errorByComment, [commentId]: '' }
      try {
        let result
        try {
          result = await window.electron.ipcRenderer.invoke('annotamd::agent-turns::run', request())
        } catch (error) {
          // A conversation can be deleted from the shared sidebar history.
          // Retry once as a fresh comment conversation without discarding any
          // legacy per-profile session ids kept beside our reserved key.
          if (!conversationId || !errorMessage(error).includes('was not found')) throw error
          conversationId = undefined
          preferences.SET_SINGLE_PREFERENCE({
            type: 'agentSessionByDocument',
            value: setConversation(
              preferences.agentSessionByDocument,
              filePath,
              commentId
            )
          })
          result = await window.electron.ipcRenderer.invoke('annotamd::agent-turns::run', request())
        }

        preferences.SET_SINGLE_PREFERENCE({
          type: 'agentSessionByDocument',
          value: setConversation(
            preferences.agentSessionByDocument,
            filePath,
            commentId,
            result.conversationId
          )
        })
        await this.revealDocumentChange(result)
        return result.reply
      } catch (error) {
        this.errorByComment = {
          ...this.errorByComment,
          [commentId]: errorMessage(error)
        }
        return null
      } finally {
        const nextRunning = { ...this.runningByComment }
        delete nextRunning[commentId]
        this.runningByComment = nextRunning
        const nextActive = { ...this.activeByComment }
        delete nextActive[commentId]
        this.activeByComment = nextActive
      }
    }
  }
})
