import { copyFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { CommentService, StaleCommentDocumentError } from 'main_renderer/comments/CommentService'
import type { AnnotaMDCommentRecord } from '@shared/types/comments'

const tempDirectories: string[] = []

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'annotamd-comments-'))
  tempDirectories.push(directory)
  return directory
}

const selectionComment = (filePath: string): AnnotaMDCommentRecord => ({
  id: 'comment-1',
  filePath,
  scope: 'selection',
  quote: 'same',
  exactQuote: 'same',
  body: '请修改',
  resolved: false,
  agentReadable: false,
  createdAt: 1,
  updatedAt: 1,
  replies: [],
  anchor: { key: '0/text', path: [0, 'text'], offset: 0 },
  focus: { key: '0/text', path: [0, 'text'], offset: 4 },
  isCrossBlock: false
})

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('AnnotaMD SQLite comment storage', () => {
  it('preserves comments when the same file is renamed', () => {
    const directory = createTempDirectory()
    const originalPath = join(directory, 'original.md')
    const renamedPath = join(directory, 'renamed.md')
    writeFileSync(originalPath, 'same')
    const service = new CommentService({ databasePath: join(directory, 'comments.sqlite') })

    const loaded = service.load(originalPath, 'same')
    service.replace({
      filePath: originalPath,
      markdown: 'same',
      expectedRevision: loaded.revision,
      comments: [selectionComment(originalPath)]
    })
    renameSync(originalPath, renamedPath)
    expect(service.listInbox()).toEqual([])

    const renamed = service.load(renamedPath, 'same')
    expect(renamed.documentId).toBe(loaded.documentId)
    expect(renamed.comments).toHaveLength(1)
    expect(renamed.comments[0].filePath).toBe(renamedPath)
    service.close()
  })

  it('does not copy comments to a new file with identical content', () => {
    const directory = createTempDirectory()
    const originalPath = join(directory, 'original.md')
    const copiedPath = join(directory, 'copied.md')
    writeFileSync(originalPath, 'same')
    copyFileSync(originalPath, copiedPath)
    const service = new CommentService({ databasePath: join(directory, 'comments.sqlite') })

    const loaded = service.load(originalPath, 'same')
    service.replace({
      filePath: originalPath,
      markdown: 'same',
      expectedRevision: loaded.revision,
      comments: [selectionComment(originalPath)]
    })

    const copied = service.load(copiedPath, 'same')
    expect(copied.documentId).not.toBe(loaded.documentId)
    expect(copied.comments).toEqual([])
    service.close()
  })

  it('rejects a stale renderer write instead of overwriting newer comments', () => {
    const directory = createTempDirectory()
    const filePath = join(directory, 'document.md')
    writeFileSync(filePath, 'same')
    const service = new CommentService({ databasePath: join(directory, 'comments.sqlite') })
    const loaded = service.load(filePath, 'same')

    service.replace({
      filePath,
      markdown: 'same',
      expectedRevision: loaded.revision,
      comments: [selectionComment(filePath)]
    })

    expect(() => service.replace({
      filePath,
      markdown: 'same',
      expectedRevision: loaded.revision,
      comments: []
    })).toThrow(StaleCommentDocumentError)
    service.close()
  })

  it('hides deleted documents immediately and removes them after seven days', () => {
    const directory = createTempDirectory()
    const filePath = join(directory, 'document.md')
    writeFileSync(filePath, 'same')
    let now = 1_000
    const service = new CommentService({
      databasePath: join(directory, 'comments.sqlite'),
      now: () => now,
      missingRetentionMs: 7 * 24 * 60 * 60 * 1000
    })
    const loaded = service.load(filePath, 'same')
    service.replace({
      filePath,
      markdown: 'same',
      expectedRevision: loaded.revision,
      comments: [selectionComment(filePath)]
    })
    rmSync(filePath)
    expect(service.listInbox()).toEqual([])
    now += 7 * 24 * 60 * 60 * 1000 + 1

    expect(service.cleanupMissing()).toBe(1)
    service.close()
  })

  it('exposes all inbox threads when the global MCP service is enabled', () => {
    const directory = createTempDirectory()
    const filePath = join(directory, 'document.md')
    writeFileSync(filePath, 'same')
    const service = new CommentService({ databasePath: join(directory, 'comments.sqlite') })
    const loaded = service.load(filePath, 'same')
    const saved = service.replace({
      filePath,
      markdown: 'same',
      expectedRevision: loaded.revision,
      comments: [selectionComment(filePath)]
    })

    expect(service.listInbox()).toMatchObject([{
      documentId: loaded.documentId,
      localEndingCount: 1,
      unresolvedCount: 1
    }])
    expect(saved.comments[0]).not.toHaveProperty('agentReadable')
    const replied = service.reply('comment-1', '已经处理', 'agent', saved.revision)
    expect(replied.comment.replies[0]).toMatchObject({
      body: '已经处理',
      author: 'agent'
    })
    expect(replied.document.revision).toBe(saved.revision + 1)
    expect(service.listInbox()).toEqual([])

    const resolved = service.setResolved('comment-1', true, replied.document.revision)
    const followedUp = service.reply(
      'comment-1',
      '还有一个问题',
      'user',
      resolved.document.revision
    )
    expect(followedUp.comment.resolved).toBe(true)
    expect(service.listInbox()).toMatchObject([{
      documentId: loaded.documentId,
      localEndingCount: 1,
      unresolvedCount: 0
    }])
    service.close()
  })
})
