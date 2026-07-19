import { ipcMain } from 'electron'
import type { AnnotaMDMcpClientId } from '@shared/types/mcpClients'
import {
  configureMcpClient,
  createCustomAgentManualConfig,
  inspectMcpClients
} from '../mcpClients'

export const registerMcpClientHandlers = (): void => {
  void inspectMcpClients()
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
