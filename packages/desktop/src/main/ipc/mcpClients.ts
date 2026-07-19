import { ipcMain } from 'electron'
import type { AnnotaMDMcpClientId } from '@shared/types/mcpClients'
import {
  configureMcpClient,
  createCustomAgentManualConfig,
  inspectMcpClients
} from '../mcpClients'

let inspectionScheduled = false

export const scheduleMcpClientInspection = (delayMs = 1_000): void => {
  if (inspectionScheduled) return
  inspectionScheduled = true
  const timer = setTimeout(() => {
    void inspectMcpClients()
  }, delayMs)
  timer.unref()
}

export const registerMcpClientHandlers = (): void => {
  ipcMain.handle(
    'mt::mcp-clients::inspect',
    (_event, forceRefresh = false) => inspectMcpClients(forceRefresh)
  )
  ipcMain.handle('mt::mcp-clients::configure', (_event, id: AnnotaMDMcpClientId) => (
    configureMcpClient(id)
  ))
  ipcMain.handle(
    'mt::mcp-clients::manual-config',
    () => createCustomAgentManualConfig()
  )
}
