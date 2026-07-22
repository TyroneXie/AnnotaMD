import { defineStore } from 'pinia'
import { ReadCursor, type JSONOp } from 'ot-json1'
import diff from 'fast-diff'
import {
  mapAnnotationPointBetweenDocumentsUtf16,
  transformAnnotationPointUtf16
} from '@muyajs/core'
import type {
  AnnotaMDCommentRecord,
  AnnotaMDCommentReplyRecord,
  AnnotaMDCommentAnchor,
  AnnotaMDLegacyCommentMigration
} from '@shared/types/comments'

export type AnnotaMDSelectionAnchor = AnnotaMDCommentAnchor

export interface AnnotaMDSelection {
  quote: string
  exactQuote?: string
  anchor: AnnotaMDSelectionAnchor
  focus: AnnotaMDSelectionAnchor
  isCrossBlock: boolean
  capturedAt: number
}

export type AnnotaMDReply = AnnotaMDCommentReplyRecord
export type AnnotaMDComment = AnnotaMDCommentRecord

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
  revisionByFile: Record<string, number>
  markdownByFile: Record<string, string>
  activeSelection: AnnotaMDSelection | null
  paneVisible: boolean
  activeCommentId: string | null
  composerRequest: AnnotaMDComposerRequest | null
  commentFocusRequest: AnnotaMDCommentFocusRequest | null
}

const STORAGE_KEY = 'annotamd.comments.v2'
const persistQueue = new Map<string, Promise<void>>()
const persistRequested = new Set<string>()
const synchronizingFiles = new Set<string>()
let stopMainCommentSync: (() => void) | null = null

const readStoredComments = (): Record<string, AnnotaMDComment[]> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AnnotaMDComment[]>) : {}
  } catch {
    return {}
  }
}

const normalizeLegacyComment = (comment: AnnotaMDComment): AnnotaMDComment => ({
  ...comment,
  exactQuote: comment.exactQuote ?? comment.quote,
  replies: (comment.replies ?? []).map((reply) => ({
    ...reply,
    author: reply.author ?? 'user'
  })),
  anchor: comment.anchor
    ? { ...comment.anchor, path: comment.anchor.path ?? parseAnchorKey(comment.anchor.key) }
    : undefined,
  focus: comment.focus
    ? { ...comment.focus, path: comment.focus.path ?? parseAnchorKey(comment.focus.key) }
    : undefined
})

const parseAnchorKey = (key: string): Array<string | number> => key.split('/').map((segment) => {
  const numeric = Number(segment)
  return Number.isInteger(numeric) && String(numeric) === segment ? numeric : segment
})

const comparePaths = (
  first: Array<string | number>,
  second: Array<string | number>
): number => {
  const length = Math.min(first.length, second.length)
  for (let index = 0; index < length; index += 1) {
    if (first[index] === second[index]) continue
    if (typeof first[index] === 'number' && typeof second[index] === 'number') {
      return (first[index] as number) - (second[index] as number)
    }
    return String(first[index]).localeCompare(String(second[index]))
  }
  return first.length - second.length
}

const pathsEqual = (
  first: Array<string | number>,
  second: Array<string | number>
): boolean => comparePaths(first, second) === 0

type TextOperation = Array<number | string | { d: string }>

const readTextAtPath = (document: unknown, path: Array<string | number>): string | null => {
  let value = document
  for (const segment of path) {
    if (value == null || typeof value !== 'object') return null
    value = (value as Record<string | number, unknown>)[segment]
  }
  return typeof value === 'string' ? value : null
}

const textOperationDeletesRange = (
  operation: TextOperation,
  text: string,
  startUtf16: number,
  endUtf16: number
): boolean => {
  const start = Array.from(text.slice(0, startUtf16)).length
  const end = Array.from(text.slice(0, endUtf16)).length
  if (start >= end) return false

  let previousOffset = 0
  let coveredUntil = start
  for (const component of operation) {
    if (typeof component === 'number') {
      previousOffset += component
      continue
    }
    if (typeof component === 'string') continue
    const deletedLength = Array.from(component.d).length
    const deletionEnd = previousOffset + deletedLength
    if (previousOffset <= coveredUntil && deletionEnd > coveredUntil) {
      coveredUntil = Math.min(end, deletionEnd)
      if (coveredUntil === end) return true
    }
    previousOffset = deletionEnd
  }
  return false
}

