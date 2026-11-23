import { app } from 'electron'
import { join } from 'node:path'
import {
  FallbackAiSecretStore,
  KeytarAiSecretStore,
  shouldUseLocalSecrets,
  type AiSecretStore
} from './AiSecretStore'
import { FileAiSecretStore } from './FileAiSecretStore'

/**
 * Packaged builds require the OS keychain unless ANNOTAMD_LOCAL_SECRETS=1 is
 * set explicitly. Development builds (including the unpackaged dev preview)
 * fall back to a 0600 JSON file in userData when the keychain is unreachable, so
 * providers can be configured without a login keychain.
 */
export const createAiSecretStore = (): AiSecretStore => {
  const primary = new KeytarAiSecretStore()
  if (!shouldUseLocalSecrets(app.isPackaged)) return primary
  const filePath = join(app.getPath('userData'), 'ai-secrets-dev.json')
  return new FallbackAiSecretStore(primary, new FileAiSecretStore(filePath), error => {
    console.warn(
      `[ai] the OS keychain is unavailable; storing AI keys in ${filePath} for this development build`,
      error
    )
  })
}