import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  AiConfigInput,
  AiConfigSummary,
  AiChangeSet,
  AiChangeSetStatus,
  AiConversation,
  AiConversationStatus,
  AiEffortSelection,
  AiMessage,
  AiMessageRole,
  AiMessageStatus,
  AiPermissionMode,
  AiProviderId,
  AiTemplate,
  AiWorkspacePreferences,
  AiWorkspaceMode
} from '@shared/types/aiWorkspace'
import {
  AI_MAX_API_RETRIES_DEFAULT,
  AI_MAX_API_RETRIES_MAX,
  AI_MAX_API_RETRIES_MIN
} from '@shared/types/aiWorkspace'
import type { AiSecretStore } from './AiSecretStore'

interface AiConfigRow {
  id: string
  name: string
  kind: 'api' | 'cli'
  provider: AiProviderId
  base_url: string | null
  api_style: string | null
  auth_method: string | null
  executable_path: string | null
  environment_json: string | null
  default_model_id: string | null
  supports_native_resume: number
  is_default: number
  enabled: number
  secret_ref: string | null
  created_at: number
  updated_at: number
}

interface AiConversationRow {
  id: string
  title: string
  mode: AiWorkspaceMode
  config_id: string | null
  provider: AiProviderId | null
  model_id: string | null
  effort_json: string | null
  permission_mode: AiPermissionMode | null
  template_ids_json: string
  workspace_path: string | null
  native_session_id: string | null
  native_session_file: string | null
  status: AiConversationStatus
  created_at: number
  updated_at: number
}

interface AiMessageRow {
  id: string
  conversation_id: string
  role: AiMessageRole
  content: string
  status: AiMessageStatus
  created_at: number
  tool_call_id: string | null
  tool_name: string | null
}

interface AiTemplateRow {
  id: string
  name: string
  content: string
  created_at: number
  updated_at: number
}

interface AiChangeSetRow {
  id: string
  conversation_id: string
  turn_id: string
  document_id: string
  document_uri: string
  file_path: string | null
  original_content: string
  applied_content: string
  status: AiChangeSetStatus
  additions: number
  deletions: number
  created_at: number
  resolved_at: number | null
  message: string | null
  transaction_json: string | null
}

export interface AiRuntimeConfig {
  id: string
  name: string
  kind: 'api' | 'cli'
  provider: AiProviderId
  baseUrl?: string
  apiStyle?: import('@shared/types/aiWorkspace').AiApiStyle
  authMethod?: import('@shared/types/aiWorkspace').AiApiAuthMethod
  executablePath?: string
  environment?: Record<string, string>
  defaultModelId?: string
  supportsNativeResume?: boolean
  secret?: string
  isDefault: boolean
  enabled: boolean
}

export interface AiConfigSaveRequest {
  id?: string
  input: AiConfigInput
  isDefault?: boolean
  enabled?: boolean
}

export interface AiConversationCreateRequest {
  title: string
  mode: AiWorkspaceMode
  configId?: string
  provider?: AiProviderId
  modelId?: string
  effort?: AiEffortSelection
  permissionMode?: AiPermissionMode
  templateIds?: string[]
  workspacePath?: string
}

export interface AiTemplateSaveRequest {
  id?: string
  name: string
  content: string
}

export interface AiStoreOptions {
  databasePath: string
  secrets: AiSecretStore
  now?: () => number
  createId?: () => string
}

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const optionalText = (value: string | undefined): string | null => value?.trim() || null

const API_PROVIDERS = [
  'claude',
  'openai',
  'gemini',
  'deepseek',
  'qwen',
  'minimax',
  'ollama',
  'anthropic-compatible',
  'openai-compatible',
  'custom',
  'anthropic-messages'
] as const

export class AiStore {
  private readonly db: DatabaseSync
  private readonly secrets: AiSecretStore
  private readonly now: () => number
  private readonly createId: () => string

  constructor(options: AiStoreOptions) {
    this.db = new DatabaseSync(options.databasePath)
    this.secrets = options.secrets
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
    this.initialize()
  }

