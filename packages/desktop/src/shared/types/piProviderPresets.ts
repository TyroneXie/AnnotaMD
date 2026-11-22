import type { PiProviderEntry, PiProviderKind } from './piProvider'

/**
 * Ready-made endpoints, mirroring the provider picker in Motty. Every field
 * stays editable and "Custom" keeps the form empty, so a preset is only a
 * starting point. CLI agents are deliberately absent: AnnotaMD owns its runtime.
 */
export interface PiProviderPreset {
  id: string
  label: string
  kind: PiProviderKind
  baseUrl: string
  model?: string
  /** Existing brand artwork key from the shared provider presets. */
  iconProvider?: string
}

export const PI_CUSTOM_PRESET_ID = 'custom'

export const PI_PROVIDER_PRESETS: readonly PiProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    iconProvider: 'claude'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    iconProvider: 'openai'
  },
  {
    id: 'gemini',
    label: 'Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    iconProvider: 'gemini'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    iconProvider: 'deepseek'
  },
  { id: 'kimi', label: 'Kimi', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1' },
  {
    id: 'qwen',
    label: 'Qwen',
    kind: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    iconProvider: 'qwen'
  },
  { id: 'zhipu', label: '智谱 GLM', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  {
    id: 'minimax',
    label: 'MiniMax',
    kind: 'openai',
    baseUrl: 'https://api.minimax.chat/v1',
    iconProvider: 'minimax'
  },
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    iconProvider: 'ollama'
  }
]

export const matchPiProviderPreset = (
  kind: PiProviderKind,
  baseUrl: string
): PiProviderPreset | undefined => PI_PROVIDER_PRESETS.find(
  preset => preset.kind === kind && preset.baseUrl === baseUrl
)

export const piProviderIcon = (provider: Pick<PiProviderEntry, 'id' | 'kind' | 'baseUrl'>): string | undefined => {
  const preset = matchPiProviderPreset(provider.kind, provider.baseUrl) ??
    PI_PROVIDER_PRESETS.find(item => item.id === provider.id || item.iconProvider === provider.id)
  return preset?.iconProvider ?? preset?.id
}
