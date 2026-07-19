class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value))
  }
}

// Node 25 exposes an incomplete experimental `localStorage` unless it is
// launched with --localstorage-file. That global can shadow jsdom/happy-dom's
// Storage implementation inside Vitest workers. Install a deterministic test
// storage so renderer tests exercise the browser contract on every Node version.
const localStorage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: localStorage
})
if (typeof window !== 'undefined' && window !== globalThis) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: localStorage
  })
}