const operationDeletesWholeSelection = (
  operation: JSONOp,
  previousDocument: unknown,
  anchor: AnnotaMDCommentAnchor,
  focus: AnnotaMDCommentAnchor
): boolean => {
  const anchorPath = anchor.path ?? parseAnchorKey(anchor.key)
  const focusPath = focus.path ?? parseAnchorKey(focus.key)
  if (!pathsEqual(anchorPath, focusPath)) return false

  const text = readTextAtPath(previousDocument, anchorPath)
  if (text == null) return false
  const start = Math.min(anchor.offset, focus.offset)
  const end = Math.max(anchor.offset, focus.offset)
  let deletesWholeSelection = false
  const cursor = new ReadCursor(operation)
  cursor.traverse(null, (component) => {
    if (component.es && pathsEqual(cursor.getPath(), anchorPath)) {
      deletesWholeSelection ||= textOperationDeletesRange(
        component.es as TextOperation,
        text,
        start,
        end
      )
    }
  })
  return deletesWholeSelection
}

const documentChangeDeletesWholeSelection = (
  previousDocument: unknown,
  nextDocument: unknown,
  anchor: AnnotaMDCommentAnchor,
  focus: AnnotaMDCommentAnchor,
  nextAnchor: { path: Array<string | number>; offset: number },
  nextFocus: { path: Array<string | number>; offset: number }
): boolean => {
  const anchorPath = anchor.path ?? parseAnchorKey(anchor.key)
  const focusPath = focus.path ?? parseAnchorKey(focus.key)
  if (!pathsEqual(anchorPath, focusPath) || !pathsEqual(nextAnchor.path, nextFocus.path)) {
    return false
  }
  const previousText = readTextAtPath(previousDocument, anchorPath)
  const nextText = readTextAtPath(nextDocument, nextAnchor.path)
  if (previousText == null || nextText == null) return false
  const textOperation: TextOperation = diff(previousText, nextText).map(([kind, text]) => {
    if (kind === diff.INSERT) return text
    if (kind === diff.DELETE) return { d: text }
    return Array.from(text).length
  })
  return textOperationDeletesRange(
    textOperation,
    previousText,
    Math.min(anchor.offset, focus.offset),
    Math.max(anchor.offset, focus.offset)
  )
}

