import path from 'path'
import fs from 'fs-extra'

interface UpdateSupportOptions {
  resourcesPath?: string
  platform?: NodeJS.Platform
  appImagePath?: string
  pathExists?: (filePath: string) => boolean
}

export const isAppUpdateSupported = (options: UpdateSupportOptions = {}): boolean => {
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const platform = options.platform ?? process.platform
  const appImagePath = options.appImagePath ?? process.env.APPIMAGE
  const pathExists = options.pathExists ?? fs.pathExistsSync

  if (!resourcesPath || !pathExists(path.join(resourcesPath, 'app-update.yml'))) return false
  if (platform === 'darwin') return true
  if (platform === 'linux') return Boolean(appImagePath)
  if (platform === 'win32') {
    return (
      pathExists(path.join(resourcesPath, 'md.ico')) ||
      pathExists(path.join(resourcesPath, 'icons', 'md.ico'))
    )
  }
  return false
}
