import { ipcMain } from 'electron'
import type {
  AnnotaMDCommentReplaceRequest,
  AnnotaMDLegacyCommentMigration
} from '@shared/types/comments'
import { broadcastCommentsChanged, getCommentService } from '../comments'
import { getAgentBridgeStatus } from '../comments/AgentBridgeServer'

export const registerCommentHandlers = (): void => {
  ipcMain.handle('mt::comments::mcp-status', () => getAgentBridgeStatus())

  ipcMain.handle('mt::comments::load', (_event, filePath: string, markdown = '') =>
    getCommentService().load(filePath, markdown))

  ipcMain.handle('mt::comments::replace', (_event, request: AnnotaMDCommentReplaceRequest) => {
    const document = getCommentService().replace(request)
    broadcastCommentsChanged(request.filePath)
    return document
  })

  ipcMain.handle(
    'mt::comments::migrate',
    (_event, entries: AnnotaMDLegacyCommentMigration[]) => getCommentService().migrate(entries)
  )

  ipcMain.handle('mt::comments::mark-missing', (_event, filePath: string) => {
    getCommentService().markMissing(filePath)
  })
}
