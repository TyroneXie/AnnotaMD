import { ipcMain } from 'electron'
import type {
  AnnotaMDCommentReplaceRequest,
  AnnotaMDLegacyCommentMigration
} from '@shared/types/comments'

export const registerCommentHandlers = (): void => {
  ipcMain.handle('mt::comments::mcp-status', async () => {
    const { getAgentBridgeStatus } = await import('../comments/AgentBridgeServer')
    return getAgentBridgeStatus()
  })

  ipcMain.handle('mt::comments::load', async (_event, filePath: string, markdown = '') => {
    const { getCommentService } = await import('../comments')
    return getCommentService().load(filePath, markdown)
  })

  ipcMain.handle('mt::comments::replace', async (_event, request: AnnotaMDCommentReplaceRequest) => {
    const { broadcastCommentsChanged, getCommentService } = await import('../comments')
    const document = getCommentService().replace(request)
    broadcastCommentsChanged(request.filePath)
    return document
  })

  ipcMain.handle(
    'mt::comments::migrate',
    async (_event, entries: AnnotaMDLegacyCommentMigration[]) => {
      const { getCommentService } = await import('../comments')
      return getCommentService().migrate(entries)
    }
  )

  ipcMain.handle('mt::comments::mark-missing', async (_event, filePath: string) => {
    const { getCommentService } = await import('../comments')
    getCommentService().markMissing(filePath)
  })
}
