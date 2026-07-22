import path from 'path'
import { spawnSync } from 'node:child_process'
import fs from 'fs-extra'

interface UpdateSupportOptions {
  resourcesPath?: string
  platform?: NodeJS.Platform
  appImagePath?: string
  executablePath?: string
  pathExists?: (filePath: string) => boolean
  hasTrustedMacSignature?: (executablePath: string) => boolean
}

const hasTrustedMacSignature = (executablePath: string): boolean => {
  const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', executablePath], {
    encoding: 'utf8'
  })
  const signatureInfo = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  return (
    result.status === 0 &&
    !signatureInfo.includes('Signature=adhoc') &&
    !signatureInfo.includes('TeamIdentifier=not set')
  )
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

export const isAutomaticUpdateInstallSupported = (
  options: UpdateSupportOptions = {}
): boolean => {
  if (!isAppUpdateSupported(options)) return false
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin') return true

  const executablePath = options.executablePath ?? process.execPath
  const signatureCheck = options.hasTrustedMacSignature ?? hasTrustedMacSignature
  return signatureCheck(executablePath)
}
