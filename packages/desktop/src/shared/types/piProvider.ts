/**
 * Persisted agent endpoint configuration.
 *
 * The layout follows Motty: a list of providers, each owning its own models,
 * one provider marked default. AnnotaMD ships the runtime, so a provider is an
 * HTTP endpoint (OpenAI-compatible or Anthropic) rather than a CLI.
 */
export type PiProviderKind = 'openai' | 'anthropic'
export type PiApiFormat = 'chat' | 'responses'
export type PiAuthStyle = 'api-key' | 'bearer'

export const PI_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type PiThinkingLevel = typeof PI_THINKING_LEVELS[number]

export interface PiDiscoveredModel {
  id: string
  effortLevels?: PiThinkingLevel[]
}

export interface PiModelEntry extends PiDiscoveredModel {
  enabled: boolean
}

export interface PiProviderEntry {
  id: string
  name: string
  kind: PiProviderKind
  baseUrl: string
  modelsUrl?: string
  /** OpenAI-compatible endpoints only. */
  apiFormat?: PiApiFormat
  /** Anthropic endpoints only. */
  authStyle?: PiAuthStyle
  enabled: boolean
  models: PiModelEntry[]
  defaultModel?: string
}

export interface PiSettings {
  providers: PiProviderEntry[]
  defaultProviderId?: string
  /** Provider migrated from a single-provider file that used a shared keychain entry. */
  legacyKeyProviderId?: string
}

export interface PiSettingsState extends PiSettings {
  /** Providers whose API key is present in the OS credential store. */
  keyedProviderIds: string[]
}

export interface PiProviderSaveRequest {
  id?: string
  name: string
  kind: PiProviderKind
  baseUrl: string
  modelsUrl?: string
  apiFormat?: PiApiFormat
  authStyle?: PiAuthStyle
  enabled?: boolean
  /** Omitted keeps the stored key; an empty string clears it. */
  apiKey?: string
  /** Marks this provider as the one the agent uses. */
  makeDefault?: boolean
}

export interface PiProviderModelsRequest {
  providerId?: string
  /** Unsaved provider values, so the list can be fetched before saving. */
  draft?: PiProviderSaveRequest
  /** Falls back to the stored key when omitted or empty. */
  apiKey?: string
}

export type PiModelsUpdateRequest = { providerId: string } & (
  | { models: PiModelEntry[]; defaultModel?: string }
  | { addModels: PiDiscoveredModel[] }
)
