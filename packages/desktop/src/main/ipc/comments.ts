import { ipcMain } from 'electron'
import type {
  AnnotaMDCommentReplaceRequest,
  AnnotaMDLegacyCommentMigration
} from '@shared/types/comments'

export const registerCommentHandlers = (): void => {
  ipcMain.handle('annotamd::comments::mcp-status', async () => {
    const { getAgentBridgeStatus } = await import('../comments/AgentBridgeServer')
    return getAgentBridgeStatus()
  })

  ipcMain.handle('annotamd::comments::load', async (_event, filePath: string, markdown = '') => {
    const { getCommentService } = await import('../comments')
    return getCommentService().load(filePath, markdown)
  })

  ipcMain.handle('annotamd::comments::replace', async (_event, request: AnnotaMDCommentReplaceRequest) => {
    const { broadcastCommentsChanged, getCommentService } = await import('../comments')
    const document = getCommentService().replace(request)
    broadcastCommentsChanged(request.filePath)
    return document
  })

  ipcMain.handle(
    'annotamd::comments::migrate',
    async (_event, entries: AnnotaMDLegacyCommentMigration[]) => {
      const { getCommentService } = await import('../comments')
      return getCommentService().migrate(entries)
    }
  )

  ipcMain.handle('annotamd::comments::mark-missing', async (_event, filePath: string) => {
    const { getCommentService } = await import('../comments')
    getCommentService().markMissing(filePath)
  })
}
