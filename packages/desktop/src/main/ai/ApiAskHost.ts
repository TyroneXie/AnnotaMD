import {
  AI_MAX_API_RETRIES_MAX,
  AI_MAX_API_RETRIES_MIN,
  type AiApiStyle
} from '@shared/types/aiWorkspace'
import { aiApiProviderPreset } from '@shared/types/aiProviderPresets'
import {
  AiRunStoppedError,
  type AiHost,
  type AiHostConfig,
  type AiHostConnectionResult,
  type AiHostEvent,
  type AiHostModel,
  type AiHostRunRequest
} from './AiHost'
import { readSse } from './sse'

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1'
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const DEFAULT_GEMINI_BASE = 'https://generativelanguage.googleapis.com'
const MAX_MODEL_PAGES = 50

const trimSlashes = (value: string): string => value.replace(/\/+$/, '')

const asRecord = (value: unknown): Record<string, unknown> | undefined => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
)

const styleFor = (config: AiHostConfig): AiApiStyle => (
  config.apiStyle ?? aiApiProviderPreset(config.provider as never).apiStyle
)

const stripKnownResource = (value: string): string => {
  const endpoint = trimSlashes(value.trim())
  for (const suffix of ['/chat/completions', '/responses', '/messages', '/models']) {
    if (endpoint.endsWith(suffix)) return endpoint.slice(0, -suffix.length)
  }
  return endpoint
}

const ensureVersion = (value: string, version: 'v1' | 'v1beta'): string => {
  const endpoint = trimSlashes(value)
  if (endpoint.endsWith(`/${version}`)) return endpoint
  try {
    const url = new URL(endpoint)
    if (url.pathname && url.pathname !== '/') return endpoint
  } catch {
    return endpoint
  }
  return `${endpoint}/${version}`
}

const baseFor = (config: AiHostConfig): string => {
  const style = styleFor(config)
  const fallback = style === 'anthropic-messages'
    ? DEFAULT_ANTHROPIC_BASE
    : style === 'gemini-generate-content'
      ? DEFAULT_GEMINI_BASE
      : DEFAULT_OPENAI_BASE
  return stripKnownResource(config.endpoint?.trim() || fallback)
}

const endpointFor = (
  config: AiHostConfig,
  resource: 'models' | 'chat' | 'responses' | 'messages'
): string => {
  const configured = trimSlashes(config.endpoint?.trim() || '')
  if (resource === 'chat' && configured.endsWith('/chat/completions')) return configured
  if (resource === 'responses' && configured.endsWith('/responses')) return configured
  if (resource === 'messages' && configured.endsWith('/messages')) return configured
  if (resource === 'models' && configured.endsWith('/models')) return configured
  const base = ensureVersion(baseFor(config), 'v1')
  return `${base}/${resource === 'chat' ? 'chat/completions' : resource}`
}

const geminiBase = (config: AiHostConfig): string => {
  const endpoint = trimSlashes(config.endpoint?.trim() || DEFAULT_GEMINI_BASE)
  const modelPath = endpoint.indexOf('/v1beta/models/')
  if (modelPath >= 0) return endpoint.slice(0, modelPath)
  return endpoint.endsWith('/v1beta') ? endpoint.slice(0, -'/v1beta'.length) : endpoint
}

const geminiEndpoint = (config: AiHostConfig, model: string): string => (
  `${geminiBase(config)}/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:streamGenerateContent`
)

const responseError = async(response: Response): Promise<Error> => {
  const text = (await response.text()).trim().slice(0, 16 * 1024)
  let message = text
  try {
    const payload = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    message = typeof payload.error === 'string'
      ? payload.error
      : payload.error?.message || payload.message || text
  } catch {
    // Plain-text upstream errors are useful as-is.
  }
  return new Error(message || `AI provider returned HTTP ${response.status}.`)
}

const apiHeaders = (config: AiHostConfig): Record<string, string> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const secret = config.secret?.trim()
  if (secret) {
    if (config.authMethod === 'api-key') headers['x-api-key'] = secret
    else headers.authorization = `Bearer ${secret}`
  }
  if (styleFor(config) === 'anthropic-messages') {
    headers['anthropic-version'] = '2023-06-01'
  }
  return headers
}

const assertSecret = (config: AiHostConfig): void => {
  const preset = aiApiProviderPreset(config.provider as never)
  if (preset.requiresApiKey && !config.secret?.trim()) throw new Error('API key is not configured.')
}

