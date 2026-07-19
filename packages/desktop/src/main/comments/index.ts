import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CommentService } from './CommentService'

let service: CommentService | null = null
let closeListenerRegistered = false

const handleBeforeQuit = (): void => {
  closeListenerRegistered = false
  closeCommentService()
}

export const getCommentService = (): CommentService => {
  if (!service) {
    service = new CommentService({
      databasePath: join(app.getPath('userData'), 'annotations.sqlite')
    })
    if (!closeListenerRegistered) {
      closeListenerRegistered = true
      app.once('before-quit', handleBeforeQuit)
    }
  }
  return service
}

export const broadcastCommentsChanged = (filePath: string): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('mt::comments::changed', filePath)
  }
}

export const closeCommentService = (): void => {
  service?.close()
  service = null
}
