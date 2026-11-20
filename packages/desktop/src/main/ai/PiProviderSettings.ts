import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type {
  PiApiFormat,
  PiAuthStyle,
  PiModelEntry,
  PiProviderEntry,
  PiProviderKind,
  PiSettings
} from '@shared/types/piProvider'
import type { AiSecretStore } from './AiSecretStore'

export type {
  PiApiFormat,
  PiAuthStyle,
  PiModelEntry,
  PiProviderEntry,
  PiProviderKind,
  PiSettings
}

export const PI_SECRET_KEY_PREFIX = 'pi-provider:'
/** Single-provider builds stored one shared key under this account. */
export const LEGACY_SECRET_KEY = 'pi-provider'
export const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1'
export const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'

const trimSlashes = (value: string): string => value.replace(/\/+$/, '')

const stripSuffix = (path: string, suffix: string): string => (
  path.toLowerCase().endsWith(suffix.toLowerCase())
    ? path.slice(0, path.length - suffix.length)
    : path
)

const parseHttpUrl = (raw: string, fallback: string): URL => {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed || fallback)
  } catch {
    throw new Error('The endpoint address must start with http:// or https://.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The endpoint address must start with http:// or https://.')
  }
  return url
}

/** Drops a pasted route suffix so one base serves requests and discovery. */
export const normalizeBaseUrl = (kind: PiProviderKind, raw: string): string => {
  const url = parseHttpUrl(raw, kind === 'anthropic' ? DEFAULT_ANTHROPIC_BASE : DEFAULT_OPENAI_BASE)
  let path = trimSlashes(url.pathname)
  const suffixes = kind === 'anthropic'
    ? ['/messages', '/models', '/v1']
    : ['/chat/completions', '/responses', '/models']
  for (const suffix of suffixes) path = stripSuffix(path, suffix)
  if (kind === 'openai' && (path === '' || path === '/')) path = '/v1'
  url.pathname = path || '/'
  url.search = ''
  url.hash = ''
  return trimSlashes(url.toString())
}

export const modelsEndpoint = (provider: PiProviderEntry): string => {
  if (provider.modelsUrl?.trim()) return parseHttpUrl(provider.modelsUrl, '').toString()
  const base = normalizeBaseUrl(provider.kind, provider.baseUrl)
  return provider.kind === 'anthropic' ? base + '/v1/models' : base + '/models'
}

const apiName = (provider: PiProviderEntry): string => {
  if (provider.kind === 'anthropic') return 'anthropic-messages'
  return provider.apiFormat === 'responses' ? 'openai-responses' : 'openai-completions'
}

/** Stable, readable provider ids; they appear in model references. */
export const slugifyProviderId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'provider'
}

export const uniqueProviderId = (settings: PiSettings, name: string, ignore?: string): string => {
  const base = slugifyProviderId(name)
  const taken = new Set(settings.providers.filter(item => item.id !== ignore).map(item => item.id))
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(base + '-' + index)) index += 1
  return base + '-' + index
}

/** Environment variable that carries a provider's key into the runtime. */
export const providerEnvKey = (providerId: string): string => (
  'ANNOTAMD_PI_KEY_' + providerId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()
)

export const secretKeyFor = (providerId: string): string => PI_SECRET_KEY_PREFIX + providerId

export const enabledModels = (provider: PiProviderEntry): PiModelEntry[] => (
  provider.models.filter(model => model.enabled)
)

export const readPiProviderKey = async(
  settings: PiSettings,
  secrets: AiSecretStore,
  id: string
): Promise<string | null> => (
  await secrets.get(secretKeyFor(id)) ??
  (id === settings.legacyKeyProviderId ? await secrets.get(LEGACY_SECRET_KEY) : null)
)

export const readPiProviderKeys = async(
  settings: PiSettings,
  secrets: AiSecretStore
): Promise<Map<string, string>> => {
  const keys = new Map<string, string>()
  for (const provider of settings.providers) {
    const key = await readPiProviderKey(settings, secrets, provider.id)
    if (key?.trim()) keys.set(provider.id, key)
  }
  return keys
}

/**
 * Builds the models.json Pi reads. Keys arrive through environment
 * interpolation, so credentials never reach the disk.
 */
export const buildModelsConfig = (settings: PiSettings): Record<string, unknown> => {
  const providers: Record<string, unknown> = {}
  for (const provider of settings.providers) {
    if (!provider.enabled) continue
    const models = enabledModels(provider)
    if (models.length === 0) continue
    const entry: Record<string, unknown> = {
      baseUrl: normalizeBaseUrl(provider.kind, provider.baseUrl),
      api: apiName(provider),
      apiKey: '$' + '{' + providerEnvKey(provider.id) + '}',
      models: models.map(model => ({ id: model.id }))
    }
    if (provider.kind === 'anthropic' && provider.authStyle === 'bearer') {
      entry.headers = { Authorization: 'Bearer $' + '{' + providerEnvKey(provider.id) + '}' }
    }
    providers[provider.id] = entry
  }
  return { providers }
}

