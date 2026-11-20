import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  PiModelsUpdateRequest,
  PiProviderEntry,
  PiProviderModelsRequest,
  PiProviderSaveRequest,
  PiSettingsState
} from '@shared/types/piProvider'
import { getAiWorkspaceService } from '../ai'
import { KeytarAiSecretStore } from '../ai/AiSecretStore'
import {
  defaultModelFor,
  defaultProviderFor,
  fetchPiModels,
  modelsEndpoint,
  normalizeBaseUrl,
  normalizeModelList,
  readPiProviderKey,
  readPiProviderKeys,
  readPiSettings,
  secretKeyFor,
  uniqueProviderId,
  writePiSettings
} from '../ai/PiProviderSettings'

const settingsPath = (): string => join(app.getPath('userData'), 'pi-provider.json')
const secrets = new KeytarAiSecretStore()

const snapshot = async(): Promise<PiSettingsState> => {
  const settings = await readPiSettings(settingsPath())
  return { ...settings, keyedProviderIds: [...(await readPiProviderKeys(settings, secrets)).keys()] }
}

let pendingMutation: Promise<unknown> = Promise.resolve()
const mutate = (action: () => Promise<void>): Promise<PiSettingsState> => {
  const next = pendingMutation.then(async() => {
    await action()
    await getAiWorkspaceService().notifyPiSettingsChanged()
    return await snapshot()
  })
  pendingMutation = next.catch(() => undefined)
  return next
}

const buildProvider = (
  request: PiProviderSaveRequest,
  id: string,
  existing?: PiProviderEntry
): PiProviderEntry => {
  if (request.kind !== 'openai' && request.kind !== 'anthropic') {
    throw new Error('Choose an interface type.')
  }
  const name = request.name.trim()
  if (!name) throw new Error('Enter a name for the endpoint.')
  const provider: PiProviderEntry = {
    id,
    name,
    kind: request.kind,
    baseUrl: normalizeBaseUrl(request.kind, request.baseUrl),
    enabled: request.enabled ?? existing?.enabled ?? true,
    models: existing?.models ?? [],
    ...(existing?.defaultModel ? { defaultModel: existing.defaultModel } : {}),
    ...(request.modelsUrl?.trim() ? { modelsUrl: request.modelsUrl.trim() } : {}),
    ...(request.kind === 'openai' && request.apiFormat === 'responses'
      ? { apiFormat: 'responses' as const }
      : {}),
    ...(request.kind === 'anthropic' && request.authStyle === 'bearer'
      ? { authStyle: 'bearer' as const }
      : {})
  }
  if (provider.modelsUrl) modelsEndpoint(provider)
  return provider
}

export const registerPiProviderHandlers = (): void => {
  ipcMain.handle('annotamd::pi::settings:get', async() => await snapshot())

  ipcMain.handle(
    'annotamd::pi::provider:save',
    (_event, request: PiProviderSaveRequest) => mutate(async() => {
      const settings = await readPiSettings(settingsPath())
      const existing = request.id
        ? settings.providers.find(provider => provider.id === request.id)
        : undefined
      if (request.id && !existing) throw new Error('This provider no longer exists.')
      const id = existing?.id ?? uniqueProviderId(settings, request.name)
      const provider = buildProvider(request, id, existing)
      const providers = existing
        ? settings.providers.map(item => item.id === id ? provider : item)
        : [...settings.providers, provider]
      const defaultProviderId = defaultProviderFor(
        providers, request.makeDefault ? id : settings.defaultProviderId
      )?.id

      if (typeof request.apiKey === 'string') {
        const apiKey = request.apiKey.trim()
        if (apiKey) await secrets.set(secretKeyFor(id), apiKey)
        else await secrets.delete(secretKeyFor(id))
      }

      const legacyKeyProviderId = settings.legacyKeyProviderId === id && typeof request.apiKey === 'string'
        ? undefined
        : settings.legacyKeyProviderId
      await writePiSettings(settingsPath(), { providers, defaultProviderId, legacyKeyProviderId })
    })
  )

  ipcMain.handle('annotamd::pi::provider:delete', (_event, providerId: string) => mutate(async() => {
    const settings = await readPiSettings(settingsPath())
    const providers = settings.providers.filter(provider => provider.id !== providerId)
    const defaultProviderId = defaultProviderFor(providers, settings.defaultProviderId)?.id
    await secrets.delete(secretKeyFor(providerId))
    const legacyKeyProviderId = settings.legacyKeyProviderId === providerId
      ? undefined
      : settings.legacyKeyProviderId
    await writePiSettings(settingsPath(), { providers, defaultProviderId, legacyKeyProviderId })
  }))

  ipcMain.handle(
    'annotamd::pi::provider:models',
    async(_event, request: PiProviderModelsRequest) => {
      const settings = await readPiSettings(settingsPath())
      const stored = request.providerId
        ? settings.providers.find(provider => provider.id === request.providerId)
        : undefined
      const draft = request.draft
      const provider = draft
        ? buildProvider(draft, stored?.id ?? 'draft', stored)
        : stored
      if (!provider) throw new Error('Choose a provider first.')
      const apiKey = request.apiKey?.trim()
        || (stored ? await readPiProviderKey(settings, secrets, stored.id) : '')
        || ''
      return await fetchPiModels(provider, apiKey)
    }
  )

  ipcMain.handle(
    'annotamd::pi::models:update',
    (_event, request: PiModelsUpdateRequest) => mutate(async() => {
      const settings = await readPiSettings(settingsPath())
      const providers = settings.providers.map((provider) => {
        if (provider.id !== request.providerId) return provider
        const models = normalizeModelList(request.models)
        const defaultModel = defaultModelFor(models, request.defaultModel?.trim() || provider.defaultModel)
        return { ...provider, models, defaultModel }
      })
      await writePiSettings(settingsPath(), { ...settings, providers })
    })
  )
}
