import { defineStore } from 'pinia'
import type { AnnotaMDAgentProfile } from '@shared/types/agentProfiles'
import { usePreferencesStore } from './preferences'

interface AgentTurnsState {
  runningByComment: Record<string, boolean>
  errorByComment: Record<string, string>
}

export type AgentSessions = Record<string, Record<string, Record<string, string>>>

export const cloneAgentSessions = (sessions: AgentSessions): AgentSessions => (
  Object.fromEntries(Object.entries(sessions).map(([filePath, comments]) => [
    filePath,
    Object.fromEntries(Object.entries(comments).map(([commentId, profiles]) => [
      commentId,
      { ...profiles }
    ]))
  ]))
)

const sessionFor = (
  sessions: AgentSessions,
  filePath: string,
  commentId: string,
  profileId: string
): string | undefined => sessions[filePath]?.[commentId]?.[profileId]

export const useAgentTurnsStore = defineStore('agentTurns', {
  state: (): AgentTurnsState => ({
    runningByComment: {},
    errorByComment: {}
  }),

  actions: {
    isRunning(commentId: string): boolean {
      return Boolean(this.runningByComment[commentId])
    },

    errorFor(commentId: string): string {
      return this.errorByComment[commentId] ?? ''
    },

    async send(
      filePath: string,
      commentId: string,
      latestMessage: string,
      profile: AnnotaMDAgentProfile
    ): Promise<boolean> {
      if (!filePath || !commentId || !latestMessage.trim() || this.isRunning(commentId)) {
        return false
      }
      const preferences = usePreferencesStore()
      const existingSessionId = sessionFor(
        preferences.agentSessionByDocument,
        filePath,
        commentId,
        profile.id
      )
      this.runningByComment = { ...this.runningByComment, [commentId]: true }
      this.errorByComment = { ...this.errorByComment, [commentId]: '' }
      try {
        const result = await window.electron.ipcRenderer.invoke('annotamd::agent-turns::run', {
          filePath,
          commentId,
          latestMessage: latestMessage.trim(),
          profile: { ...profile },
          promptTemplate: preferences.agentPromptTemplate,
          sessionId: existingSessionId
        })
        const nextSessions = cloneAgentSessions(preferences.agentSessionByDocument)
        const documentSessions = nextSessions[filePath] ?? {}
        const commentSessions = documentSessions[commentId] ?? {}
        commentSessions[profile.id] = result.sessionId
        documentSessions[commentId] = commentSessions
        nextSessions[filePath] = documentSessions
        preferences.SET_SINGLE_PREFERENCE({
          type: 'agentSessionByDocument',
          value: nextSessions
        })
        return result.replyAdded
      } catch (error) {
        this.errorByComment = {
          ...this.errorByComment,
          [commentId]: error instanceof Error ? error.message : String(error)
        }
        if (existingSessionId) {
          const nextSessions = cloneAgentSessions(preferences.agentSessionByDocument)
          const nextDocumentSessions = nextSessions[filePath] ?? {}
          const nextCommentSessions = nextDocumentSessions[commentId] ?? {}
          delete nextCommentSessions[profile.id]
          nextDocumentSessions[commentId] = nextCommentSessions
          nextSessions[filePath] = nextDocumentSessions
          preferences.SET_SINGLE_PREFERENCE({
            type: 'agentSessionByDocument',
            value: nextSessions
          })
        }
        return false
      } finally {
        const nextRunning = { ...this.runningByComment }
        delete nextRunning[commentId]
        this.runningByComment = nextRunning
      }
    }
  }
})
