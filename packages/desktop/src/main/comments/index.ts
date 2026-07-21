import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getAnnotaMDCommentDatabasePath } from '../app/userDataBranding'
import { CommentService } from './CommentService'

let service: CommentService | null = null
let closeListenerRegistered = false

const handleBeforeQuit = (): void => {
  closeListenerRegistered = false
  closeCommentService()
}

export const getCommentService = (): CommentService => {
  if (!service) {
    const databasePath = getAnnotaMDCommentDatabasePath({
      appDataPath: app.getPath('appData'),
      userDataPath: app.getPath('userData'),
      isDevelopment: process.env.NODE_ENV === 'development',
      isAutomatedTest: process.env.PERF_TESTING === 'true'
    })
    mkdirSync(dirname(databasePath), { recursive: true })
    service = new CommentService({
      databasePath
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
