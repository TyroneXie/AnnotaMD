import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CommentService } from './CommentService'

let service: CommentService | null = null

export const getCommentService = (): CommentService => {
  service ??= new CommentService({
    databasePath: join(app.getPath('userData'), 'annotations.sqlite')
  })
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
