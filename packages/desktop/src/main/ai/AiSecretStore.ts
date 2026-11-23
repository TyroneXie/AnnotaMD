import keytar from 'keytar'

export interface AiSecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  /** Clears cached failed reads so the next get hits the OS again. */
  retryFailedReads?(): void
}

// Shared by Agent and settings instances for this process only. Keep rejected
// reads too: a canceled keychain prompt must not be retried by background work.
interface SecretRead {
  pending: Promise<string | null>
  failed: boolean
}

const readsByService = new Map<string, Map<string, SecretRead>>()

export class KeytarAiSecretStore implements AiSecretStore {
  private readonly reads: Map<string, SecretRead>

  constructor(private readonly service = 'annotamd.ai.workspace') {
    this.reads = readsByService.get(service) ?? new Map()
    readsByService.set(service, this.reads)
  }

  get(key: string): Promise<string | null> {
    const cached = this.reads.get(key)
    if (cached) return cached.pending
    const read: SecretRead = { pending: keytar.getPassword(this.service, key), failed: false }
    read.pending = read.pending.catch(error => {
      read.failed = true
      throw error
    })
    this.reads.set(key, read)
    return read.pending
  }

  retryFailedReads(): void {
    for (const [key, read] of this.reads) {
      if (read.failed) this.reads.delete(key)
    }
  }

  async set(key: string, value: string): Promise<void> {
    await keytar.setPassword(this.service, key, value)
    this.reads.set(key, { pending: Promise.resolve(value), failed: false })
  }

  async delete(key: string): Promise<void> {
    await keytar.deletePassword(this.service, key)
    this.reads.set(key, { pending: Promise.resolve(null), failed: false })
  }
}

/** True when the OS denied keychain access (sandboxed/dev runs), not a user cancel. */
export const isKeychainUnavailable = (error: unknown): boolean => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /EPERM|operation not permitted|keychain/i.test(code + ' ' + message)
}

/**
 * Tries the OS keychain first and keeps working when the keychain is not
 * reachable (typically an unsandboxed dev build on CI or a dev board):
 * reads fall through to the local store, writes move there, and the local
 * store is always consulted so keys saved during a fallback stay readable.
 */
export class FallbackAiSecretStore implements AiSecretStore {
  private fallbackActive = false
  private warned = false

  constructor(
    private readonly primary: AiSecretStore,
    private readonly fallback: AiSecretStore,
    private readonly onFallback?: (error: unknown) => void
  ) {}

  private activate(error: unknown): void {
    this.fallbackActive = true
    if (this.warned) return
    this.warned = true
    this.onFallback?.(error)
  }

  retryFailedReads(): void {
    this.primary.retryFailedReads?.()
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.primary.get(key)
      if (value) return value
      return await this.fallback.get(key)
    } catch (error) {
      if (!isKeychainUnavailable(error)) throw error
      this.activate(error)
      return this.fallback.get(key)
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await this.primary.set(key, value)
      if (this.fallbackActive) await this.fallback.delete(key)
    } catch (error) {
      if (!isKeychainUnavailable(error)) throw error
      this.activate(error)
      await this.fallback.set(key, value)
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.primary.delete(key)
    } catch (error) {
      if (!isKeychainUnavailable(error)) throw error
      this.activate(error)
    }
    await this.fallback.delete(key)
  }
}

/**
 * Packaged builds normally require the OS keychain. A packaged build launched
 * with ANNOTAMD_LOCAL_SECRETS=1 (for example an unsigned local trial build on a
 * test machine) may use the local file instead; unpackaged development builds
 * always may.
 */
export const shouldUseLocalSecrets = (
  isPackaged: boolean,
  env: Record<string, string | undefined> = process.env
): boolean => !isPackaged || env.ANNOTAMD_LOCAL_SECRETS === '1'
