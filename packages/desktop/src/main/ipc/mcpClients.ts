import { ipcMain } from 'electron'
import type { AnnotaMDMcpClientId } from '@shared/types/mcpClients'
import {
  configureMcpClient,
  configurePortableCommentSkill,
  createCustomAgentManualConfig,
  inspectMcpClients,
  migrateConfiguredMcpClients
} from '../mcpClients'

let inspectionScheduled = false

export const scheduleMcpClientInspection = (delayMs = 1_000): void => {
  if (inspectionScheduled) return
  inspectionScheduled = true
  const timer = setTimeout(() => {
    void migrateConfiguredMcpClients()
  }, delayMs)
  timer.unref()
}

export const registerMcpClientHandlers = (): void => {
  ipcMain.handle(
    'annotamd::mcp-clients::inspect',
    (_event, forceRefresh = false) => inspectMcpClients(forceRefresh)
  )
  ipcMain.handle('annotamd::mcp-clients::configure', (_event, id: AnnotaMDMcpClientId) => (
    configureMcpClient(id)
  ))
  ipcMain.handle(
    'annotamd::mcp-clients::manual-config',
    () => createCustomAgentManualConfig()
  )
  ipcMain.handle(
    'annotamd::mcp-clients::install-portable-skill',
    () => configurePortableCommentSkill()
  )
}
