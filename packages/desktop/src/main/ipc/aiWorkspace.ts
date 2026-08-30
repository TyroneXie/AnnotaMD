import { app, BrowserWindow, ipcMain, type WebContents } from 'electron'
import type {
  AiChangeSetResolveRequest,
  AiApprovalResolveRequest,
  AiCliDetectionRequest,
  AiConfigSaveRequest,
  AiConversationCreateRequest,
  AiConversationRenameRequest,
  AiRetryRequest,
  AiSendRequest,
  AiStopRequest,
  AiTemplateSaveRequest,
  AiWorkspacePreferences
} from '@shared/types/aiWorkspace'
import type { AgentDocumentTransactionBridgeResponse } from '@shared/types/agentDocumentTransactions'
import {
  disposeAiWorkspace,
  getAiDocumentRendererBridge,
  getAiWorkspaceService
} from '../ai'
import type { AiWorkspaceOwner } from '../ai/AiWorkspaceService'

const asOwner = (sender: WebContents): AiWorkspaceOwner => ({
  id: sender.id,
  send: (channel, event) => sender.send(channel, event),
  isDestroyed: () => sender.isDestroyed()
})

const windowIdFor = (sender: WebContents): number => {
  const window = BrowserWindow.fromWebContents(sender)
  if (!window) throw new Error('The AI workspace requires an editor window.')
  return window.id
}

export const registerAiWorkspaceHandlers = (): void => {
  ipcMain.handle('annotamd::ai::snapshot', event => (
    getAiWorkspaceService().getSnapshot(asOwner(event.sender))
  ))
  ipcMain.handle('annotamd::ai::preferences:get', event => (
    getAiWorkspaceService().getPreferences(asOwner(event.sender))
  ))
  ipcMain.handle(
    'annotamd::ai::preferences:save',
    (event, preferences: AiWorkspacePreferences) => (
      getAiWorkspaceService().savePreferences(asOwner(event.sender), preferences)
    )
  )
  ipcMain.handle('annotamd::ai::configs:list', event => (
    getAiWorkspaceService().listConfigs(asOwner(event.sender))
  ))
  ipcMain.handle(
    'annotamd::ai::configs:save',
    (event, request: AiConfigSaveRequest) => (
      getAiWorkspaceService().saveConfig(asOwner(event.sender), request)
    )
  )
  ipcMain.handle('annotamd::ai::configs:delete', (event, configId: string) => (
    getAiWorkspaceService().deleteConfig(asOwner(event.sender), configId)
  ))
  ipcMain.handle('annotamd::ai::configs:test', (event, configId: string) => (
    getAiWorkspaceService().testConfig(asOwner(event.sender), configId)
  ))
  ipcMain.handle('annotamd::ai::configs:models', (event, configId: string) => (
    getAiWorkspaceService().listModels(asOwner(event.sender), configId)
  ))
  ipcMain.handle(
    'annotamd::ai::configs:detect-cli',
    (event, request: AiCliDetectionRequest) => (
      getAiWorkspaceService().detectCli(asOwner(event.sender), request)
    )
  )

  ipcMain.handle('annotamd::ai::conversations:list', event => (
    getAiWorkspaceService().listConversations(asOwner(event.sender))
  ))
  ipcMain.handle(
    'annotamd::ai::conversations:create',
    (event, request: AiConversationCreateRequest) => (
      getAiWorkspaceService().createConversation(asOwner(event.sender), request)
    )
  )
  ipcMain.handle('annotamd::ai::conversations:select', (event, conversationId: string) => {
    const service = getAiWorkspaceService()
    const owner = asOwner(event.sender)
    const messages = service.selectConversation(owner, conversationId)
    return { messages, changeSets: service.listChangeSets(owner, conversationId) }
  })
  ipcMain.handle(
    'annotamd::ai::conversations:rename',
    (event, request: AiConversationRenameRequest) => (
      getAiWorkspaceService().renameConversation(
        asOwner(event.sender),
        request.conversationId,
        request.title
      )
    )
  )
  ipcMain.handle('annotamd::ai::conversations:delete', (event, conversationId: string) => (
    getAiWorkspaceService().deleteConversation(asOwner(event.sender), conversationId)
  ))

  ipcMain.handle('annotamd::ai::templates:list', event => (
    getAiWorkspaceService().listTemplates(asOwner(event.sender))
  ))
  ipcMain.handle(
    'annotamd::ai::templates:save',
    (event, request: AiTemplateSaveRequest) => (
      getAiWorkspaceService().saveTemplate(asOwner(event.sender), request)
    )
  )
  ipcMain.handle('annotamd::ai::templates:delete', (event, templateId: string) => (
    getAiWorkspaceService().deleteTemplate(asOwner(event.sender), templateId)
  ))

  ipcMain.handle('annotamd::ai::change-sets:list', (event, conversationId: string) => (
    getAiWorkspaceService().listChangeSets(asOwner(event.sender), conversationId)
  ))
  ipcMain.handle(
    'annotamd::ai::change-sets:resolve',
    (event, request: AiChangeSetResolveRequest) => (
      getAiWorkspaceService().resolveChangeSet(
        asOwner(event.sender),
        request,
        windowIdFor(event.sender)
      )
    )
  )

  ipcMain.handle('annotamd::ai::send', (event, request: AiSendRequest) => (
    getAiWorkspaceService().send(asOwner(event.sender), request, windowIdFor(event.sender))
  ))
  ipcMain.handle('annotamd::ai::stop', (event, request: AiStopRequest) => (
    getAiWorkspaceService().stop(asOwner(event.sender), request)
  ))
  ipcMain.handle('annotamd::ai::approvals:resolve', (event, request: AiApprovalResolveRequest) => (
    getAiWorkspaceService().resolveApproval(asOwner(event.sender), request)
  ))
  ipcMain.handle('annotamd::ai::retry', (event, request: AiRetryRequest) => (
    getAiWorkspaceService().retry(asOwner(event.sender), request, windowIdFor(event.sender))
  ))

  ipcMain.on(
    'annotamd::ai-workspace::document-transaction-response',
    (event, response: AgentDocumentTransactionBridgeResponse) => {
      getAiDocumentRendererBridge().handleResponse(event.sender.id, response)
    }
  )

  app.once('before-quit', () => {
    void disposeAiWorkspace()
  })
}
