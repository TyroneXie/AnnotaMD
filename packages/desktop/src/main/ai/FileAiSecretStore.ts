import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AiSecretStore } from './AiSecretStore'

/**
 * File-backed secret store used only when the OS keychain is unavailable in a
 * development build. Values live in one JSON file with mode 0600. This is a
 * deliberate downgrade for local testing and must never be used by packaged
 * builds, which keep requiring the keychain.
 */
export class FileAiSecretStore implements AiSecretStore {
  private cache: Record<string, string> | null = null

  constructor(private readonly filePath: string) {}

  private read(): Record<string, string> {
    if (this.cache) return this.cache
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      this.cache = parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  private write(data: Record<string, string>): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  }

  async get(key: string): Promise<string | null> {
    return this.read()[key] ?? null
  }

  async set(key: string, value: string): Promise<void> {
    const data = { ...this.read(), [key]: value }
    this.write(data)
    this.cache = data
  }

  async delete(key: string): Promise<void> {
    const data = { ...this.read() }
    delete data[key]
    this.write(data)
    this.cache = data
  }
}