  close(): void {
    this.db.close()
  }

  async listConfigSummaries(): Promise<AiConfigSummary[]> {
    const rows = this.db.prepare(`
      SELECT * FROM ai_configs ORDER BY is_default DESC, updated_at DESC, id ASC
    `).all() as unknown as AiConfigRow[]
    return await Promise.all(rows.map(row => this.toConfigSummary(row)))
  }

  async saveConfig(request: AiConfigSaveRequest): Promise<AiConfigSummary> {
    this.validateConfig(request.input)
    const now = this.now()
    const id = request.id ?? this.createId()
    const existing = this.getConfigRow(id)
    const enabled = request.enabled ?? existing?.enabled !== 0
    const shouldDefault = enabled && (request.isDefault ?? (
      existing?.kind === request.input.kind
        ? existing.is_default === 1
        : !this.hasDefaultConfig(request.input.kind)
    ))
    const secretRef = request.input.kind === 'api' ? `config:${id}` : null
    if (shouldDefault) {
      this.db.prepare('UPDATE ai_configs SET is_default = 0 WHERE kind = ?')
        .run(request.input.kind)
    }
    this.db.prepare(`
      INSERT INTO ai_configs (
        id, name, kind, provider, base_url, api_style, auth_method, executable_path, environment_json, default_model_id,
        supports_native_resume, is_default, enabled, secret_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        kind = excluded.kind,
        provider = excluded.provider,
        base_url = excluded.base_url,
        api_style = excluded.api_style,
        auth_method = excluded.auth_method,
        executable_path = excluded.executable_path,
        environment_json = excluded.environment_json,
        default_model_id = excluded.default_model_id,
        supports_native_resume = excluded.supports_native_resume,
        is_default = excluded.is_default,
        enabled = excluded.enabled,
        secret_ref = excluded.secret_ref,
        updated_at = excluded.updated_at
    `).run(
      id,
      request.input.name.trim(),
      request.input.kind,
      request.input.provider,
      request.input.kind === 'api' ? request.input.baseUrl.trim() : null,
      request.input.kind === 'api' ? optionalText(request.input.apiStyle) : null,
      request.input.kind === 'api' ? optionalText(request.input.authMethod) : null,
      request.input.kind === 'cli' ? optionalText(request.input.executablePath) : null,
      request.input.kind === 'cli' ? JSON.stringify(request.input.environment ?? {}) : null,
      optionalText(request.input.defaultModelId),
      request.input.kind === 'cli' && request.input.supportsNativeResume ? 1 : 0,
      shouldDefault ? 1 : 0,
      enabled ? 1 : 0,
      secretRef,
      existing?.created_at ?? now,
      now
    )

    if (request.input.kind === 'api' && request.input.apiKey !== undefined) {
      if (request.input.apiKey.trim()) await this.secrets.set(secretRef!, request.input.apiKey.trim())
      else await this.secrets.delete(secretRef!)
    } else if (request.input.kind === 'cli' && existing?.secret_ref) {
      await this.secrets.delete(existing.secret_ref)
    }
    if (existing && existing.kind !== request.input.kind && existing.is_default === 1) {
      this.ensureDefaultConfig(existing.kind)
    }
    if (!shouldDefault && existing?.is_default === 1) {
      this.ensureDefaultConfig(request.input.kind)
    }
    const row = this.requireConfigRow(id)
    return await this.toConfigSummary(row)
  }

  async deleteConfig(id: string): Promise<boolean> {
    const row = this.getConfigRow(id)
    if (!row) return false
    this.db.prepare('DELETE FROM ai_configs WHERE id = ?').run(id)
    if (row.secret_ref) await this.secrets.delete(row.secret_ref)
    if (row.is_default) {
      this.ensureDefaultConfig(row.kind)
    }
    return true
  }

  async getRuntimeConfig(id?: string): Promise<AiRuntimeConfig | undefined> {
    const row = id
      ? this.getConfigRow(id)
      : this.db.prepare(`
          SELECT * FROM ai_configs WHERE enabled = 1
          ORDER BY is_default DESC, updated_at DESC LIMIT 1
        `).get() as unknown as AiConfigRow | undefined
    return row ? await this.toRuntimeConfig(row) : undefined
  }

