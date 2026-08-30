import type {
  AiApiAuthMethod,
  AiApiProviderId,
  AiApiStyle,
  AiCliProviderId,
  AiConfigKind,
  AiProviderId
} from './aiWorkspace'

export interface AiApiProviderPreset {
  id: AiApiProviderId
  label: string
  iconSlug?: string
  baseUrl: string
  defaultModelId: string
  apiStyle: AiApiStyle
  authMethod: AiApiAuthMethod
  requiresApiKey: boolean
  configurableProtocol?: boolean
}

/**
 * Product defaults migrated from DBX. These values only prefill a new
 * configuration; saved user values always win.
 */
export const AI_API_PROVIDER_PRESETS: Record<AiApiProviderId, AiApiProviderPreset> = {
  claude: {
    id: 'claude',
    label: 'Claude',
    iconSlug: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModelId: 'claude-sonnet-4-20250514',
    apiStyle: 'anthropic-messages',
    authMethod: 'api-key',
    requiresApiKey: true
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    iconSlug: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModelId: 'gpt-4o-mini',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: true,
    configurableProtocol: true
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    iconSlug: 'googlegemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModelId: 'gemini-1.5-pro',
    apiStyle: 'gemini-generate-content',
    authMethod: 'api-key',
    requiresApiKey: true
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    iconSlug: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-v4-flash',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: true
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    iconSlug: 'alibabacloud',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen-plus',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: true
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    iconSlug: 'minimax',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModelId: 'MiniMax-M3',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: true
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    iconSlug: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModelId: 'llama3.1',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: false
  },
  'anthropic-compatible': {
    id: 'anthropic-compatible',
    label: 'Anthropic Compatible',
    iconSlug: 'anthropic',
    baseUrl: '',
    defaultModelId: '',
    apiStyle: 'anthropic-messages',
    authMethod: 'bearer',
    requiresApiKey: false
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    iconSlug: 'openai',
    baseUrl: '',
    defaultModelId: '',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: false,
    configurableProtocol: true
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    defaultModelId: '',
    apiStyle: 'chat-completions',
    authMethod: 'bearer',
    requiresApiKey: false,
    configurableProtocol: true
  },
  /** Existing AnnotaMD configs transparently retain their old provider id. */
  'anthropic-messages': {
    id: 'anthropic-messages',
    label: 'Anthropic Messages API',
    iconSlug: 'anthropic',
    baseUrl: '',
    defaultModelId: '',
    apiStyle: 'anthropic-messages',
    authMethod: 'api-key',
    requiresApiKey: false
  }
}

export const aiApiProviderPreset = (provider: AiApiProviderId): AiApiProviderPreset => (
  AI_API_PROVIDER_PRESETS[provider]
)

export interface AiCliProviderPreset {
  id: AiCliProviderId
  label: string
  command: string
  iconSlug?: string
}

export const AI_CLI_PROVIDER_PRESETS: Record<AiCliProviderId, AiCliProviderPreset> = {
  'claude-code': {
    id: 'claude-code', label: 'Claude Code CLI', command: 'claude', iconSlug: 'claudecode'
  },
  codex: { id: 'codex', label: 'Codex CLI', command: 'codex', iconSlug: 'codex' },
  opencode: {
    id: 'opencode', label: 'OpenCode CLI', command: 'opencode', iconSlug: 'opencode'
  },
  'cursor-cli': {
    id: 'cursor-cli', label: 'Cursor CLI', command: 'agent', iconSlug: 'cursor'
  },
  'codebuddy-cli': {
    id: 'codebuddy-cli', label: 'CodeBuddy Code', command: 'codebuddy', iconSlug: 'codebuddy'
  },
  'qoder-cli': { id: 'qoder-cli', label: 'Qoder CLI', command: 'qodercli' },
  'grok-cli': { id: 'grok-cli', label: 'Grok CLI', command: 'grok', iconSlug: 'grok' },
  pi: { id: 'pi', label: 'Pi Coding Agent', command: 'pi', iconSlug: 'pi' }
}

export interface AiProviderOption {
  id: AiProviderId
  kind: AiConfigKind
  label: string
  iconSlug?: string
}

const apiProviderOrder: AiApiProviderId[] = [
  'claude',
  'openai',
  'gemini',
  'deepseek',
  'qwen',
  'minimax',
  'ollama',
  'anthropic-compatible',
  'openai-compatible'
]

const cliProviderOrder: AiCliProviderId[] = [
  'claude-code',
  'codex',
  'opencode',
  'cursor-cli',
  'codebuddy-cli',
  'qoder-cli',
  'grok-cli',
  'pi'
]

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  ...apiProviderOrder.map((id): AiProviderOption => ({
    id,
    kind: 'api',
    label: AI_API_PROVIDER_PRESETS[id].label,
    iconSlug: AI_API_PROVIDER_PRESETS[id].iconSlug
  })),
  ...cliProviderOrder.map((id): AiProviderOption => ({
    id,
    kind: 'cli',
    label: AI_CLI_PROVIDER_PRESETS[id].label,
    iconSlug: AI_CLI_PROVIDER_PRESETS[id].iconSlug
  })),
  { id: 'custom', kind: 'api', label: 'Custom' }
]

export const aiProviderOption = (provider: AiProviderId): AiProviderOption => {
  const option = AI_PROVIDER_OPTIONS.find(item => item.id === provider)
  if (option) return option
  const legacy = AI_API_PROVIDER_PRESETS[provider as AiApiProviderId]
  return {
    id: provider,
    kind: 'api',
    label: legacy?.label ?? provider,
    iconSlug: legacy?.iconSlug
  }
}

/** Providers whose current AnnotaMD adapter can pause and resume the same native CLI turn. */
export const supportsNativeApprovalBridge = (provider?: AiProviderId): boolean => [
  'codex',
  'claude-code',
  'opencode',
  'cursor-cli',
  'grok-cli',
  'codebuddy-cli',
  'qoder-cli',
  'pi'
].includes(provider ?? '')
