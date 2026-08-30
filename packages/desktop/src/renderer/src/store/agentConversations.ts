import { defineStore } from 'pinia'
import type {
  AiApprovalDecision,
  AiApprovalRequest,
  AiChangeSet,
  AiChangeSetResolveRequest,
  AiConversation,
  AiConversationCreateRequest,
  AiMessage,
  AiReadiness,
  AiRetryRequest,
  AiSendRequest,
  AiWorkspaceEvent,
  AiWorkspaceSnapshot
} from '@shared/types/aiWorkspace'

const sortConversations = (items: AiConversation[]): AiConversation[] => (
  [...items].sort((left, right) => right.updatedAt - left.updatedAt)
)

export const useAgentConversationsStore = defineStore('agentConversations', {
  state: () => ({
    items: [] as AiConversation[],
    activeId: '',
    messages: [] as AiMessage[],
    changeSets: [] as AiChangeSet[],
    pendingApprovals: [] as AiApprovalRequest[],
    readiness: { status: 'initializing' } as AiReadiness,
    running: false,
    activeTurnId: '',
    initialized: false,
    loading: false,
    error: '',
    changeSetResolvingId: '',
    changeSetErrors: {} as Record<string, string>,
    eventsSubscribed: false,
    stopEvents: undefined as (() => void) | undefined
  }),

  getters: {
    activeConversation(state): AiConversation | undefined {
      return state.items.find(conversation => conversation.id === state.activeId)
    },
    activeMessages(state): AiMessage[] {
      return state.messages
    }
  },

  actions: {
    upsertConversation(conversation: AiConversation): void {
      const index = this.items.findIndex(item => item.id === conversation.id)
      if (index === -1) this.items.push(conversation)
      else this.items.splice(index, 1, conversation)
      this.items = sortConversations(this.items)
    },

    applySnapshot(snapshot: AiWorkspaceSnapshot): void {
      this.readiness = snapshot.readiness
      this.items = sortConversations(snapshot.conversations)
      this.activeId = snapshot.activeConversationId ?? ''
      this.messages = snapshot.messages
      this.changeSets = snapshot.changeSets
      this.pendingApprovals = []
      this.running = snapshot.running
      this.activeTurnId = snapshot.activeTurnId ?? ''
      this.error = ''
    },

    subscribeToEvents(): void {
      if (this.eventsSubscribed) return
      this.eventsSubscribed = true
      this.stopEvents = window.electron.ipcRenderer.on(
        'annotamd::ai::event',
        (_event, event) => this.applyEvent(event)
      )
    },

    applyEvent(event: AiWorkspaceEvent): void {
      switch (event.type) {
        case 'snapshot':
          this.applySnapshot(event.snapshot)
          return
        case 'readiness':
          this.readiness = event.readiness
          return
        case 'conversation-created':
        case 'conversation-updated':
          this.upsertConversation(event.conversation)
          if (event.conversation.id === this.activeId) {
            this.running = event.conversation.status === 'running'
          }
          return
        case 'conversation-deleted':
          this.items = this.items.filter(conversation => conversation.id !== event.conversationId)
          if (this.activeId === event.conversationId) {
            this.activeId = ''
            this.messages = []
            this.changeSets = []
            this.pendingApprovals = []
            this.running = false
            this.activeTurnId = ''
          }
          return
        case 'conversation-selected':
          this.activeId = event.conversationId
          this.messages = event.messages
          this.changeSets = event.changeSets
          this.pendingApprovals = []
          this.running = this.activeConversation?.status === 'running'
          return
        case 'turn-started':
          if (event.conversationId !== this.activeId) return
          this.running = true
          this.activeTurnId = event.turnId
          this.error = ''
          return
        case 'message': {
          if (event.conversationId !== this.activeId) return
          const index = this.messages.findIndex(message => message.id === event.message.id)
          if (index === -1) this.messages.push(event.message)
          else this.messages.splice(index, 1, event.message)
          return
        }
        case 'message-delta': {
          if (event.conversationId !== this.activeId) return
          const index = this.messages.findIndex(message => message.id === event.messageId)
          if (index === -1) {
            this.messages.push({
              id: event.messageId,
              conversationId: event.conversationId,
              role: event.role,
              content: event.delta,
              status: 'streaming',
              createdAt: Date.now()
            })
          } else {
            const message = this.messages[index]!
            this.messages.splice(index, 1, {
              ...message,
              content: `${message.content}${event.delta}`,
              status: 'streaming'
            })
          }
          return
        }
        case 'change-set': {
          if (event.conversationId !== this.activeId) return
          const index = this.changeSets.findIndex(changeSet => changeSet.id === event.changeSet.id)
          if (index === -1) this.changeSets.push(event.changeSet)
          else this.changeSets.splice(index, 1, event.changeSet)
          return
        }
        case 'tool':
          return
        case 'approval-requested':
          if (event.approval.conversationId !== this.activeId) return
          this.pendingApprovals = [
            ...this.pendingApprovals.filter(item => item.id !== event.approval.id),
            event.approval
          ]
          return
        case 'approval-resolved':
          this.pendingApprovals = this.pendingApprovals.filter(item => item.id !== event.approvalId)
          return
        case 'turn-finished':
          if (event.conversationId !== this.activeId) return
          this.running = false
          this.activeTurnId = ''
          this.messages = this.messages.map(message => (
            message.status === 'streaming' ? { ...message, status: 'complete' } : message
          ))
          this.pendingApprovals = []
          return
        case 'turn-error':
          if (event.conversationId !== this.activeId) return
          this.running = false
          this.activeTurnId = ''
          this.error = event.message
          this.messages = this.messages.map(message => (
            message.status === 'streaming' ? { ...message, status: 'failed' } : message
          ))
          this.pendingApprovals = []
      }
    },

    async initialize(force = false): Promise<void> {
      if (this.loading || (this.initialized && !force)) return
      this.subscribeToEvents()
      this.loading = true
      this.error = ''
      try {
        this.applySnapshot(await window.electron.ipcRenderer.invoke('annotamd::ai::snapshot'))
        this.initialized = true
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        this.readiness = { status: 'error', message: this.error }
      } finally {
        this.loading = false
      }
    },

    async create(request: AiConversationCreateRequest): Promise<AiConversation> {
      this.error = ''
      const conversation = await window.electron.ipcRenderer.invoke(
        'annotamd::ai::conversations:create',
        request
      )
      this.upsertConversation(conversation)
      this.activeId = conversation.id
      this.messages = []
      this.changeSets = []
      this.pendingApprovals = []
      this.running = false
      this.activeTurnId = ''
      return conversation
    },

    async select(id: string, force = false): Promise<void> {
      if (!force && id === this.activeId) return
      this.loading = true
      this.error = ''
      try {
        const contents = await window.electron.ipcRenderer.invoke(
          'annotamd::ai::conversations:select',
          id
        )
        this.activeId = id
        this.messages = contents.messages
        this.changeSets = contents.changeSets
        this.pendingApprovals = []
        this.running = this.activeConversation?.status === 'running'
        this.activeTurnId = ''
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      } finally {
        this.loading = false
      }
    },

    async delete(id: string): Promise<void> {
      this.error = ''
      try {
        if (!await window.electron.ipcRenderer.invoke('annotamd::ai::conversations:delete', id)) return
        this.items = this.items.filter(conversation => conversation.id !== id)
        if (this.activeId !== id) return
        this.activeId = ''
        this.messages = []
        this.changeSets = []
        this.pendingApprovals = []
        this.running = false
        this.activeTurnId = ''
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      }
    },

    async rename(id: string, title: string): Promise<AiConversation | undefined> {
      const normalizedTitle = title.replace(/\s+/g, ' ').trim()
      if (!normalizedTitle) return undefined
      this.error = ''
      try {
        const conversation = await window.electron.ipcRenderer.invoke(
          'annotamd::ai::conversations:rename',
          { conversationId: id, title: normalizedTitle }
        )
        this.upsertConversation(conversation)
        return conversation
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        return undefined
      }
    },

    async send(request: AiSendRequest): Promise<void> {
      this.error = ''
      try {
        const result = await window.electron.ipcRenderer.invoke('annotamd::ai::send', request)
        this.activeId = result.conversationId
        this.activeTurnId = result.turnId
        this.running = true
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      }
    },

    async stopConversation(id: string): Promise<void> {
      const conversation = this.items.find(item => item.id === id)
      const isActiveTurn = id === this.activeId && this.running
      if (!conversation || (!isActiveTurn && conversation.status !== 'running')) return
      await window.electron.ipcRenderer.invoke('annotamd::ai::stop', {
        conversationId: id
      })
    },

    async stop(): Promise<void> {
      if (!this.activeId || !this.running) return
      await this.stopConversation(this.activeId)
    },

    async resolveApproval(approvalId: string, decision: AiApprovalDecision): Promise<boolean> {
      const approval = this.pendingApprovals.find(item => item.id === approvalId)
      if (!approval) return false
      try {
        return await window.electron.ipcRenderer.invoke('annotamd::ai::approvals:resolve', {
          conversationId: approval.conversationId,
          runId: approval.runId,
          approvalId,
          decision
        })
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        return false
      }
    },

    async retry(request: AiRetryRequest): Promise<void> {
      this.error = ''
      try {
        const result = await window.electron.ipcRenderer.invoke('annotamd::ai::retry', request)
        this.activeId = result.conversationId
        this.activeTurnId = result.turnId
        this.running = true
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      }
    },

    async resolveChangeSet(request: AiChangeSetResolveRequest): Promise<void> {
      this.changeSetResolvingId = request.changeSetId
      delete this.changeSetErrors[request.changeSetId]
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'annotamd::ai::change-sets:resolve',
          request
        )
        const index = this.changeSets.findIndex(changeSet => changeSet.id === result.changeSet.id)
        if (index === -1) this.changeSets.push(result.changeSet)
        else this.changeSets.splice(index, 1, result.changeSet)
      } catch (error) {
        this.changeSetErrors[request.changeSetId] = error instanceof Error
          ? error.message
          : String(error)
      } finally {
        this.changeSetResolvingId = ''
      }
    }
  }
})
