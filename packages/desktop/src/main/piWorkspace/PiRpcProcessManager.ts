import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { PiRuntimeReadiness, PiRuntimeSession } from './PiRuntimeTypes'
import { PiJsonlTransport } from './PiJsonlTransport'

const ADAPTER_READY_PREFIX = 'ANNOTAMD_ADAPTER_READY:'
const REQUIRED_ADAPTER_CAPABILITIES = [
  'snapshot-v1',
  'proposal-v1',
  'approval-v1',
  'feedback-v1',
  'abortable-input'
] as const
const ADAPTER_OWNER = 'annotamd-pi-adapter/v1'
const STARTUP_TIMEOUT_MS = 8_000
const MAX_STDERR_BYTES = 64 * 1024
const MAX_BRIDGE_WIRE_BYTES = 18 * 1024 * 1024
const MAX_BRIDGE_WIRE_CHARS = Math.ceil((MAX_BRIDGE_WIRE_BYTES * 4) / 3) + 8

type JsonRecord = Record<string, unknown>

export interface PiAdapterHandshake {
  adapterProtocol: 1
  adapterVersion: string
  piVersion: string
  capabilities: string[]
  activeTools: string[]
  tools: {
    read: { sourceInfo: { path: string } }
    edit: { sourceInfo: { path: string } }
    write: { sourceInfo: { path: string } }
  }
  toolOwners: {
    read: string
    edit: string
    write: string
  }
}

export interface PiRpcSessionState {
  model?: { provider?: string; id?: string }
  isStreaming: boolean
  sessionFile?: string
  sessionId: string
  sessionName?: string
}

export interface PiRpcAvailableModel {
  provider: string
  id: string
  name?: string
}

export interface PiRpcProcessOptions {
  executablePath: string
  executableArgs?: string[]
  piVersion: string
  workspacePath: string
  adapterPath: string
  environment?: NodeJS.ProcessEnv
  model?: string
  thinkingLevel?: string
  noSession?: boolean
  spawnProcess?: typeof spawn
}

export class PiRpcCompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiRpcCompatibilityError'
  }
}

export class PiRpcCommandError extends Error {
  constructor(readonly command: string, message: string) {
    super(message)
    this.name = 'PiRpcCommandError'
  }
}

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const parseReadyHandshake = (message: unknown): PiAdapterHandshake | undefined => {
  if (!isRecord(message) || message.type !== 'extension_ui_request') return undefined
  if (message.method !== 'notify' || typeof message.message !== 'string') return undefined
  if (!message.message.startsWith(ADAPTER_READY_PREFIX)) return undefined

  try {
    const decoded = Buffer.from(
      message.message.slice(ADAPTER_READY_PREFIX.length),
      'base64url'
    ).toString('utf8')
    const payload = JSON.parse(decoded) as unknown
    if (!isRecord(payload)) return undefined
    const owners = payload.toolOwners
    const tools = payload.tools
    if (!isRecord(owners) || !isRecord(tools)) return undefined
    const readTool = tools.read
    const editTool = tools.edit
    const writeTool = tools.write
    if (!isRecord(readTool) || !isRecord(editTool) || !isRecord(writeTool)) return undefined
    const readSourceInfo = readTool.sourceInfo
    const editSourceInfo = editTool.sourceInfo
    const writeSourceInfo = writeTool.sourceInfo
    if (!isRecord(readSourceInfo) || !isRecord(editSourceInfo) || !isRecord(writeSourceInfo)) {
      return undefined
    }
    if (
      payload.adapterProtocol !== 1 ||
      typeof payload.adapterVersion !== 'string' ||
      typeof payload.piVersion !== 'string' ||
      !Array.isArray(payload.capabilities) ||
      !payload.capabilities.every(item => typeof item === 'string') ||
      !Array.isArray(payload.activeTools) ||
      !payload.activeTools.every(item => typeof item === 'string') ||
      typeof readSourceInfo.path !== 'string' ||
      typeof editSourceInfo.path !== 'string' ||
      typeof writeSourceInfo.path !== 'string' ||
      typeof owners.read !== 'string' ||
      typeof owners.edit !== 'string' ||
      typeof owners.write !== 'string'
    ) return undefined
    return {
      adapterProtocol: 1,
      adapterVersion: payload.adapterVersion,
      piVersion: payload.piVersion,
      capabilities: payload.capabilities,
      activeTools: payload.activeTools,
      tools: {
        read: { sourceInfo: { path: readSourceInfo.path } },
        edit: { sourceInfo: { path: editSourceInfo.path } },
        write: { sourceInfo: { path: writeSourceInfo.path } }
      },
      toolOwners: {
        read: owners.read,
        edit: owners.edit,
        write: owners.write
      }
    }
  } catch {
    return undefined
  }
}