const createId = (): string => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return `annotamd-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const cloneCommentForIpc = (comment: AnnotaMDComment): AnnotaMDComment => ({
  ...comment,
  replies: comment.replies.map((reply) => ({ ...reply })),
  anchor: comment.anchor
    ? {
        ...comment.anchor,
        path: comment.anchor.path ? [...comment.anchor.path] : undefined
      }
    : undefined,
  focus: comment.focus
    ? {
        ...comment.focus,
        path: comment.focus.path ? [...comment.focus.path] : undefined
      }
    : undefined
})

export const useAnnotaMDCommentsStore = defineStore('annotamdComments', {
  state: (): AnnotaMDCommentsState => ({
    commentsByFile: {},
    revisionByFile: {},
    markdownByFile: {},
    activeSelection: null,
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
    initializeMainSync(): void {
      if (stopMainCommentSync) return
      stopMainCommentSync = window.electron.ipcRenderer.on(
        'mt::comments::changed',
        (_event, filePath) => {
          if (synchronizingFiles.has(filePath)) return
          void this.loadForFile(filePath, this.markdownByFile[filePath] ?? '')
        }
      )
    },

    async loadForFile(filePath: string, markdown: string): Promise<void> {
      if (!filePath) return
      this.initializeMainSync()
      this.markdownByFile[filePath] = markdown
      await this.migrateLegacyForFile(filePath, markdown)
      const document = await window.electron.ipcRenderer.invoke(
        'mt::comments::load',
        filePath,
        markdown
      )
      this.commentsByFile[filePath] = document.comments
      this.revisionByFile[filePath] = document.revision
    },

    async migrateLegacyForFile(filePath: string, markdown: string): Promise<void> {
      const legacy = readStoredComments()
      const comments = legacy[filePath]
      if (!comments?.length) return
      const entries: AnnotaMDLegacyCommentMigration[] = [{
        filePath,
        markdown,
        comments: comments.map(normalizeLegacyComment)
      }]
      await window.electron.ipcRenderer.invoke('mt::comments::migrate', entries)
      delete legacy[filePath]
      if (Object.keys(legacy).length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))
      } else {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    },

    persistFile(filePath: string): Promise<void> {
      persistRequested.add(filePath)
      const running = persistQueue.get(filePath)
      if (running) {
        // Keep only the newest state while a write is in flight. The running
        // task will loop once more after it finishes instead of serializing
        // every intermediate keystroke into a separate SQLite transaction.
        return running
      }

      const next = (async() => {
        synchronizingFiles.add(filePath)
        try {
          while (persistRequested.delete(filePath)) {
            try {
              const document = await window.electron.ipcRenderer.invoke('mt::comments::replace', {
                filePath,
                markdown: this.markdownByFile[filePath] ?? '',
                expectedRevision: this.revisionByFile[filePath] ?? 0,
                comments: (this.commentsByFile[filePath] ?? []).map(cloneCommentForIpc)
              })
              this.revisionByFile[filePath] = document.revision
            } catch (error) {
              console.error(
                '[AnnotaMD] Failed to persist comments; reloading the latest revision.',
                error
              )
              const document = await window.electron.ipcRenderer.invoke(
                'mt::comments::load',
                filePath,
                this.markdownByFile[filePath] ?? ''
              )
              this.commentsByFile[filePath] = document.comments
              this.revisionByFile[filePath] = document.revision
            }
          }
        } finally {
          synchronizingFiles.delete(filePath)
          persistQueue.delete(filePath)
          persistRequested.delete(filePath)
        }
      })()
      persistQueue.set(filePath, next)
      return next
    },

    transformSelectionAnchors(
      filePath: string,
      operation: JSONOp,
      previousDocument: unknown,
      nextDocument: unknown
    ): void {
      const comments = this.commentsByFile[filePath]
      if (!comments?.length || operation == null) return
      let changed = false

      this.commentsByFile[filePath] = comments.flatMap((comment) => {
        if (comment.scope !== 'selection' || !comment.anchor || !comment.focus) return [comment]
        if (operationDeletesWholeSelection(
          operation,
          previousDocument,
          comment.anchor,
          comment.focus
        )) {
          changed = true
          return []
        }
        const anchorPath = comment.anchor.path ?? parseAnchorKey(comment.anchor.key)
        const focusPath = comment.focus.path ?? parseAnchorKey(comment.focus.key)
        const anchor = transformAnnotationPointUtf16(
          { path: anchorPath, offset: comment.anchor.offset },
          operation,
          previousDocument,
          nextDocument,
          'right'
        )
        const focus = transformAnnotationPointUtf16(
          { path: focusPath, offset: comment.focus.offset },
          operation,
          previousDocument,
          nextDocument,
          'right'
        )
        if (!anchor || !focus) {
          changed = true
          return []
        }
        if (comparePaths(anchor.path, focus.path) === 0 && anchor.offset === focus.offset) {
          changed = true
          return []
        }
        const anchorChanged = comparePaths(anchor.path, anchorPath) !== 0
          || anchor.offset !== comment.anchor.offset
        const focusChanged = comparePaths(focus.path, focusPath) !== 0
          || focus.offset !== comment.focus.offset
        if (!anchorChanged && !focusChanged) return [comment]
        changed = true
        return [{
          ...comment,
          anchor: { key: anchor.path.join('/'), path: [...anchor.path], offset: anchor.offset },
          focus: { key: focus.path.join('/'), path: [...focus.path], offset: focus.offset },
          updatedAt: Date.now()
        }]
      })

      if (changed) void this.persistFile(filePath)
    },

    remapSelectionAnchorsBetweenDocuments(
      filePath: string,
      previousDocument: unknown,
      nextDocument: unknown
    ): void {
      const comments = this.commentsByFile[filePath]
      if (!comments?.length) return
      let changed = false

      this.commentsByFile[filePath] = comments.flatMap((comment) => {
        if (comment.scope !== 'selection' || !comment.anchor || !comment.focus) return [comment]
        const anchorPath = comment.anchor.path ?? parseAnchorKey(comment.anchor.key)
        const focusPath = comment.focus.path ?? parseAnchorKey(comment.focus.key)
        const anchorAffinity = 'right'
        const focusAffinity = 'right'
        const anchor = mapAnnotationPointBetweenDocumentsUtf16(
          { path: anchorPath, offset: comment.anchor.offset },
          previousDocument,
          nextDocument,
          anchorAffinity
        )
        const focus = mapAnnotationPointBetweenDocumentsUtf16(
          { path: focusPath, offset: comment.focus.offset },
          previousDocument,
          nextDocument,
          focusAffinity
        )
        if (!anchor || !focus) {
          changed = true
          return []
        }
        if (documentChangeDeletesWholeSelection(
          previousDocument,
          nextDocument,
          comment.anchor,
          comment.focus,
          anchor,
          focus
        )) {
          changed = true
          return []
        }
        if (comparePaths(anchor.path, focus.path) === 0 && anchor.offset === focus.offset) {
          changed = true
          return []
        }

        changed = true
        return [{
          ...comment,
          anchor: { key: anchor.path.join('/'), path: [...anchor.path], offset: anchor.offset },
          focus: { key: focus.path.join('/'), path: [...focus.path], offset: focus.offset },
          updatedAt: Date.now()
        }]
      })

      if (changed) void this.persistFile(filePath)
    },

    setActiveSelection(selection: AnnotaMDSelection | null): void {
      if (!selection?.quote.trim()) return
      this.activeSelection = {
        ...selection,
        quote: selection.quote.trim(),
        exactQuote: selection.exactQuote ?? selection.quote
      }
    },

    addSelectionComment(filePath: string, body: string): void {
      const selection = this.activeSelection
      if (!selection || !filePath || !body.trim()) return

      this.addComment(filePath, {
        scope: 'selection',
        quote: selection.quote,
        exactQuote: selection.exactQuote,
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
        exactQuote?: string
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
        exactQuote: payload.exactQuote,
        body: payload.body.trim(),
        resolved: false,
        agentReadable: true,
        createdAt: now,
        updatedAt: now,
        replies: [],
        anchor: payload.anchor,
        focus: payload.focus,
        isCrossBlock: payload.isCrossBlock
      }

      this.commentsByFile[filePath] = [nextComment, ...(this.commentsByFile[filePath] ?? [])]
      void this.persistFile(filePath)
    },

    updateComment(filePath: string, id: string, body: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === id)
      if (!comment || !body.trim()) return
      comment.body = body.trim()
      comment.updatedAt = Date.now()
      void this.persistFile(filePath)
    },

    addReply(filePath: string, id: string, body: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === id)
      if (!comment || !body.trim()) return
      comment.replies.push({
        id: createId(),
        body: body.trim(),
        author: 'user',
        createdAt: Date.now()
      })
      comment.updatedAt = Date.now()
      void this.persistFile(filePath)
    },

    updateReply(filePath: string, commentId: string, replyId: string, body: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === commentId)
      const reply = comment?.replies.find((item) => item.id === replyId)
      if (!comment || !reply || reply.author !== 'user' || !body.trim()) return
      reply.body = body.trim()
      comment.updatedAt = Date.now()
      void this.persistFile(filePath)
    },

    deleteReply(filePath: string, commentId: string, replyId: string): void {
      const comment = this.commentsByFile[filePath]?.find((item) => item.id === commentId)
      const reply = comment?.replies.find((item) => item.id === replyId)
      if (!comment || !reply || reply.author !== 'user') return
      comment.replies = comment.replies.filter((item) => item.id !== replyId)
      comment.updatedAt = Date.now()
      void this.persistFile(filePath)
    },

    deleteComment(filePath: string, id: string): Promise<void> {
      const comments = this.commentsByFile[filePath]
      if (!comments) return Promise.resolve()
      this.commentsByFile[filePath] = comments.filter((item) => item.id !== id)
      return this.persistFile(filePath)
    }
  }
})
