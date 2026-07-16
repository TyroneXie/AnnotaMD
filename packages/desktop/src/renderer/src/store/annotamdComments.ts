import { defineStore } from 'pinia'

export interface AnnotaMDSelectionAnchor {
  key: string
  offset: number
}

export interface AnnotaMDSelection {
  quote: string
  anchor: AnnotaMDSelectionAnchor
  focus: AnnotaMDSelectionAnchor
  isCrossBlock: boolean
  capturedAt: number
}

export interface AnnotaMDReply {
  id: string
  body: string
  createdAt: number
}

export interface AnnotaMDComment {
  id: string
  filePath: string
  scope: 'selection' | 'document'
  quote: string
  body: string
  resolved: boolean
  agentReadable: boolean
  createdAt: number
  updatedAt: number
  replies: AnnotaMDReply[]
  anchor?: AnnotaMDSelectionAnchor
  focus?: AnnotaMDSelectionAnchor
  isCrossBlock?: boolean
}

export type AnnotaMDComposerMode = 'selection' | 'document'

export interface AnnotaMDComposerRequest {
  id: number
  mode: AnnotaMDComposerMode
}

export interface AnnotaMDCommentFocusRequest {
  id: number
  commentId: string
}

interface AnnotaMDCommentsState {
  commentsByFile: Record<string, AnnotaMDComment[]>
  activeSelection: AnnotaMDSelection | null
  agentReadable: boolean
  paneVisible: boolean
  activeCommentId: string | null
  composerRequest: AnnotaMDComposerRequest | null
  commentFocusRequest: AnnotaMDCommentFocusRequest | null
}

const STORAGE_KEY = 'annotamd.comments.v2'

const readStoredComments = (): Record<string, AnnotaMDComment[]> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AnnotaMDComment[]>) : {}
  } catch {
    return {}
  }
}

const createId = (): string => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return `annotamd-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const useAnnotaMDCommentsStore = defineStore('annotamdComments', {
  state: (): AnnotaMDCommentsState => ({
    commentsByFile: readStoredComments(),
    activeSelection: null,
    agentReadable: true,
    paneVisible: false,
    activeCommentId: null,
    composerRequest: null,
    commentFocusRequest: null
  }),

  getters: {
    commentsForFile: (state) => {
      return (filePath?: string | null): AnnotaMDComment[] => {
        if (!filePath) return []
        return state.commentsByFile[filePath] ?? []
      }
    },
    unresolvedCountForFile: (state) => {
      return (filePath?: string | null): number => {
        if (!filePath) return 0
        return (state.commentsByFile[filePath] ?? []).filter((comment) => !comment.resolved).length
      }
    }
  },

  actions: {
    persist(): void {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.commentsByFile))
    },

    setActiveSelection(selection: AnnotaMDSelection | null): void {
      if (!selection?.quote.trim()) return
      this.activeSelection = {
        ...selection,
        quote: selection.quote.trim()
      }
    },

    addSelectionComment(filePath: string, body: string): void {
      const selection = this.activeSelection
      if (!selection || !filePath || !body.trim()) return

      this.addComment(filePath, {
        scope: 'selection',
        quote: selection.quote,
        body,
        anchor: selection.anchor,
        focus: selection.focus,
        isCrossBlock: selection.isCrossBlock
      })
    },

    requestComposer(mode: AnnotaMDComposerMode): void {
      this.paneVisible = true
      this.commentFocusRequest = null
      this.composerRequest = {
        id: Date.now(),
        mode
      }
    },

    clearComposerRequest(): void {
      this.composerRequest = null
    },

    requestCommentFocus(commentId: string): void {
      this.paneVisible = true
      this.activeCommentId = commentId
      this.composerRequest = null
      this.commentFocusRequest = {
        id: Date.now(),
        commentId
      }
    },

    clearCommentFocusRequest(): void {
      this.commentFocusRequest = null
    },

    setPaneVisible(visible: boolean): void {
      this.paneVisible = visible
      if (!visible) this.activeCommentId = null
      this.clearComposerRequest()
      this.clearCommentFocusRequest()
    },

    setActiveComment(commentId: string | null): void {
      if (this.activeCommentId === commentId) return
      this.activeCommentId = commentId
    },

    addDocumentComment(filePath: string, body: string): void {
      if (!filePath || !body.trim()) return

      this.addComment(filePath, {
        scope: 'document',
        quote: '全文级 Agent 批注',
        body
      })
    },

    addComment(
      filePath: string,
      payload: {
        scope: 'selection' | 'document'
        quote: string
        body: string
        anchor?: AnnotaMDSelectionAnchor
        focus?: AnnotaMDSelectionAnchor
        isCrossBlock?: boolean
      }
    ): void {
      const now = Date.now()
      const nextComment: AnnotaMDComment = {
        id: createId(),
        filePath,
        scope: payload.scope,
        quote: payload.quote,
        body: payload.body.trim(),
        resolved: false,
        agentReadable: this.agentReadable,
        createdAt: now,
        updatedAt: now,
        replies: [],
        anchor: payload.anchor,
        focus: payload.focus,
        isCrossBlock: payload.isCrossBlock
      }

      this.commentsByFile[filePath] = [nextComment, ...(this.commentsByFile[filePath] ?? [])]
      this.persist()
    },

    updateComment(filePath: string, id: string, body: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === id)
      if (!comment || !body.trim()) return
      comment.body = body.trim()
      comment.updatedAt = Date.now()
      this.persist()
    },

    addReply(filePath: string, id: string, body: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === id)
      if (!comment || !body.trim()) return
      comment.replies.push({
        id: createId(),
        body: body.trim(),
        createdAt: Date.now()
      })
      comment.updatedAt = Date.now()
      this.persist()
    },

    toggleResolved(filePath: string, id: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === id)
      if (!comment) return
      comment.resolved = !comment.resolved
      comment.updatedAt = Date.now()
      this.persist()
    },

    deleteComment(filePath: string, id: string): void {
      const comments = this.commentsByFile[filePath]
      if (!comments) return
      this.commentsByFile[filePath] = comments.filter((item) => item.id !== id)
      this.persist()
    }
  }
})