const validateHandshake = (
  handshake: PiAdapterHandshake,
  expectedPiVersion: string,
  adapterPath: string
): void => {
  if (handshake.piVersion !== expectedPiVersion) {
    throw new PiRpcCompatibilityError(
      `Pi version changed during startup (${expectedPiVersion} → ${handshake.piVersion}).`
    )
  }
  const missing = REQUIRED_ADAPTER_CAPABILITIES.filter(
    capability => !handshake.capabilities.includes(capability)
  )
  if (missing.length > 0) {
    throw new PiRpcCompatibilityError(
      `Pi adapter is missing required capabilities: ${missing.join(', ')}.`
    )
  }
  if (
    handshake.toolOwners.read !== ADAPTER_OWNER ||
    handshake.toolOwners.edit !== ADAPTER_OWNER ||
    handshake.toolOwners.write !== ADAPTER_OWNER
  ) {
    throw new PiRpcCompatibilityError(
      'The AnnotaMD adapter did not take ownership of Pi read/edit/write tools.'
    )
  }
  const wrongSources = (['read', 'edit', 'write'] as const).filter(
    name => handshake.tools[name].sourceInfo.path !== adapterPath
  )
  if (wrongSources.length > 0) {
    throw new PiRpcCompatibilityError(
      `Pi resolved ${wrongSources.join(', ')} from a different extension than the AnnotaMD adapter.`
    )
  }
  const inactiveTools = (['read', 'edit', 'write'] as const).filter(
    name => !handshake.activeTools.includes(name)
  )
  if (inactiveTools.length > 0) {
    throw new PiRpcCompatibilityError(
      `Pi did not activate required AnnotaMD tools: ${inactiveTools.join(', ')}.`
    )
  }
}

const responseData = <T>(response: unknown, command: string): T => {
  if (!isRecord(response) || response.type !== 'response' || response.command !== command) {
    throw new PiRpcCommandError(command, `Pi returned an invalid ${command} response.`)
  }
  if (response.success !== true) {
    throw new PiRpcCommandError(
      command,
      typeof response.error === 'string' ? response.error : `Pi ${command} failed.`
    )
  }
  return response.data as T
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => (
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new PiRpcCompatibilityError(message)), timeoutMs)
    promise.then(
      value => {
        clearTimeout(timeout)
        resolve(value)
      },
      error => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
)

const selectionArguments = (options: PiRpcProcessOptions): string[] => {
  const args: string[] = []
  const model = options.model?.trim()
  if (model && model !== 'default') {
    const separator = model.indexOf('/')
    if (separator <= 0 || separator === model.length - 1) {
      throw new PiRpcCompatibilityError('Pi models must use the provider/model-id format.')
    }
    args.push('--provider', model.slice(0, separator), '--model', model.slice(separator + 1))
  }
  const thinkingLevel = options.thinkingLevel?.trim()
  if (thinkingLevel) {
    if (!/^[A-Za-z0-9_-]+$/.test(thinkingLevel)) {
      throw new PiRpcCompatibilityError('Pi thinkingLevel contains unsupported characters.')
    }
    args.push('--thinking', thinkingLevel)
  }
  return args
}

export class PiRpcProcessManager {
  private readonly process: ChildProcessWithoutNullStreams
  private readonly transport: PiJsonlTransport
  private readonly messageListeners = new Set<(message: unknown) => void>()
  private readonly exitListeners = new Set<(error: Error) => void>()
  private readonly handshakePromise: Promise<PiAdapterHandshake>
  private resolveHandshake!: (handshake: PiAdapterHandshake) => void
  private rejectHandshake!: (error: Error) => void
  private stderr = ''
  private disposed = false
  private exitNotified = false
  private sessionState?: PiRpcSessionState