const parseModels = (value: unknown): AiHostModel[] => {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const data = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : []
  const seen = new Set<string>()
  const models: AiHostModel[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const model = item as Record<string, unknown>
    const id = typeof model.id === 'string'
      ? model.id.trim()
      : typeof model.name === 'string'
        ? model.name.trim().replace(/^models\//, '')
        : ''
    if (!id || seen.has(id)) continue
    const methods = Array.isArray(model.supportedGenerationMethods)
      ? model.supportedGenerationMethods
      : undefined
    if (methods && !methods.includes('generateContent')) continue
    seen.add(id)
    models.push({
      id,
      ...(typeof model.display_name === 'string'
        ? { displayName: model.display_name }
        : typeof model.displayName === 'string'
          ? { displayName: model.displayName }
          : {})
    })
  }
  return models.sort((left, right) => left.id.localeCompare(right.id))
}

const retryCount = (config: AiHostConfig): number => {
  const value = Number.isInteger(config.maxRetries) ? config.maxRetries! : 0
  return Math.min(AI_MAX_API_RETRIES_MAX, Math.max(AI_MAX_API_RETRIES_MIN, value))
}

const transientStatus = (status: number): boolean => (
  status === 408 || status === 409 || status === 429 || status >= 500
)

const retryDelayMs = (response: Response | undefined, attempt: number): number => {
  const retryAfter = response?.headers.get('retry-after')?.trim()
  if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)) {
    return Math.min(5_000, Math.max(0, Number(retryAfter) * 1_000))
  }
  return Math.min(2_000, 250 * (2 ** attempt))
}

const waitForRetry = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    return
  }
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  }, { once: true })
})