export const normalizeModelList = (models: PiModelEntry[] | undefined): PiModelEntry[] => {
  const seen = new Set<string>()
  const result: PiModelEntry[] = []
  for (const model of models ?? []) {
    const id = model?.id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, enabled: model.enabled !== false })
  }
  return result
}

export const defaultModelFor = (models: PiModelEntry[], preferred?: string): string | undefined => (
  models.find(model => model.enabled && model.id === preferred)?.id
    ?? models.find(model => model.enabled)?.id
)

export const defaultProviderFor = (
  providers: PiProviderEntry[],
  preferred?: string
): PiProviderEntry | undefined => (
  providers.find(provider => provider.enabled && provider.id === preferred)
    ?? providers.find(provider => provider.enabled)
)

const normalizeProvider = (provider: PiProviderEntry): PiProviderEntry => {
  const models = normalizeModelList(provider.models)
  const defaultModel = defaultModelFor(models, provider.defaultModel?.trim())
  return {
    id: provider.id,
    name: provider.name.trim(),
    kind: provider.kind,
    baseUrl: normalizeBaseUrl(provider.kind, provider.baseUrl),
    enabled: provider.enabled !== false,
    models,
    ...(provider.modelsUrl?.trim() ? { modelsUrl: provider.modelsUrl.trim() } : {}),
    ...(provider.kind === 'openai' && provider.apiFormat === 'responses'
      ? { apiFormat: 'responses' as const }
      : {}),
    ...(provider.kind === 'anthropic' && provider.authStyle === 'bearer'
      ? { authStyle: 'bearer' as const }
      : {}),
    ...(defaultModel ? { defaultModel } : {})
  }
}

/** Legacy single-provider files are folded into the list form. */
const migrateLegacy = (parsed: Record<string, unknown>): PiSettings | null => {
  if (Array.isArray(parsed.providers)) return parsed as unknown as PiSettings
  if (typeof parsed.name !== 'string' || typeof parsed.baseUrl !== 'string') return null
  if (parsed.kind !== 'openai' && parsed.kind !== 'anthropic') return null
  const id = slugifyProviderId(parsed.name)
  const model = typeof parsed.model === 'string' ? parsed.model : ''
  const provider: PiProviderEntry = {
    id,
    name: parsed.name,
    kind: parsed.kind,
    baseUrl: parsed.baseUrl,
    enabled: true,
    models: model ? [{ id: model, enabled: true }] : [],
    ...(model ? { defaultModel: model } : {}),
    ...(typeof parsed.modelsUrl === 'string' && parsed.modelsUrl ? { modelsUrl: parsed.modelsUrl } : {}),
    ...(parsed.kind === 'openai' && parsed.apiFormat === 'responses' ? { apiFormat: 'responses' as const } : {}),
    ...(parsed.kind === 'anthropic' && parsed.authStyle === 'bearer' ? { authStyle: 'bearer' as const } : {})
  }
  return { providers: [provider], defaultProviderId: id, legacyKeyProviderId: id }
}

export const readPiSettings = async(path: string): Promise<PiSettings> => {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    const migrated = migrateLegacy(parsed)
    if (!migrated) return { providers: [] }
    const providers = (migrated.providers ?? [])
      .filter((provider): provider is PiProviderEntry => Boolean(provider?.id && provider?.name))
      .map(normalizeProvider)
    const defaultProviderId = defaultProviderFor(providers, migrated.defaultProviderId)?.id
    const legacyKeyProviderId = providers.find(provider => provider.id === migrated.legacyKeyProviderId)?.id
    return { providers, defaultProviderId, legacyKeyProviderId }
  } catch {
    return { providers: [] }
  }
}

export const writePiSettings = async(path: string, settings: PiSettings): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomic(path, JSON.stringify(settings, null, 2), 'utf8')
}

/** Turns an endpoint into the model list shown in the picker. */
export const fetchPiModels = async(
  provider: PiProviderEntry,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> => {
  if (!apiKey.trim()) throw new Error('Enter an API key before fetching models.')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (provider.kind === 'anthropic') {
    headers['anthropic-version'] = ANTHROPIC_VERSION
    if (provider.authStyle === 'bearer') headers.Authorization = 'Bearer ' + apiKey
    else headers['x-api-key'] = apiKey
  } else {
    headers.Authorization = 'Bearer ' + apiKey
  }
  const response = await fetchImpl(modelsEndpoint(provider), { headers })
  if (!response.ok) {
    throw new Error('The endpoint rejected the model list request (' + response.status + ').')
  }
  const payload = await response.json() as { data?: unknown }
  const entries = Array.isArray(payload.data) ? payload.data : []
  const ids = entries
    .map(entry => (entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right))
}

/** Writes the agent directory Pi reads: every enabled provider. */
export const writePiAgentDirectory = async(
  agentDirectory: string,
  settings: PiSettings
): Promise<void> => {
  await mkdir(agentDirectory, { recursive: true })
  await writeFileAtomic(
    join(agentDirectory, 'models.json'),
    JSON.stringify(buildModelsConfig(settings), null, 2),
    'utf8'
  )
}
