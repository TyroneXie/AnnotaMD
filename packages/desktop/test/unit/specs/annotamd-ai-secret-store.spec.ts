// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeytarAiSecretStore } from '../../../src/main/ai/AiSecretStore'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileAiSecretStore } from '../../../src/main/ai/FileAiSecretStore'
import { FallbackAiSecretStore, isKeychainUnavailable, shouldUseLocalSecrets } from '../../../src/main/ai/AiSecretStore'

const native = vi.hoisted(() => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn()
}))

vi.mock('keytar', () => ({ default: native }))

let SecretStore: typeof KeytarAiSecretStore

beforeEach(async() => {
  vi.resetModules()
  native.getPassword.mockReset()
  native.setPassword.mockReset().mockResolvedValue(undefined)
  native.deletePassword.mockReset().mockResolvedValue(true)
  SecretStore = (await import('../../../src/main/ai/AiSecretStore')).KeytarAiSecretStore
})

describe('AI keychain reads', () => {
  it('shares pending and completed reads across the Agent and settings stores', async() => {
    let complete!: (value: string) => void
    native.getPassword.mockImplementation(() => new Promise<string>(resolve => { complete = resolve }))
    const agent = new SecretStore()
    const settings = new SecretStore()
    const first = agent.get('provider')
    const second = settings.get('provider')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
    complete('saved-key')
    await expect(Promise.all([first, second])).resolves.toEqual(['saved-key', 'saved-key'])
    await expect(new SecretStore().get('provider')).resolves.toBe('saved-key')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('remembers missing entries without repeated OS queries', async() => {
    native.getPassword.mockResolvedValue(null)
    await expect(new SecretStore().get('missing')).resolves.toBeNull()
    await expect(new SecretStore().get('missing')).resolves.toBeNull()
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('does not automatically retry a denied or failed read', async() => {
    const denied = new Error('The user canceled the operation.')
    native.getPassword.mockRejectedValue(denied)
    for (let index = 0; index < 4; index++) {
      await expect(new SecretStore().get('provider')).rejects.toBe(denied)
    }
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('keeps services and accounts separate', async() => {
    native.getPassword.mockImplementation(async(service: string, account: string) => `${service}/${account}`)
    await expect(new SecretStore('first').get('a')).resolves.toBe('first/a')
    await expect(new SecretStore('second').get('a')).resolves.toBe('second/a')
    await expect(new SecretStore('first').get('b')).resolves.toBe('first/b')
    expect(native.getPassword).toHaveBeenCalledTimes(3)
  })

  it('retries a denied read only after an explicit request from another store', async() => {
    native.getPassword.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValue('saved-key')
    const agent = new SecretStore()
    await expect(agent.get('provider')).rejects.toThrow('Access denied')
    new SecretStore().retryFailedReads()
    await expect(agent.get('provider')).resolves.toBe('saved-key')
    expect(native.getPassword).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate pending, successful or missing reads when retrying failures', async() => {
    let complete!: (value: string) => void
    native.getPassword.mockResolvedValueOnce('saved-key').mockResolvedValueOnce(null)
      .mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve }))
    const store = new SecretStore()
    await store.get('saved')
    await store.get('missing')
    const pending = store.get('pending')
    new SecretStore().retryFailedReads()
    await expect(store.get('saved')).resolves.toBe('saved-key')
    await expect(store.get('missing')).resolves.toBeNull()
    expect(store.get('pending')).toBe(pending)
    complete('pending-key')
    await pending
    expect(native.getPassword).toHaveBeenCalledTimes(3)
  })

  it('uses a saved key across instances without another read prompt', async() => {
    native.getPassword.mockResolvedValue('old-key')
    const agent = new SecretStore()
    await agent.get('provider')
    await new SecretStore().set('provider', 'new-key')
    await expect(agent.get('provider')).resolves.toBe('new-key')
    expect(native.setPassword).toHaveBeenCalledWith('annotamd.ai.workspace', 'provider', 'new-key')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('recovers from a denied read after explicitly saving a key', async() => {
    native.getPassword.mockRejectedValue(new Error('Access denied'))
    const store = new SecretStore()
    await expect(store.get('provider')).rejects.toThrow('Access denied')
    await new SecretStore().set('provider', 'replacement')
    await expect(store.get('provider')).resolves.toBe('replacement')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous cached key when saving fails', async() => {
    native.getPassword.mockResolvedValue('old-key')
    const store = new SecretStore()
    await store.get('provider')
    native.setPassword.mockRejectedValue(new Error('Write denied'))
    await expect(store.set('provider', 'new-key')).rejects.toThrow('Write denied')
    await expect(store.get('provider')).resolves.toBe('old-key')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('forgets a deleted key across instances', async() => {
    native.getPassword.mockResolvedValue('old-key')
    const store = new SecretStore()
    await store.get('provider')
    await new SecretStore().delete('provider')
    await expect(store.get('provider')).resolves.toBeNull()
    expect(native.deletePassword).toHaveBeenCalledWith('annotamd.ai.workspace', 'provider')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it('retains the cached key when deleting fails', async() => {
    native.getPassword.mockResolvedValue('old-key')
    const store = new SecretStore()
    await store.get('provider')
    native.deletePassword.mockRejectedValue(new Error('Delete denied'))
    await expect(store.delete('provider')).rejects.toThrow('Delete denied')
    await expect(store.get('provider')).resolves.toBe('old-key')
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })

  it.each(['save', 'delete'] as const)('does not restore a stale read after a %s', async(action) => {
    let complete!: (value: string) => void
    native.getPassword.mockImplementation(() => new Promise<string>(resolve => { complete = resolve }))
    const store = new SecretStore()
    const oldRead = store.get('provider')
    if (action === 'save') await new SecretStore().set('provider', 'new-key')
    else await new SecretStore().delete('provider')
    complete('old-key')
    await oldRead
    await expect(store.get('provider')).resolves.toBe(action === 'save' ? 'new-key' : null)
    expect(native.getPassword).toHaveBeenCalledTimes(1)
  })
})
describe('development keychain fallback', () => {
  const tempStore = () => {
    const dir = mkdtempSync(join(tmpdir(), 'annotamd-secrets-'))
    return { file: join(dir, 'ai-secrets-dev.json'), store: new FileAiSecretStore(join(dir, 'ai-secrets-dev.json')) }
  }

  it('treats only OS denials as an unavailable keychain', () => {
    const denied = Object.assign(new Error('UNIX[Operation not permitted]'), { code: 'EPERM' })
    expect(isKeychainUnavailable(denied)).toBe(true)
    expect(isKeychainUnavailable(new Error('The user canceled the operation.'))).toBe(false)
  })

  it('writes to a 0600 file when the keychain is denied', async() => {
    const { file, store } = tempStore()
    const denial = Object.assign(new Error('UNIX[Operation not permitted]'), { code: 'EPERM' })
    const primary = {
      get: vi.fn().mockRejectedValue(denial),
      set: vi.fn().mockRejectedValue(denial),
      delete: vi.fn().mockRejectedValue(denial)
    }
    const fallback = new FallbackAiSecretStore(primary, store)

    await fallback.set('provider', 'sk-local')
    await expect(fallback.get('provider')).resolves.toBe('sk-local')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ provider: 'sk-local' })

    await fallback.delete('provider')
    await expect(store.get('provider')).resolves.toBeNull()
  })

  it('keeps cancellation an error instead of quietly using the file', async() => {
    const { store } = tempStore()
    const cancelled = new Error('The user canceled the operation.')
    const primary = {
      get: vi.fn().mockRejectedValue(cancelled),
      set: vi.fn().mockRejectedValue(cancelled),
      delete: vi.fn().mockRejectedValue(cancelled)
    }
    const fallback = new FallbackAiSecretStore(primary, store)

    await expect(fallback.get('provider')).rejects.toBe(cancelled)
    await expect(store.get('provider')).resolves.toBeNull()
  })

  it('uses the keychain when it works and never touches the file', async() => {
    const { file, store } = tempStore()
    const primary = {
      get: vi.fn().mockResolvedValue('from-keychain'),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    }
    const fallback = new FallbackAiSecretStore(primary, store)

    await expect(fallback.get('provider')).resolves.toBe('from-keychain')
    await fallback.set('provider', 'next')
    await expect(store.get('provider')).resolves.toBeNull()
    expect(() => statSync(file)).toThrow()
  })
})
describe('local secret fallback opt-in', () => {
  it('always allows unpackaged development builds', () => {
    expect(shouldUseLocalSecrets(false, {})).toBe(true)
  })

  it('keeps packaged builds on the keychain unless explicitly opted in', () => {
    expect(shouldUseLocalSecrets(true, {})).toBe(false)
    expect(shouldUseLocalSecrets(true, { ANNOTAMD_LOCAL_SECRETS: '1' })).toBe(true)
  })
})