  constructor(private readonly options: PiRpcProcessOptions) {
    this.handshakePromise = new Promise<PiAdapterHandshake>((resolve, reject) => {
      this.resolveHandshake = resolve
      this.rejectHandshake = reject
    })
    const spawnProcess = options.spawnProcess ?? spawn
    this.process = spawnProcess(options.executablePath, [
      ...(options.executableArgs ?? []),
      '--mode', 'rpc',
      ...(options.noSession ? ['--no-session'] : []),
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--no-context-files',
      '--extension', options.adapterPath,
      '--no-approve',
      ...selectionArguments(options)
    ], {
      cwd: options.workspacePath,
      env: {
        ...(options.environment ?? process.env),
        PI_SKIP_VERSION_CHECK: '1'
      },
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.transport = new PiJsonlTransport({
      readable: this.process.stdout,
      writable: this.process.stdin,
      requestIdPrefix: 'annotamd-pi',
      // A proposal carries both the original and candidate document. Each
      // document is capped at 8 MiB, then the bridge envelope is base64url
      // encoded inside a JSONL record.
      maxLineBytes: 32 * 1024 * 1024,
      maxOutputBytes: 128 * 1024 * 1024
    })
    this.transport.onMessage(this.handleMessage)
    this.transport.onError(this.handleTransportError)
    this.process.stderr.on('data', this.handleStderr)
    this.process.once('error', this.handleProcessError)
    this.process.once('exit', this.handleProcessExit)
  }

  get currentState(): PiRpcSessionState | undefined {
    return this.sessionState ? { ...this.sessionState } : undefined
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onExit(listener: (error: Error) => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  async start(): Promise<{ readiness: PiRuntimeReadiness; session: PiRuntimeSession }> {
    const [stateResponse, handshake] = await withTimeout(
      Promise.all([
        this.transport.request({ type: 'get_state' }),
        this.handshakePromise
      ]),
      STARTUP_TIMEOUT_MS,
      'Pi RPC or the AnnotaMD adapter did not become ready in time.'
    )
    validateHandshake(handshake, this.options.piVersion, this.options.adapterPath)
    const state = responseData<PiRpcSessionState>(stateResponse, 'get_state')
    this.sessionState = state
    const model = state.model?.provider && state.model.id
      ? `${state.model.provider}/${state.model.id}`
      : undefined
    return {
      readiness: {
        status: model ? 'ready' : 'needs-auth',
        executablePath: this.options.executablePath,
        ...(this.options.executableArgs?.length
          ? { executableArgs: this.options.executableArgs }
          : {}),
        version: this.options.piVersion,
        adapterProtocol: handshake.adapterProtocol,
        model,
        ...(!model ? { message: 'Pi has no active model. Configure or authenticate Pi first.' } : {})
      },
      session: {
        id: state.sessionId,
        title: state.sessionName,
        sessionFile: state.sessionFile
      }
    }
  }

  async refreshState(): Promise<PiRpcSessionState> {
    const response = await this.transport.request({ type: 'get_state' })
    const state = responseData<PiRpcSessionState>(response, 'get_state')
    this.sessionState = state
    return state
  }

  async getAvailableModels(): Promise<PiRpcAvailableModel[]> {
    const response = responseData<{ models?: unknown }>(
      await this.transport.request({ type: 'get_available_models' }),
      'get_available_models'
    )
    if (!Array.isArray(response.models)) {
      throw new PiRpcCommandError('get_available_models', 'Pi returned an invalid model list.')
    }
    return response.models.flatMap((model) => {
      if (!isRecord(model) || typeof model.provider !== 'string' || typeof model.id !== 'string') {
        return []
      }
      return [{
        provider: model.provider,
        id: model.id,
        ...(typeof model.name === 'string' ? { name: model.name } : {})
      }]
    })
  }

  async getAvailableThinkingLevels(): Promise<string[]> {
    const response = responseData<{ levels?: unknown }>(
      await this.transport.request({ type: 'get_available_thinking_levels' }),
      'get_available_thinking_levels'
    )
    return Array.isArray(response.levels)
      ? response.levels.filter((level): level is string => typeof level === 'string' && level.length > 0)
      : []
  }

  async newSession(): Promise<PiRuntimeSession> {
    responseData(await this.transport.request({ type: 'new_session' }), 'new_session')
    const state = await this.refreshState()
    return {
      id: state.sessionId,
      title: state.sessionName,
      sessionFile: state.sessionFile
    }
  }

  async prompt(message: string): Promise<void> {
    responseData(await this.transport.request({ type: 'prompt', message }), 'prompt')
  }

  async abort(): Promise<void> {
    responseData(await this.transport.request({ type: 'abort' }), 'abort')
  }

  respondToExtension(requestId: string, response: { value: string } | { cancelled: true }): void {
    this.transport.send({ type: 'extension_ui_response', id: requestId, ...response })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const error = new Error('Pi RPC process disposed')
    this.rejectHandshake(error)
    this.transport.dispose()
    this.process.stderr.off('data', this.handleStderr)
    this.process.off('error', this.handleProcessError)
    this.process.off('exit', this.handleProcessExit)
    if (!this.process.killed) this.process.kill('SIGTERM')
    this.messageListeners.clear()
    this.exitListeners.clear()
  }

  private readonly handleMessage = (message: unknown): void => {
    const handshake = parseReadyHandshake(message)
    if (handshake) this.resolveHandshake(handshake)
    for (const listener of this.messageListeners) listener(message)
  }

  private readonly handleStderr = (chunk: Buffer | string): void => {
    if (Buffer.byteLength(this.stderr, 'utf8') >= MAX_STDERR_BYTES) return
    this.stderr = `${this.stderr}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk}`
      .slice(0, MAX_STDERR_BYTES)
  }

  private readonly handleTransportError = (error: Error): void => {
    this.rejectHandshake(error)
    this.notifyExit(error)
    if (!this.process.killed) this.process.kill('SIGTERM')
  }

  private readonly handleProcessError = (error: Error): void => {
    this.rejectHandshake(error)
    this.transport.close(error)
    this.notifyExit(error)
  }

  private readonly handleProcessExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (this.disposed) return
    const detail = this.stderr.replace(/\s+/g, ' ').trim().slice(0, 600)
    const error = new Error(
      `Pi RPC exited (${signal ?? code ?? 'unknown'})${detail ? `: ${detail}` : ''}`
    )
    this.rejectHandshake(error)
    this.transport.close(error)
    this.notifyExit(error)
  }

  private notifyExit(error: Error): void {
    if (this.disposed || this.exitNotified) return
    this.exitNotified = true
    for (const listener of this.exitListeners) listener(error)
  }
}

export const decodePiBridgeEnvelope = (value: string): unknown => {
  if (!value.startsWith('am1.')) {
    throw new PiRpcCompatibilityError('Pi adapter sent an unsupported bridge envelope.')
  }
  if (value.length > MAX_BRIDGE_WIRE_CHARS) {
    throw new PiRpcCompatibilityError('Pi adapter bridge envelope is too large.')
  }
  const encoded = value.slice(4)
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new PiRpcCompatibilityError('Pi adapter sent invalid base64url data.')
  }
  try {
    const decoded = Buffer.from(encoded, 'base64url')
    if (decoded.byteLength > MAX_BRIDGE_WIRE_BYTES) {
      throw new PiRpcCompatibilityError('Pi adapter bridge envelope is too large.')
    }
    return JSON.parse(decoded.toString('utf8')) as unknown
  } catch (error) {
    if (error instanceof PiRpcCompatibilityError) throw error
    throw new PiRpcCompatibilityError('Pi adapter sent an invalid bridge envelope.')
  }
}

export const encodePiBridgeEnvelope = (value: unknown): string => {
  const json = JSON.stringify(value)
  if (json === undefined || Buffer.byteLength(json, 'utf8') > MAX_BRIDGE_WIRE_BYTES) {
    throw new PiRpcCompatibilityError('AnnotaMD bridge response is too large.')
  }
  return `am1.${Buffer.from(json, 'utf8').toString('base64url')}`
}
