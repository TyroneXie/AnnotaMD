import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { AgentDocumentRendererBridge } from '../agentDocumentBridge/AgentDocumentRendererBridge'
import { AgentDocumentScopeService } from '../agentDocumentBridge/AgentDocumentScopeService'
import { setAgentDocumentGateway } from '../comments/AgentBridgeServer'
import { AiStore } from './AiStore'
import { KeytarAiSecretStore } from './AiSecretStore'
import { ApiAskHost } from './ApiAskHost'
import { CliAgentHost } from './CliAgentHost'
import { PiAgentHost } from './PiAgentHost'
import { AiWorkspaceService } from './AiWorkspaceService'
import type { AiMcpLaunchSpec } from './AiHost'

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

const createAgentMcpSpec = (
  scopeToken: string,
  provider: string
): AiMcpLaunchSpec => {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'annotamd-mcp', 'index.mjs')
    : resolve(app.getAppPath(), '..', '..', 'tools', 'annotamd-mcp', 'dist', 'index.js')
  return {
    command: process.execPath,
    args: [script],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      ANNOTAMD_CLIENT_NAME: `annotamd-${provider}`,
      ANNOTAMD_AGENT_SCOPE_TOKEN: scopeToken,
      ANNOTAMD_AGENT_MUTATIONS: '0'
    },
    enabledTools: [
      'annotamd_list_comments',
      'annotamd_get_comment',
      'annotamd_reply_comment',
      'annotamd_get_context',
      'annotamd_read_document'
    ]
  }
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
  service = new AiWorkspaceService({
    store: new AiStore({
      databasePath,
      secrets: new KeytarAiSecretStore()
    }),
    apiHost: new ApiAskHost(),
    cliHost: new CliAgentHost(),
    piHost: new PiAgentHost({
      documentScopes: scopeService,
      adapterPath: piAdapterPath
    }),
    documentScopes: scopeService,
    createMcpLaunchSpec: createAgentMcpSpec,
    prepareAgentRun: async() => {
      await setAgentDocumentGateway(scopeService)
    },
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
  await setAgentDocumentGateway(null)
}
