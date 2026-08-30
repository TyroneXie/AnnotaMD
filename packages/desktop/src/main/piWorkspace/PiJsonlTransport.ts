import type { Readable, Writable } from 'node:stream'

export const DEFAULT_PI_JSONL_MAX_LINE_BYTES = 8 * 1024 * 1024
export const DEFAULT_PI_JSONL_MAX_OUTPUT_BYTES = 64 * 1024 * 1024

export type PiJsonlTransportErrorCode =
  | 'invalid-json'
  | 'line-output-limit'
  | 'total-output-limit'
  | 'stream-error'
  | 'write-error'
  | 'closed'

export class PiJsonlTransportError extends Error {
  constructor(
    readonly code: PiJsonlTransportErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PiJsonlTransportError'
  }
}

export interface PiJsonlTransportOptions {
  readable: Readable
  writable: Writable
  maxLineBytes?: number
  maxOutputBytes?: number
  requestIdPrefix?: string
}

type PiJsonlMessageListener = (message: unknown) => void
type PiJsonlErrorListener = (error: PiJsonlTransportError) => void

interface PendingRequest {
  resolve: (response: unknown) => void
  reject: (error: Error) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const validateLimit = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`)
  }
  return value
}

const toJsonlBuffer = (value: unknown): Buffer => {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new TypeError('Pi RPC message cannot be serialized as JSON')
  }
  return Buffer.from(`${json}\n`, 'utf8')
}

export class PiJsonlTransport {
  private readonly readable: Readable
  private readonly writable: Writable
  private readonly maxLineBytes: number
  private readonly maxOutputBytes: number
  private readonly requestIdPrefix: string
  private readonly messageListeners = new Set<PiJsonlMessageListener>()
  private readonly errorListeners = new Set<PiJsonlErrorListener>()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private bufferedOutput = Buffer.alloc(0)
  private outputBytes = 0
  private requestSequence = 0
  private recordNumber = 0
  private closedError: Error | null = null

  constructor(options: PiJsonlTransportOptions) {
    this.readable = options.readable
    this.writable = options.writable
    this.maxLineBytes = validateLimit(
      'maxLineBytes',
      options.maxLineBytes ?? DEFAULT_PI_JSONL_MAX_LINE_BYTES
    )
    this.maxOutputBytes = validateLimit(
      'maxOutputBytes',
      options.maxOutputBytes ?? DEFAULT_PI_JSONL_MAX_OUTPUT_BYTES
    )
    this.requestIdPrefix = options.requestIdPrefix ?? 'annotamd'

    this.readable.on('data', this.handleData)
    this.readable.on('end', this.handleEnd)
    this.readable.on('close', this.handleReadableClose)
    this.readable.on('error', this.handleReadableError)
    this.writable.on('close', this.handleWritableClose)
    this.writable.on('error', this.handleWritableError)
  }

  get isClosed(): boolean {
    return this.closedError !== null
  }

  get pendingRequestCount(): number {
    return this.pendingRequests.size
  }

  get totalOutputBytes(): number {
    return this.outputBytes
  }

  onMessage(listener: PiJsonlMessageListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onError(listener: PiJsonlErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  request<T = Record<string, unknown>>(
    command: Record<string, unknown>
  ): Promise<T> {
    if (this.closedError) return Promise.reject(this.closedError)

    const id = `${this.requestIdPrefix}-${++this.requestSequence}`
    let line: Buffer
    try {
      line = toJsonlBuffer({ ...command, id })
    } catch (cause: unknown) {
      const error = this.toWriteError(cause)
      return Promise.reject(error)
    }

    const pending = new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => resolve(response as T),
        reject
      })
    })

    try {
      this.writeLine(line)
    } catch (cause: unknown) {
      this.fail(this.toWriteError(cause))
    }
    return pending
  }

  send(message: unknown): void {
    if (this.closedError) throw this.closedError

    let line: Buffer
    try {
      line = toJsonlBuffer(message)
    } catch (cause: unknown) {
      throw this.toWriteError(cause)
    }

    try {
      this.writeLine(line)
    } catch (cause: unknown) {
      const error = this.toWriteError(cause)
      this.fail(error)
      throw error
    }
  }

  close(reason?: Error): void {
    this.terminate(reason ?? new PiJsonlTransportError(
      'closed',
      'Pi JSONL transport closed'
    ))
  }

  dispose(): void {
    this.terminate(new PiJsonlTransportError(
      'closed',
      'Pi JSONL transport disposed'
    ))
  }

  private readonly handleData = (chunk: Buffer | string): void => {
    if (this.closedError) return
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
    this.outputBytes += bytes.byteLength
    if (this.outputBytes > this.maxOutputBytes) {
      this.fail(new PiJsonlTransportError(
        'total-output-limit',
        `Pi RPC output exceeded ${this.maxOutputBytes} bytes`
      ))
      return
    }

    this.bufferedOutput = Buffer.concat([
      this.bufferedOutput,
      bytes
    ], this.bufferedOutput.byteLength + bytes.byteLength)

    while (!this.closedError) {
      const lfIndex = this.bufferedOutput.indexOf(0x0a)
      if (lfIndex === -1) break

      const line = this.bufferedOutput.subarray(0, lfIndex)
      this.bufferedOutput = this.bufferedOutput.subarray(lfIndex + 1)
      if (!this.processLine(line)) return
    }

    if (this.bufferedOutput.byteLength > this.maxLineBytes) {
      this.fail(new PiJsonlTransportError(
        'line-output-limit',
        `Pi RPC record exceeded ${this.maxLineBytes} bytes`
      ))
    }
  }

  private readonly handleEnd = (): void => {
    if (this.closedError) return
    if (this.bufferedOutput.byteLength > 0) {
      const finalLine = this.bufferedOutput
      this.bufferedOutput = Buffer.alloc(0)
      if (!this.processLine(finalLine)) return
    }
    this.terminate(new PiJsonlTransportError(
      'closed',
      'Pi RPC output ended'
    ))
  }

  private readonly handleReadableClose = (): void => {
    this.close(new PiJsonlTransportError(
      'closed',
      'Pi RPC output stream closed'
    ))
  }

  private readonly handleReadableError = (cause: Error): void => {
    this.fail(new PiJsonlTransportError(
      'stream-error',
      `Pi RPC output stream failed: ${cause.message}`
    ))
  }

  private readonly handleWritableClose = (): void => {
    this.close(new PiJsonlTransportError(
      'closed',
      'Pi RPC input stream closed'
    ))
  }

  private readonly handleWritableError = (cause: Error): void => {
    this.fail(new PiJsonlTransportError(
      'write-error',
      `Pi RPC input stream failed: ${cause.message}`
    ))
  }

  private processLine(rawLine: Buffer): boolean {
    this.recordNumber++
    if (rawLine.byteLength > this.maxLineBytes) {
      this.fail(new PiJsonlTransportError(
        'line-output-limit',
        `Pi RPC record exceeded ${this.maxLineBytes} bytes`
      ))
      return false
    }

    const line = rawLine.at(-1) === 0x0d
      ? rawLine.subarray(0, -1)
      : rawLine
    if (line.byteLength === 0) return true

    let message: unknown
    try {
      message = JSON.parse(line.toString('utf8'))
    } catch {
      this.fail(new PiJsonlTransportError(
        'invalid-json',
        `Pi RPC record ${this.recordNumber} is not valid JSON`
      ))
      return false
    }

    if (
      isRecord(message) &&
      message.type === 'response' &&
      typeof message.id === 'string'
    ) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        pending.resolve(message)
        return true
      }
    }

    for (const listener of this.messageListeners) listener(message)
    return true
  }

  private writeLine(line: Buffer): void {
    if (this.closedError) throw this.closedError
    if (this.writable.destroyed || !this.writable.writable) {
      throw new PiJsonlTransportError(
        'write-error',
        'Pi RPC input stream is not writable'
      )
    }
    this.writable.write(line, (cause?: Error | null) => {
      if (cause) this.handleWritableError(cause)
    })
  }

  private toWriteError(cause: unknown): PiJsonlTransportError {
    if (cause instanceof PiJsonlTransportError) return cause
    const message = cause instanceof Error ? cause.message : String(cause)
    return new PiJsonlTransportError(
      'write-error',
      `Pi RPC input could not be written: ${message}`
    )
  }

  private fail(error: PiJsonlTransportError): void {
    if (this.closedError) return
    const listeners = Array.from(this.errorListeners)
    this.terminate(error)
    for (const listener of listeners) listener(error)
  }

  private terminate(error: Error): void {
    if (this.closedError) return
    this.closedError = error
    this.readable.off('data', this.handleData)
    this.readable.off('end', this.handleEnd)
    this.readable.off('close', this.handleReadableClose)
    this.readable.off('error', this.handleReadableError)
    this.writable.off('close', this.handleWritableClose)
    this.writable.off('error', this.handleWritableError)
    this.bufferedOutput = Buffer.alloc(0)

    const pending = Array.from(this.pendingRequests.values())
    this.pendingRequests.clear()
    for (const request of pending) request.reject(error)
  }
}
