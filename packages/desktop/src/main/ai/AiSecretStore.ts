import keytar from 'keytar'

export interface AiSecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export class KeytarAiSecretStore implements AiSecretStore {
  constructor(private readonly service = 'annotamd.ai.workspace') {}

  get(key: string): Promise<string | null> {
    return keytar.getPassword(this.service, key)
  }

  async set(key: string, value: string): Promise<void> {
    await keytar.setPassword(this.service, key, value)
  }

  async delete(key: string): Promise<void> {
    await keytar.deletePassword(this.service, key)
  }
}
