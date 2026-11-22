import { ipcMain } from 'electron'
import { isSamePathSync, isImageFile } from 'common/filesystem/paths'
import { canonicalPath, grantFileAccess } from '../security/fileAccess'
import { hasImageHeader } from '../security/imageAccess'

export const registerPathHandlers = (): void => {
  // The renderer's preload computes isChildOfDirectory / hasMarkdownExtension
  // locally (pure string ops, no IPC). Only `is-same-sync` and `is-image`
  // require fs in the rare case-insensitive / image-file path checks.
  ipcMain.on('annotamd::paths::is-same-sync', (event, a: string, b: string) => {
    event.returnValue = isSamePathSync(a, b, true)
  })
  ipcMain.handle('annotamd::paths::is-image', async(event, p: string) => {
    const pathname = canonicalPath(p)
    if (!isImageFile(pathname)) return false
    try {
      if (!await hasImageHeader(pathname)) return false
      grantFileAccess(event.sender, pathname, false, false)
      return true
    } catch {
      return false
    }
  })
}
