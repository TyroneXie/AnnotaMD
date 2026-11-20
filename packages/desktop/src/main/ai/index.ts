import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { AgentDocumentRendererBridge } from '../agentDocumentBridge/AgentDocumentRendererBridge'
import { AgentDocumentScopeService } from '../agentDocumentBridge/AgentDocumentScopeService'
import { getCommentService } from '../comments'
import { AiStore } from './AiStore'
import { KeytarAiSecretStore } from './AiSecretStore'
import { ApiAskHost } from './ApiAskHost'
import { PiAgentHost } from './PiAgentHost'
import { AiWorkspaceService } from './AiWorkspaceService'

let service: AiWorkspaceService | null = null
let rendererBridge: AgentDocumentRendererBridge | null = null
let scopeService: AgentDocumentScopeService | null = null

const createRendererBridge = (): AgentDocumentRendererBridge => new AgentDocumentRendererBridge(
  (windowId) => {
    const window = BrowserWindow.fromId(windowId)
    if (!window) return null
    return {
      id: window.webContents.id,
      isDestroyed: () => window.isDestroyed() || window.webContents.isDestroyed(),
      send: (channel, payload) => window.webContents.send(channel, payload)
    }
  }
)

/**
 * Pi ships inside the application so no user installation of Pi or Node.js is
 * required. Development runs read the workspace dependency instead.
 */
const bundledPiCliPaths = (): string[] => {
  const root = app.isPackaged
    ? join(process.resourcesPath, 'pi')
    : resolve(app.getAppPath(), 'resources', 'pi')
  return [join(root, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js')]
}

const piAdapterPath = (): string => (
  app.isPackaged
    ? resolve(process.resourcesPath, 'pi-adapter', 'adapter.mjs')
    : resolve(app.getAppPath(), 'resources', 'pi-adapter', 'adapter.mjs')
)

export const getAiWorkspaceService = (): AiWorkspaceService => {
  if (service) return service
  const databasePath = join(app.getPath('userData'), 'ai-workspace.sqlite')
  const agentWorkspacePath = join(app.getPath('userData'), 'agent-workspace')
  mkdirSync(dirname(databasePath), { recursive: true })
  mkdirSync(agentWorkspacePath, { recursive: true })
  rendererBridge = createRendererBridge()
  scopeService = new AgentDocumentScopeService(
    candidate => rendererBridge!.applyCandidate(candidate),
    candidate => rendererBridge!.readSnapshot(candidate)
  )
  const secrets = new KeytarAiSecretStore()
  service = new AiWorkspaceService({
    store: new AiStore({
      databasePath,
      secrets
    }),
    apiHost: new ApiAskHost(),
    piHost: new PiAgentHost({
      documentScopes: scopeService,
      readDocumentComments: filePath => getCommentService().readDocumentComments(filePath),
      adapterPath: piAdapterPath,
      bundledCliPaths: bundledPiCliPaths,
      providerSettingsPath: () => join(app.getPath('userData'), 'pi-provider.json'),
      agentDirectory: () => join(app.getPath('userData'), 'pi-agent'),
      secretStore: secrets
    }),
    documentScopes: scopeService,
    documentTransactions: rendererBridge,
    agentWorkspacePath
  })
  return service
}

export const getAiDocumentRendererBridge = (): AgentDocumentRendererBridge => {
  getAiWorkspaceService()
  return rendererBridge!
}

export const stopAiRunsForDocument = async(filePath: string): Promise<number> => (
  service ? await service.stopForDocument(filePath) : 0
)

export const disposeAiWorkspace = async(): Promise<void> => {
  const currentService = service
  const currentBridge = rendererBridge
  service = null
  rendererBridge = null
  scopeService = null
  currentService?.dispose()
  currentBridge?.dispose()
}