  async getRuntimeConfigForKind(kind: 'api' | 'cli'): Promise<AiRuntimeConfig | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM ai_configs WHERE enabled = 1 AND kind = ?
      ORDER BY is_default DESC, updated_at DESC LIMIT 1
    `).get(kind) as unknown as AiConfigRow | undefined
    return row ? await this.toRuntimeConfig(row) : undefined
  }

  private async toRuntimeConfig(row: AiConfigRow): Promise<AiRuntimeConfig> {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      provider: row.provider,
      ...(row.base_url ? { baseUrl: row.base_url } : {}),
      ...(row.api_style ? { apiStyle: row.api_style as import('@shared/types/aiWorkspace').AiApiStyle } : {}),
      ...(row.auth_method ? { authMethod: row.auth_method as import('@shared/types/aiWorkspace').AiApiAuthMethod } : {}),
      ...(row.executable_path ? { executablePath: row.executable_path } : {}),
      ...(row.kind === 'cli'
        ? { environment: parseJson<Record<string, string>>(row.environment_json, {}) }
        : {}),
      ...(row.default_model_id ? { defaultModelId: row.default_model_id } : {}),
      ...(row.kind === 'cli' ? { supportsNativeResume: row.supports_native_resume === 1 } : {}),
      ...(row.secret_ref ? { secret: await this.secrets.get(row.secret_ref) ?? undefined } : {}),
      isDefault: row.is_default === 1,
      enabled: row.enabled === 1
    }
  }

  listConversations(): AiConversation[] {
    const rows = this.db.prepare(`
      SELECT * FROM ai_conversations ORDER BY updated_at DESC, id ASC
    `).all() as unknown as AiConversationRow[]
    return rows.map(row => this.toConversation(row))
  }

  getConversation(id: string): AiConversation | undefined {
    const row = this.db.prepare('SELECT * FROM ai_conversations WHERE id = ?')
      .get(id) as unknown as AiConversationRow | undefined
    return row ? this.toConversation(row) : undefined
  }

  createConversation(request: AiConversationCreateRequest): AiConversation {
    const id = this.createId()
    const now = this.now()
    this.db.prepare(`
      INSERT INTO ai_conversations (
        id, title, mode, config_id, provider, model_id, effort_json, permission_mode, template_ids_json,
        workspace_path, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)
    `).run(
      id,
      request.title.trim() || 'New conversation',
      request.mode,
      request.configId ?? null,
      request.provider ?? null,
      request.modelId ?? null,
      request.effort ? JSON.stringify(request.effort) : null,
      request.permissionMode ?? 'request',
      JSON.stringify(request.templateIds ?? []),
      optionalText(request.workspacePath),
      now,
      now
    )
    return this.requireConversation(id)
  }

  saveConversation(conversation: AiConversation): AiConversation {
    this.db.prepare(`
      UPDATE ai_conversations SET
        title = ?, mode = ?, config_id = ?, provider = ?, model_id = ?, effort_json = ?, permission_mode = ?,
        template_ids_json = ?, workspace_path = ?, native_session_id = ?, native_session_file = ?,
        status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      conversation.title,
      conversation.mode,
      conversation.configId ?? null,
      conversation.provider ?? null,
      conversation.modelId ?? null,
      conversation.effort ? JSON.stringify(conversation.effort) : null,
      conversation.permissionMode ?? 'request',
      JSON.stringify(conversation.templateIds),
      optionalText(conversation.workspacePath),
      conversation.nativeSessionId ?? null,
      conversation.nativeSessionFile ?? null,
      conversation.status,
      conversation.updatedAt,
      conversation.id
    )
    return this.requireConversation(conversation.id)
  }

  updateConversationStatus(id: string, status: AiConversationStatus): AiConversation {
    this.db.prepare(`
      UPDATE ai_conversations SET status = ?, updated_at = ? WHERE id = ?
    `).run(status, this.now(), id)
    return this.requireConversation(id)
  }

  renameConversation(id: string, title: string): AiConversation {
    this.db.prepare(`
      UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?
    `).run(title, this.now(), id)
    return this.requireConversation(id)
  }

  deleteConversation(id: string): boolean {
    const changes = this.db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(id).changes
    if (this.getActiveConversationId() === id) this.setActiveConversationId(undefined)
    return Number(changes) > 0
  }

  getActiveConversationId(): string | undefined {
    const row = this.db.prepare(`SELECT value FROM ai_meta WHERE key = 'active_conversation_id'`)
      .get() as { value: string } | undefined
    return row?.value || undefined
  }

  setActiveConversationId(id?: string): void {
    if (!id) {
      this.db.prepare(`DELETE FROM ai_meta WHERE key = 'active_conversation_id'`).run()
      return
    }
    if (!this.getConversation(id)) throw new Error(`AI conversation ${id} was not found.`)
    this.db.prepare(`
      INSERT INTO ai_meta (key, value) VALUES ('active_conversation_id', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(id)
  }

  getPreferences(): AiWorkspacePreferences {
    const row = this.db.prepare(`SELECT value FROM ai_meta WHERE key = 'max_api_retries'`)
      .get() as { value: string } | undefined
    const parsed = Number(row?.value)
    return {
      maxApiRetries: Number.isInteger(parsed)
        ? Math.min(AI_MAX_API_RETRIES_MAX, Math.max(AI_MAX_API_RETRIES_MIN, parsed))
        : AI_MAX_API_RETRIES_DEFAULT
    }
  }

  savePreferences(preferences: AiWorkspacePreferences): AiWorkspacePreferences {
    if (
      !Number.isInteger(preferences.maxApiRetries) ||
      preferences.maxApiRetries < AI_MAX_API_RETRIES_MIN ||
      preferences.maxApiRetries > AI_MAX_API_RETRIES_MAX
    ) {
      throw new Error(
        `API retry count must be an integer from ${AI_MAX_API_RETRIES_MIN} to ${AI_MAX_API_RETRIES_MAX}.`
      )
    }
    this.db.prepare(`
      INSERT INTO ai_meta (key, value) VALUES ('max_api_retries', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(preferences.maxApiRetries))
    return this.getPreferences()
  }

  listMessages(conversationId: string): AiMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY ordinal ASC
    `).all(conversationId) as unknown as AiMessageRow[]
    return rows.map(row => this.toMessage(row))
  }

  getMessage(id: string): AiMessage | undefined {
    const row = this.db.prepare('SELECT * FROM ai_messages WHERE id = ?')
      .get(id) as unknown as AiMessageRow | undefined
    return row ? this.toMessage(row) : undefined
  }

  addMessage(input: Omit<AiMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): AiMessage {
    const id = input.id ?? this.createId()
    const createdAt = input.createdAt ?? this.now()
    const ordinal = (this.db.prepare(`
      SELECT COALESCE(MAX(ordinal), 0) + 1 AS value FROM ai_messages WHERE conversation_id = ?
    `).get(input.conversationId) as { value: number }).value
    this.db.prepare(`
      INSERT INTO ai_messages (
        id, conversation_id, role, content, status, created_at, ordinal, tool_call_id, tool_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.conversationId,
      input.role,
      input.content,
      input.status,
      createdAt,
      ordinal,
      input.toolCallId ?? null,
      input.toolName ?? null
    )
    return this.getMessage(id)!
  }

  updateMessage(id: string, patch: Partial<Pick<AiMessage, 'content' | 'status' | 'toolName'>>): AiMessage {
    const current = this.getMessage(id)
    if (!current) throw new Error(`AI message ${id} was not found.`)
    this.db.prepare(`
      UPDATE ai_messages SET content = ?, status = ?, tool_name = ? WHERE id = ?
    `).run(
      patch.content ?? current.content,
      patch.status ?? current.status,
      patch.toolName ?? current.toolName ?? null,
      id
    )
    return this.getMessage(id)!
  }

  listTemplates(): AiTemplate[] {
    const rows = this.db.prepare('SELECT * FROM ai_templates ORDER BY updated_at DESC, id ASC')
      .all() as unknown as AiTemplateRow[]
    return rows.map(row => this.toTemplate(row))
  }

  saveTemplate(request: AiTemplateSaveRequest): AiTemplate {
    const id = request.id ?? this.createId()
    const now = this.now()
    const existing = this.db.prepare('SELECT created_at FROM ai_templates WHERE id = ?')
      .get(id) as { created_at: number } | undefined
    this.db.prepare(`
      INSERT INTO ai_templates (id, name, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, content = excluded.content, updated_at = excluded.updated_at
    `).run(id, request.name.trim(), request.content, existing?.created_at ?? now, now)
    const row = this.db.prepare('SELECT * FROM ai_templates WHERE id = ?')
      .get(id) as unknown as AiTemplateRow
    return this.toTemplate(row)
  }

  deleteTemplate(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM ai_templates WHERE id = ?').run(id).changes) > 0
  }

  listChangeSets(conversationId: string): AiChangeSet[] {
    const rows = this.db.prepare(`
      SELECT * FROM ai_change_sets WHERE conversation_id = ? ORDER BY created_at ASC, id ASC
    `).all(conversationId) as unknown as AiChangeSetRow[]
    return rows.map(row => this.toChangeSet(row))
  }

  findPendingChangeSetForDocument(documentUri: string): AiChangeSet | undefined {
    const row = this.db.prepare(`
      SELECT * FROM ai_change_sets
      WHERE document_uri = ? AND status = 'applied-unreviewed'
      ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(documentUri) as unknown as AiChangeSetRow | undefined
    return row ? this.toChangeSet(row) : undefined
  }

  saveChangeSet(changeSet: AiChangeSet): AiChangeSet {
    this.db.prepare(`
      INSERT INTO ai_change_sets (
        id, conversation_id, turn_id, document_id, document_uri, file_path,
        original_content, applied_content, status, additions, deletions,
        created_at, resolved_at, message, transaction_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        applied_content = excluded.applied_content,
        status = excluded.status,
        additions = excluded.additions,
        deletions = excluded.deletions,
        resolved_at = excluded.resolved_at,
        message = excluded.message,
        transaction_json = excluded.transaction_json
    `).run(
      changeSet.id,
      changeSet.conversationId,
      changeSet.turnId,
      changeSet.documentId,
      changeSet.documentUri,
      changeSet.filePath ?? null,
      changeSet.originalContent,
      changeSet.appliedContent,
      changeSet.status,
      changeSet.additions,
      changeSet.deletions,
      changeSet.createdAt,
      changeSet.resolvedAt ?? null,
      changeSet.message ?? null,
      changeSet.transaction ? JSON.stringify(changeSet.transaction) : null
    )
    return this.requireChangeSet(changeSet.id)
  }

  updateChangeSetStatus(
    id: string,
    status: AiChangeSetStatus,
    message?: string
  ): AiChangeSet {
    const current = this.requireChangeSet(id)
    const resolvedAt = status === 'applied-unreviewed' ? null : this.now()
    this.db.prepare(`
      UPDATE ai_change_sets SET status = ?, resolved_at = ?, message = ? WHERE id = ?
    `).run(status, resolvedAt, message ?? current.message ?? null, id)
    return this.requireChangeSet(id)
  }

  getChangeSet(id: string): AiChangeSet | undefined {
    const row = this.db.prepare('SELECT * FROM ai_change_sets WHERE id = ?')
      .get(id) as unknown as AiChangeSetRow | undefined
    return row ? this.toChangeSet(row) : undefined
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS ai_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('api', 'cli')),
        provider TEXT NOT NULL,
        base_url TEXT,
        api_style TEXT,
        auth_method TEXT,
        executable_path TEXT,
        environment_json TEXT,
        default_model_id TEXT,
        supports_native_resume INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        secret_ref TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('ask', 'agent')),
        config_id TEXT REFERENCES ai_configs(id) ON DELETE SET NULL,
        provider TEXT,
        model_id TEXT,
        effort_json TEXT,
        permission_mode TEXT NOT NULL DEFAULT 'request',
        template_ids_json TEXT NOT NULL DEFAULT '[]',
        workspace_path TEXT,
        native_session_id TEXT,
        native_session_file TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT
      );
      CREATE INDEX IF NOT EXISTS ai_messages_conversation_ordinal
        ON ai_messages(conversation_id, ordinal);
      CREATE TABLE IF NOT EXISTS ai_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_change_sets (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        turn_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        document_uri TEXT NOT NULL,
        file_path TEXT,
        original_content TEXT NOT NULL,
        applied_content TEXT NOT NULL,
        status TEXT NOT NULL,
        additions INTEGER NOT NULL,
        deletions INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        message TEXT,
        transaction_json TEXT
      );
      CREATE INDEX IF NOT EXISTS ai_change_sets_conversation_created
        ON ai_change_sets(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS ai_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    const configColumns = this.db.prepare('PRAGMA table_info(ai_configs)').all() as unknown as Array<{ name: string }>
    if (!configColumns.some(column => column.name === 'api_style')) {
      this.db.exec('ALTER TABLE ai_configs ADD COLUMN api_style TEXT')
    }
    if (!configColumns.some(column => column.name === 'auth_method')) {
      this.db.exec('ALTER TABLE ai_configs ADD COLUMN auth_method TEXT')
    }
    if (!configColumns.some(column => column.name === 'environment_json')) {
      this.db.exec('ALTER TABLE ai_configs ADD COLUMN environment_json TEXT')
    }
    const conversationColumns = this.db.prepare('PRAGMA table_info(ai_conversations)')
      .all() as unknown as Array<{ name: string }>
    if (!conversationColumns.some(column => column.name === 'provider')) {
      this.db.exec('ALTER TABLE ai_conversations ADD COLUMN provider TEXT')
    }
    if (!conversationColumns.some(column => column.name === 'workspace_path')) {
      this.db.exec('ALTER TABLE ai_conversations ADD COLUMN workspace_path TEXT')
    }
    if (!conversationColumns.some(column => column.name === 'permission_mode')) {
      this.db.exec("ALTER TABLE ai_conversations ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'request'")
    }
    // No host process survives reopening the store, so persisted in-flight work is retryable failure.
    this.db.exec(`
      UPDATE ai_conversations SET status = 'failed' WHERE status = 'running';
      UPDATE ai_messages SET status = 'failed' WHERE status = 'streaming';
    `)
  }

  private validateConfig(input: AiConfigInput): void {
    if (!input.name.trim()) throw new Error('AI configuration name is required.')
    if (input.kind === 'api') {
      if (!(API_PROVIDERS as readonly string[]).includes(input.provider)) {
        throw new Error(`API configuration cannot use ${input.provider}.`)
      }
      let url: URL
      try {
        url = new URL(input.baseUrl)
      } catch {
        throw new Error('API base URL is invalid.')
      }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API base URL must use HTTP or HTTPS.')
      return
    }
    if (![
      'codex',
      'claude-code',
      'opencode',
      'pi',
      'cursor-cli',
      'grok-cli',
      'codebuddy-cli',
      'qoder-cli'
    ].includes(input.provider)) {
      throw new Error(`CLI configuration cannot use ${input.provider}.`)
    }
    if (input.executablePath?.trim() && !isAbsolute(input.executablePath.trim())) {
      throw new Error('Custom CLI executablePath must be an absolute path.')
    }
    for (const key of Object.keys(input.environment ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Invalid CLI environment variable name: ${key}`)
      }
    }
  }

  private getConfigRow(id: string): AiConfigRow | undefined {
    return this.db.prepare('SELECT * FROM ai_configs WHERE id = ?')
      .get(id) as unknown as AiConfigRow | undefined
  }

  private requireConfigRow(id: string): AiConfigRow {
    const row = this.getConfigRow(id)
    if (!row) throw new Error(`AI configuration ${id} was not found.`)
    return row
  }

  private hasDefaultConfig(kind: 'api' | 'cli'): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 AS found FROM ai_configs
      WHERE kind = ? AND enabled = 1 AND is_default = 1 LIMIT 1
    `).get(kind))
  }

  private ensureDefaultConfig(kind: 'api' | 'cli'): void {
    if (this.hasDefaultConfig(kind)) return
    this.db.prepare(`
      UPDATE ai_configs SET is_default = 1
      WHERE id = (
        SELECT id FROM ai_configs
        WHERE kind = ? AND enabled = 1
        ORDER BY updated_at DESC, id ASC LIMIT 1
      )
    `).run(kind)
  }

  private async toConfigSummary(row: AiConfigRow): Promise<AiConfigSummary> {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      provider: row.provider,
      isDefault: row.is_default === 1,
      enabled: row.enabled === 1,
      ...(row.base_url ? { baseUrl: row.base_url } : {}),
      ...(row.secret_ref ? { apiKeyConfigured: Boolean(await this.secrets.get(row.secret_ref)) } : {}),
      ...(row.api_style ? { apiStyle: row.api_style as import('@shared/types/aiWorkspace').AiApiStyle } : {}),
      ...(row.auth_method ? { authMethod: row.auth_method as import('@shared/types/aiWorkspace').AiApiAuthMethod } : {}),
      ...(row.executable_path ? { executablePath: row.executable_path } : {}),
      ...(row.kind === 'cli'
        ? { environment: parseJson<Record<string, string>>(row.environment_json, {}) }
        : {}),
      ...(row.default_model_id ? { defaultModelId: row.default_model_id } : {}),
      ...(row.kind === 'cli' ? { supportsNativeResume: row.supports_native_resume === 1 } : {})
    }
  }

  private toConversation(row: AiConversationRow): AiConversation {
    return {
      id: row.id,
      title: row.title,
      mode: row.mode,
      ...(row.config_id ? { configId: row.config_id } : {}),
      ...(row.provider ? { provider: row.provider } : {}),
      ...(row.model_id ? { modelId: row.model_id } : {}),
      ...(row.effort_json
        ? { effort: parseJson<AiEffortSelection | undefined>(row.effort_json, undefined) }
        : {}),
      permissionMode: row.permission_mode === 'full-access' ? 'full-access' : 'request',
      templateIds: parseJson<string[]>(row.template_ids_json, []),
      ...(row.workspace_path ? { workspacePath: row.workspace_path } : {}),
      ...(row.native_session_id ? { nativeSessionId: row.native_session_id } : {}),
      ...(row.native_session_file ? { nativeSessionFile: row.native_session_file } : {}),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private requireConversation(id: string): AiConversation {
    const conversation = this.getConversation(id)
    if (!conversation) throw new Error(`AI conversation ${id} was not found.`)
    return conversation
  }

  private toMessage(row: AiMessageRow): AiMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
      ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
      ...(row.tool_name ? { toolName: row.tool_name } : {})
    }
  }

  private toTemplate(row: AiTemplateRow): AiTemplate {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private requireChangeSet(id: string): AiChangeSet {
    const changeSet = this.getChangeSet(id)
    if (!changeSet) throw new Error(`AI change set ${id} was not found.`)
    return changeSet
  }

  private toChangeSet(row: AiChangeSetRow): AiChangeSet {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      turnId: row.turn_id,
      documentId: row.document_id,
      documentUri: row.document_uri,
      ...(row.file_path ? { filePath: row.file_path } : {}),
      originalContent: row.original_content,
      appliedContent: row.applied_content,
      status: row.status,
      additions: row.additions,
      deletions: row.deletions,
      createdAt: row.created_at,
      ...(row.resolved_at === null ? {} : { resolvedAt: row.resolved_at }),
      ...(row.message ? { message: row.message } : {}),
      ...(row.transaction_json
        ? { transaction: parseJson(row.transaction_json, undefined) }
        : {})
    }
  }
}
