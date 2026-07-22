import { createHash, randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { DatabaseSync, type StatementResultingChanges } from 'node:sqlite'
import type {
  AnnotaMDCommentDocument,
  AnnotaMDCommentDetails,
  AnnotaMDCommentIndex,
  AnnotaMDCommentRecord,
  AnnotaMDCommentReplyResult,
  AnnotaMDCommentReplaceRequest,
  AnnotaMDLegacyCommentMigration,
  AnnotaMDCommentMigrationResult,
  AnnotaMDCommentThread,
  AnnotaMDCommentAuthor
} from '@shared/types/comments'

const DAY_MS = 24 * 60 * 60 * 1000

interface CommentServiceOptions {
  databasePath: string
  now?: () => number
  missingRetentionMs?: number
}

interface DocumentRow {
  id: string
  path: string
  device: string | null
  inode: string | null
  revision: number
  snapshot: Uint8Array | null
}

interface CommentRow {
  id: string
  document_id: string
  scope: 'selection' | 'document'
  quote: string
  exact_quote: string | null
  body: string
  resolved: number
  agent_readable: number
  anchor_path: string | null
  anchor_offset: number | null
  focus_path: string | null
  focus_offset: number | null
  is_cross_block: number | null
  created_at: number
  updated_at: number
}

interface MessageRow {
  id: string
  comment_id: string
  body: string
  author: 'user' | 'agent'
  created_at: number
}

export class StaleCommentDocumentError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Comment document changed (current revision: ${currentRevision})`)
    this.name = 'StaleCommentDocumentError'
  }
}

export class CommentService {
  private readonly db: DatabaseSync
  private readonly now: () => number
  private readonly missingRetentionMs: number

  constructor(options: CommentServiceOptions) {
    this.db = new DatabaseSync(options.databasePath)
    this.now = options.now ?? Date.now
    this.missingRetentionMs = options.missingRetentionMs ?? 7 * DAY_MS
    this.initialize()
  }

  close(): void {
    this.db.close()
  }

  load(filePath: string, markdown = ''): AnnotaMDCommentDocument {
    this.cleanupMissing()
    const document = this.findOrCreateDocument(filePath, markdown)
    return this.toDocument(document)
  }

  listComments(filePath: string): AnnotaMDCommentIndex | null {
    this.refreshMissingDocuments()
    const row = this.findExistingDocument(filePath)
    if (!row) return null
    const comments = this.toDocument(row).comments
    const items = comments.map((comment) => {
      const lastReply = comment.replies.at(-1)
      const lastAuthor = lastReply?.author ?? 'user'
      const lastMessage = lastReply?.body ?? comment.body
      return {
        commentId: comment.id,
        scope: comment.scope,
        quotePreview: this.preview(comment.exactQuote ?? comment.quote),
        anchor: comment.anchor,
        focus: comment.focus,
        isCrossBlock: comment.isCrossBlock,
        messageCount: comment.replies.length + 1,
        lastAuthor,
        lastMessageAt: lastReply?.createdAt ?? comment.createdAt,
        lastMessagePreview: this.preview(lastMessage)
      }
    })
    return {
      filePath: row.path,
      revision: row.revision,
      commentCount: items.length,
      localEndingCommentCount: items.filter((comment) => comment.lastAuthor === 'user').length,
      comments: items
    }
  }

  getComment(commentId: string): AnnotaMDCommentThread | null {
    this.refreshMissingDocuments()
    const row = this.db.prepare(`
      SELECT d.id, d.path, d.device, d.inode, d.revision, d.snapshot
      FROM documents d JOIN comments c ON c.document_id = d.id
      WHERE c.id = ? AND d.missing_since IS NULL
    `).get(commentId) as DocumentRow | undefined
    if (!row) return null
    const comment = this.toDocument(row).comments.find((item) => item.id === commentId)
    return comment ? {
      document: { documentId: row.id, filePath: row.path, revision: row.revision },
      comment
    } : null
  }

  getComments(commentIds: string[]): AnnotaMDCommentDetails {
    const comments: AnnotaMDCommentRecord[] = []
    const missingCommentIds: string[] = []
    let filePath: string | undefined
    let revision: number | undefined
    for (const commentId of commentIds) {
      const thread = this.getComment(commentId)
      if (!thread) {
        missingCommentIds.push(commentId)
        continue
      }
      if (filePath && thread.document.filePath !== filePath) {
        throw new Error('All requested comments must belong to the same Markdown file')
      }
      filePath = thread.document.filePath
      revision = thread.document.revision
      comments.push(thread.comment)
    }
    return { filePath, revision, comments, missingCommentIds }
  }

  reply(
    commentId: string,
    body: string,
    author: AnnotaMDCommentAuthor,
    expectedRevision: number
  ): AnnotaMDCommentReplyResult {
    const thread = this.requireThread(commentId, expectedRevision)
    const now = this.now()
    const reply = { id: randomUUID(), body: body.trim(), author, createdAt: now }
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO messages (id, comment_id, body, author, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(reply.id, commentId, reply.body, reply.author, reply.createdAt)
      this.bumpDocumentRevision(thread.document.documentId, expectedRevision + 1, now)
      this.db.prepare('UPDATE comments SET updated_at = ? WHERE id = ?').run(now, commentId)
    })
    return {
      filePath: thread.document.filePath,
      revision: expectedRevision + 1,
      commentId,
      reply
    }
  }

  replace(request: AnnotaMDCommentReplaceRequest): AnnotaMDCommentDocument {
    const document = this.findOrCreateDocument(request.filePath, request.markdown)
    if (document.revision !== request.expectedRevision) {
      throw new StaleCommentDocumentError(document.revision)
    }

    const nextRevision = document.revision + 1
    const now = this.now()
    this.transaction(() => {
      this.db.prepare('DELETE FROM documents WHERE path = ? AND id <> ?')
        .run(request.filePath, document.id)
      this.db.prepare('DELETE FROM comments WHERE document_id = ?').run(document.id)
      for (const comment of request.comments) {
        if (!comment.resolved) this.insertComment(document.id, comment)
      }
      this.db.prepare(`
        UPDATE documents
        SET revision = ?, snapshot = ?, content_hash = ?, missing_since = NULL, updated_at = ?
        WHERE id = ?
      `).run(
        nextRevision,
        this.compress(request.markdown),
        this.hash(request.markdown),
        now,
        document.id
      )
    })

    return this.toDocument({ ...document, revision: nextRevision })
  }

  migrate(entries: AnnotaMDLegacyCommentMigration[]): AnnotaMDCommentMigrationResult {
    let migrated = 0
    let skipped = 0
    for (const entry of entries) {
      if (!existsSync(entry.filePath)) {
        skipped += entry.comments.length
        continue
      }
      const document = this.load(entry.filePath, entry.markdown)
      if (document.comments.length) {
        skipped += entry.comments.length
        continue
      }
      this.replace({
        filePath: entry.filePath,
        markdown: entry.markdown,
        expectedRevision: document.revision,
        comments: entry.comments
      })
      migrated += entry.comments.length
    }
    return { migrated, skipped }
  }

  markMissing(filePath: string): void {
    this.db.prepare(`
      UPDATE documents SET missing_since = COALESCE(missing_since, ?), updated_at = ?
      WHERE path = ? AND missing_since IS NULL
    `).run(this.now(), this.now(), filePath)
  }

  cleanupMissing(): number {
    const result = this.db.prepare(`
      DELETE FROM documents
      WHERE missing_since IS NOT NULL AND missing_since <= ?
    `).run(this.now() - this.missingRetentionMs)
    return Number((result as StatementResultingChanges).changes)
  }

  private refreshMissingDocuments(): void {
    const now = this.now()
    const rows = this.db.prepare(`
      SELECT id, path FROM documents WHERE missing_since IS NULL
    `).all() as Array<{ id: string; path: string }>
    const update = this.db.prepare(`
      UPDATE documents SET missing_since = ?, updated_at = ? WHERE id = ?
    `)
    for (const row of rows) {
      if (!existsSync(row.path)) update.run(now, now, row.id)
    }
    this.cleanupMissing()
  }

  readSnapshot(documentId: string): string | null {
    const row = this.db.prepare('SELECT snapshot FROM documents WHERE id = ?')
      .get(documentId) as { snapshot?: Uint8Array | null } | undefined
    return row?.snapshot ? gunzipSync(row.snapshot).toString('utf8') : null
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        device TEXT,
        inode TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT,
        snapshot BLOB,
        missing_since INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS documents_path_idx ON documents(path);
      CREATE INDEX IF NOT EXISTS documents_identity_idx ON documents(device, inode);
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        quote TEXT NOT NULL,
        exact_quote TEXT,
        body TEXT NOT NULL,
        resolved INTEGER NOT NULL,
        agent_readable INTEGER NOT NULL,
        anchor_path TEXT,
        anchor_offset INTEGER,
        focus_path TEXT,
        focus_offset INTEGER,
        is_cross_block INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS comments_document_idx ON comments(document_id);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_comment_idx ON messages(comment_id);
    `)
    this.purgeResolvedComments()
    this.cleanupMissing()
  }

  private purgeResolvedComments(): void {
    const documents = this.db.prepare(`
      SELECT DISTINCT document_id FROM comments WHERE resolved = 1
    `).all() as Array<{ document_id: string }>
    if (!documents.length) return
    const now = this.now()
    this.transaction(() => {
      this.db.prepare('DELETE FROM comments WHERE resolved = 1').run()
      const update = this.db.prepare(`
        UPDATE documents SET revision = revision + 1, updated_at = ? WHERE id = ?
      `)
      for (const document of documents) update.run(now, document.document_id)
    })
  }

  private requireThread(commentId: string, expectedRevision: number): AnnotaMDCommentThread {
    const thread = this.getComment(commentId)
    if (!thread) throw new Error(`Comment not found: ${commentId}`)
    if (thread.document.revision !== expectedRevision) {
      throw new StaleCommentDocumentError(thread.document.revision)
    }
    return thread
  }

  private bumpDocumentRevision(documentId: string, revision: number, now: number): void {
    this.db.prepare('UPDATE documents SET revision = ?, updated_at = ? WHERE id = ?')
      .run(revision, now, documentId)
  }

  private findOrCreateDocument(filePath: string, markdown: string): DocumentRow {
    const identity = this.fileIdentity(filePath)
    let row: DocumentRow | undefined

    if (identity) {
      row = this.db.prepare(`
        SELECT id, path, device, inode, revision, snapshot
        FROM documents
        WHERE device = ? AND inode = ?
        ORDER BY (missing_since IS NULL) DESC, updated_at DESC LIMIT 1
      `).get(identity.device, identity.inode) as DocumentRow | undefined
    }

    if (!row) {
      row = this.db.prepare(`
        SELECT id, path, device, inode, revision, snapshot
        FROM documents
        WHERE path = ? AND missing_since IS NULL
        ORDER BY updated_at DESC LIMIT 1
      `).get(filePath) as DocumentRow | undefined
    }

    if (row) {
      if (row.path !== filePath
        || row.device !== (identity?.device ?? null)
        || row.inode !== (identity?.inode ?? null)) {
        this.db.prepare(`
          UPDATE documents
          SET path = ?, device = ?, inode = ?, missing_since = NULL, updated_at = ?
          WHERE id = ?
        `).run(
          filePath,
          identity?.device ?? null,
          identity?.inode ?? null,
          this.now(),
          row.id
        )
        row.path = filePath
        row.device = identity?.device ?? null
        row.inode = identity?.inode ?? null
      } else {
        this.db.prepare(`
          UPDATE documents SET missing_since = NULL, updated_at = ? WHERE id = ?
        `).run(this.now(), row.id)
      }
      return row
    }

    const now = this.now()
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO documents (
        id, path, device, inode, revision, content_hash, snapshot,
        missing_since, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?, ?)
    `).run(
      id,
      filePath,
      identity?.device ?? null,
      identity?.inode ?? null,
      this.hash(markdown),
      this.compress(markdown),
      now,
      now
    )
    return {
      id,
      path: filePath,
      device: identity?.device ?? null,
      inode: identity?.inode ?? null,
      revision: 0,
      snapshot: this.compress(markdown)
    }
  }

  private findExistingDocument(filePath: string): DocumentRow | null {
    if (!existsSync(filePath)) return null
    const identity = this.fileIdentity(filePath)
    let row = identity
      ? this.db.prepare(`
          SELECT id, path, device, inode, revision, snapshot
          FROM documents
          WHERE device = ? AND inode = ? AND missing_since IS NULL
          ORDER BY updated_at DESC LIMIT 1
        `).get(identity.device, identity.inode) as DocumentRow | undefined
      : undefined
    if (!row) {
      row = this.db.prepare(`
          SELECT id, path, device, inode, revision, snapshot
          FROM documents
          WHERE path = ? AND missing_since IS NULL
          ORDER BY updated_at DESC LIMIT 1
        `).get(filePath) as DocumentRow | undefined
    }
    return row ?? null
  }

  private toDocument(row: DocumentRow): AnnotaMDCommentDocument {
    const comments = this.db.prepare(`
      SELECT * FROM comments WHERE document_id = ? ORDER BY created_at DESC
    `).all(row.id) as unknown as CommentRow[]
    const messageStatement = this.db.prepare(`
      SELECT * FROM messages WHERE comment_id = ? ORDER BY created_at ASC, rowid ASC
    `)

    return {
      documentId: row.id,
      filePath: row.path,
      revision: row.revision,
      comments: comments.map((comment) => {
        const replies = messageStatement.all(comment.id) as unknown as MessageRow[]
        return {
          id: comment.id,
          filePath: row.path,
          scope: comment.scope,
          quote: comment.quote,
          exactQuote: comment.exact_quote ?? undefined,
          body: comment.body,
          resolved: Boolean(comment.resolved),
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          replies: replies.map((reply) => ({
            id: reply.id,
            body: reply.body,
            author: reply.author,
            createdAt: reply.created_at
          })),
          anchor: this.readAnchor(comment.anchor_path, comment.anchor_offset),
          focus: this.readAnchor(comment.focus_path, comment.focus_offset),
          isCrossBlock: comment.is_cross_block == null
            ? undefined
            : Boolean(comment.is_cross_block)
        }
      })
    }
  }

  private insertComment(documentId: string, comment: AnnotaMDCommentRecord): void {
    this.db.prepare(`
      INSERT INTO comments (
        id, document_id, scope, quote, exact_quote, body, resolved,
        agent_readable, anchor_path, anchor_offset, focus_path, focus_offset,
        is_cross_block, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      comment.id,
      documentId,
      comment.scope,
      comment.quote,
      comment.exactQuote ?? null,
      comment.body,
      comment.resolved ? 1 : 0,
      comment.agentReadable !== false ? 1 : 0,
      this.writeAnchor(comment.anchor),
      comment.anchor?.offset ?? null,
      this.writeAnchor(comment.focus),
      comment.focus?.offset ?? null,
      comment.isCrossBlock == null ? null : comment.isCrossBlock ? 1 : 0,
      comment.createdAt,
      comment.updatedAt
    )
    const statement = this.db.prepare(`
      INSERT INTO messages (id, comment_id, body, author, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const reply of comment.replies) {
      statement.run(reply.id, comment.id, reply.body, reply.author, reply.createdAt)
    }
  }

  private readAnchor(path: string | null, offset: number | null) {
    if (!path || offset == null) return undefined
    const parsed = JSON.parse(path) as Array<string | number>
    return { key: parsed.join('/'), path: parsed, offset }
  }

  private writeAnchor(anchor: AnnotaMDCommentRecord['anchor']): string | null {
    if (!anchor) return null
    const path = anchor.path ?? anchor.key.split('/').map((segment) => {
      const numeric = Number(segment)
      return Number.isInteger(numeric) && String(numeric) === segment ? numeric : segment
    })
    return JSON.stringify(path)
  }

  private fileIdentity(filePath: string): { device: string; inode: string } | null {
    if (!existsSync(filePath)) return null
    const stat = statSync(filePath, { bigint: true })
    if (stat.ino === 0n) return null
    return { device: String(stat.dev), inode: String(stat.ino) }
  }

  private hash(markdown: string): string {
    return createHash('sha256').update(markdown).digest('hex')
  }

  private compress(markdown: string): Buffer {
    return gzipSync(Buffer.from(markdown, 'utf8'))
  }

  private preview(value: string, limit = 160): string {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      work()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