const fetchWithRetries = async(
  config: AiHostConfig,
  input: string,
  init: RequestInit
): Promise<Response> => {
  const retries = retryCount(config)
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response: Response | undefined
    try {
      response = await fetch(input, init)
      if (!transientStatus(response.status) || attempt === retries) return response
      await response.body?.cancel().catch(() => {})
      await waitForRetry(retryDelayMs(response, attempt), init.signal ?? undefined)
    } catch (error) {
      if (init.signal?.aborted) throw error
      lastError = error
      if (attempt === retries) throw error
      await waitForRetry(retryDelayMs(undefined, attempt), init.signal ?? undefined)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI request failed.')
}

const appendQuery = (input: string, values: Record<string, string | undefined>): string => {
  const url = new URL(input)
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export class ApiAskHost implements AiHost {
  readonly kind = 'api' as const
  readonly providers = [
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
  private readonly controllers = new Map<string, AbortController>()

  async listModels(config: AiHostConfig): Promise<AiHostModel[]> {
    this.assertProvider(config)
    assertSecret(config)
    const style = styleFor(config)
    if (style === 'gemini-generate-content') return await this.listGeminiModels(config)
    if (style === 'anthropic-messages') return await this.listAnthropicModels(config)
    const response = await fetchWithRetries(config, endpointFor(config, 'models'), {
      headers: apiHeaders(config),
      signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw await responseError(response)
    const models = parseModels(await response.json())
    return config.provider === 'ollama' ? await this.filterOllamaModels(config, models) : models
  }

  async testConnection(config: AiHostConfig): Promise<AiHostConnectionResult> {
    const startedAt = Date.now()
    try {
      this.assertProvider(config)
      assertSecret(config)
      const model = config.model?.trim() || (await this.listModels(config))[0]?.id
      if (!model) throw new Error('Select or enter a model before testing this configuration.')
      await this.run({
        runId: `connection-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conversationId: 'connection-test',
        config: { ...config, model },
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        mode: 'ask'
      }, () => {})
      return {
        success: true,
        message: 'Connection succeeded.',
        latencyMs: Date.now() - startedAt
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt
      }
    }
  }

  async run(request: AiHostRunRequest, emit: (event: AiHostEvent) => void): Promise<string> {
    this.assertProvider(request.config)
    assertSecret(request.config)
    if (this.controllers.has(request.runId)) throw new Error(`AI run ${request.runId} already exists.`)
    const controller = new AbortController()
    this.controllers.set(request.runId, controller)
    emit({ type: 'run-started', runId: request.runId, conversationId: request.conversationId })
    try {
      const style = styleFor(request.config)
      if (style === 'anthropic-messages') {
        return await this.runAnthropic(request, controller.signal, emit)
      }
      if (style === 'gemini-generate-content') {
        return await this.runGemini(request, controller.signal, emit)
      }
      if (style === 'responses') {
        return await this.runResponses(request, controller.signal, emit)
      }
      return await this.runOpenAi(request, controller.signal, emit)
    } catch (error) {
      if (controller.signal.aborted) {
        emit({ type: 'run-stopped', runId: request.runId })
        throw new AiRunStoppedError()
      }
      throw error
    } finally {
      this.controllers.delete(request.runId)
    }
  }

  async stop(runId: string): Promise<boolean> {
    const controller = this.controllers.get(runId)
    if (!controller) return false
    controller.abort()
    return true
  }

  dispose(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  private assertProvider(config: AiHostConfig): void {
    if (!this.providers.includes(config.provider as never)) {
      throw new Error(`API Ask host does not support ${config.provider}.`)
    }
  }

  private async listAnthropicModels(config: AiHostConfig): Promise<AiHostModel[]> {
    const found = new Map<string, AiHostModel>()
    let afterId: string | undefined
    for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
      const response = await fetchWithRetries(config, appendQuery(endpointFor(config, 'models'), {
        after_id: afterId
      }), { headers: apiHeaders(config), signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw await responseError(response)
      const payload = await response.json() as Record<string, unknown>
      for (const model of parseModels(payload)) found.set(model.id, model)
      if (payload.has_more !== true) break
      const next = typeof payload.last_id === 'string' ? payload.last_id.trim() : ''
      if (!next || next === afterId) throw new Error('Anthropic model list returned an invalid cursor.')
      afterId = next
    }
    return [...found.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private async listGeminiModels(config: AiHostConfig): Promise<AiHostModel[]> {
    const found = new Map<string, AiHostModel>()
    let pageToken: string | undefined
    for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
      const response = await fetchWithRetries(config, appendQuery(
        `${geminiBase(config)}/v1beta/models`,
        { key: config.secret, pageSize: '1000', pageToken }
      ), { headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw await responseError(response)
      const payload = await response.json() as Record<string, unknown>
      for (const model of parseModels(payload)) found.set(model.id, model)
      const next = typeof payload.nextPageToken === 'string' ? payload.nextPageToken.trim() : ''
      if (!next) break
      if (next === pageToken) throw new Error('Gemini model list returned an invalid cursor.')
      pageToken = next
    }
    return [...found.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private async filterOllamaModels(
    config: AiHostConfig,
    models: AiHostModel[]
  ): Promise<AiHostModel[]> {
    let showEndpoint: string
    try {
      showEndpoint = `${new URL(config.endpoint ?? 'http://localhost:11434').origin}/api/show`
    } catch {
      return models
    }
    const checks = await Promise.all(models.map(async(model) => {
      try {
        const response = await fetchWithRetries(config, showEndpoint, {
          method: 'POST',
          headers: apiHeaders(config),
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ model: model.id })
        })
        if (!response.ok) return model
        const payload = await response.json() as { capabilities?: unknown }
        return Array.isArray(payload.capabilities) && !payload.capabilities.includes('completion')
          ? undefined
          : model
      } catch {
        return model
      }
    }))
    return checks.filter((model): model is AiHostModel => Boolean(model))
  }

  private async runOpenAi(
    request: AiHostRunRequest,
    signal: AbortSignal,
    emit: (event: AiHostEvent) => void
  ): Promise<string> {
    const model = request.config.model?.trim()
    if (!model) throw new Error('Select a model before sending a message.')
    const response = await fetchWithRetries(request.config, endpointFor(request.config, 'chat'), {
      method: 'POST',
      headers: apiHeaders(request.config),
      signal,
      body: JSON.stringify({ model, messages: request.messages, stream: true })
    })
    if (!response.ok) throw await responseError(response)
    let text = ''
    let providerText = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    await readSse(response, (_event, data) => {
      if (data === '[DONE]') return
      const payload = asRecord(JSON.parse(data))
      const choice = Array.isArray(payload?.choices) ? asRecord(payload.choices[0]) : undefined
      const delta = asRecord(choice?.delta)
      const rawContent = typeof delta?.content === 'string' ? delta.content : ''
      const content = request.config.provider === 'minimax' && rawContent.startsWith(providerText)
        ? rawContent.slice(providerText.length)
        : rawContent
      if (request.config.provider === 'minimax') {
        providerText = rawContent.startsWith(providerText) ? rawContent : providerText + rawContent
      }
      const reasoning = typeof delta?.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof delta?.reasoning === 'string'
          ? delta.reasoning
          : ''
      if (reasoning) emit({ type: 'reasoning-delta', runId: request.runId, delta: reasoning })
      if (content) {
        text += content
        emit({ type: 'text-delta', runId: request.runId, delta: content })
      }
      const usage = asRecord(payload?.usage)
      if (typeof usage?.prompt_tokens === 'number') inputTokens = usage.prompt_tokens
      if (typeof usage?.completion_tokens === 'number') outputTokens = usage.completion_tokens
    })
    emit({ type: 'response-complete', runId: request.runId })
    emit({ type: 'run-finished', runId: request.runId, inputTokens, outputTokens })
    return text
  }

  private async runResponses(
    request: AiHostRunRequest,
    signal: AbortSignal,
    emit: (event: AiHostEvent) => void
  ): Promise<string> {
    const model = request.config.model?.trim()
    if (!model) throw new Error('Select a model before sending a message.')
    const response = await fetchWithRetries(request.config, endpointFor(request.config, 'responses'), {
      method: 'POST',
      headers: apiHeaders(request.config),
      signal,
      body: JSON.stringify({ model, input: request.messages, stream: true })
    })
    if (!response.ok) throw await responseError(response)
    let text = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    await readSse(response, (event, data) => {
      if (data === '[DONE]') return
      const payload = asRecord(JSON.parse(data))
      const type = typeof payload?.type === 'string' ? payload.type : event ?? ''
      if (type === 'response.output_text.delta' && typeof payload?.delta === 'string') {
        text += payload.delta
        emit({ type: 'text-delta', runId: request.runId, delta: payload.delta })
      } else if (
        (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') &&
        typeof payload?.delta === 'string'
      ) {
        emit({ type: 'reasoning-delta', runId: request.runId, delta: payload.delta })
      }
      const responsePayload = asRecord(payload?.response)
      const usage = asRecord(payload?.usage) ?? asRecord(responsePayload?.usage)
      if (typeof usage?.input_tokens === 'number') inputTokens = usage.input_tokens
      if (typeof usage?.output_tokens === 'number') outputTokens = usage.output_tokens
    })
    emit({ type: 'response-complete', runId: request.runId })
    emit({ type: 'run-finished', runId: request.runId, inputTokens, outputTokens })
    return text
  }

  private async runAnthropic(
    request: AiHostRunRequest,
    signal: AbortSignal,
    emit: (event: AiHostEvent) => void
  ): Promise<string> {
    const model = request.config.model?.trim()
    if (!model) throw new Error('Select a model before sending a message.')
    const system = request.messages
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n\n')
    const messages = request.messages
      .filter(message => message.role !== 'system')
      .map(message => ({ role: message.role, content: message.content }))
    const response = await fetchWithRetries(request.config, endpointFor(request.config, 'messages'), {
      method: 'POST',
      headers: apiHeaders(request.config),
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        stream: true,
        ...(system ? { system } : {}),
        messages
      })
    })
    if (!response.ok) throw await responseError(response)
    let text = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    await readSse(response, (_event, data) => {
      const payload = asRecord(JSON.parse(data))
      const delta = asRecord(payload?.delta)
      const type = typeof delta?.type === 'string' ? delta.type : ''
      if (type === 'text_delta' && typeof delta?.text === 'string') {
        text += delta.text
        emit({ type: 'text-delta', runId: request.runId, delta: delta.text })
      } else if (type === 'thinking_delta' && typeof delta?.thinking === 'string') {
        emit({ type: 'reasoning-delta', runId: request.runId, delta: delta.thinking })
      }
      const message = asRecord(payload?.message)
      const usage = asRecord(payload?.usage) ?? asRecord(message?.usage)
      if (typeof usage?.input_tokens === 'number') inputTokens = usage.input_tokens
      if (typeof usage?.output_tokens === 'number') outputTokens = usage.output_tokens
    })
    emit({ type: 'response-complete', runId: request.runId })
    emit({ type: 'run-finished', runId: request.runId, inputTokens, outputTokens })
    return text
  }

  private async runGemini(
    request: AiHostRunRequest,
    signal: AbortSignal,
    emit: (event: AiHostEvent) => void
  ): Promise<string> {
    const model = request.config.model?.trim()
    if (!model) throw new Error('Select a model before sending a message.')
    const system = request.messages
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n\n')
    const contents = request.messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      }))
    const response = await fetchWithRetries(request.config, appendQuery(
      geminiEndpoint(request.config, model),
      { key: request.config.secret, alt: 'sse' }
    ), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents
      })
    })
    if (!response.ok) throw await responseError(response)
    let text = ''
    let providerText = ''
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    await readSse(response, (_event, data) => {
      const payload = asRecord(JSON.parse(data))
      const candidate = Array.isArray(payload?.candidates) ? asRecord(payload.candidates[0]) : undefined
      const content = asRecord(candidate?.content)
      const parts = Array.isArray(content?.parts) ? content.parts : []
      const raw = parts.map(part => asRecord(part)?.text).filter((value): value is string => (
        typeof value === 'string'
      )).join('')
      const delta = raw.startsWith(providerText) ? raw.slice(providerText.length) : raw
      providerText = raw.startsWith(providerText) ? raw : providerText + raw
      if (delta) {
        text += delta
        emit({ type: 'text-delta', runId: request.runId, delta })
      }
      const usage = asRecord(payload?.usageMetadata)
      if (typeof usage?.promptTokenCount === 'number') inputTokens = usage.promptTokenCount
      if (typeof usage?.candidatesTokenCount === 'number') outputTokens = usage.candidatesTokenCount
    })
    emit({ type: 'response-complete', runId: request.runId })
    emit({ type: 'run-finished', runId: request.runId, inputTokens, outputTokens })
    return text
  }
}
