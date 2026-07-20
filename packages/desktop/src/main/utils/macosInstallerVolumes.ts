import path from 'path'
import fsPromises from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execFileAsync = promisify(execFile)
const LAUNCH_SERVICES_REGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
const INSTALLER_VOLUME_NAME = /^AnnotaMD \d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

interface CleanupOptions {
  platform: NodeJS.Platform
  isPackaged: boolean
  executablePath: string
  volumesRoot?: string
}

interface InstallerVolumeEntry {
  name: string
  isDirectory: () => boolean
}

interface CleanupDependencies {
  readdir: (directoryPath: string) => Promise<InstallerVolumeEntry[]>
  access: (filePath: string) => Promise<unknown>
  runCommand: (command: string, args: string[]) => Promise<unknown>
}

const defaultDependencies: CleanupDependencies = {
  readdir: (directoryPath) => fsPromises.readdir(directoryPath, { withFileTypes: true }),
  access: fsPromises.access,
  runCommand: execFileAsync
}

export const cleanupMountedAnnotaMdInstallers = async (
  options: CleanupOptions,
  dependencies: CleanupDependencies = defaultDependencies
): Promise<string[]> => {
  const { platform, isPackaged, executablePath, volumesRoot = '/Volumes' } = options
  const resolvedExecutablePath = path.resolve(executablePath)
  if (
    platform !== 'darwin' ||
    !isPackaged ||
    resolvedExecutablePath.startsWith('/Volumes/') ||
    resolvedExecutablePath.includes('/AppTranslocation/')
  ) {
    return []
  }

  let entries: InstallerVolumeEntry[]
  try {
    entries = await dependencies.readdir(volumesRoot)
  } catch (error) {
    log.warn('Unable to inspect mounted AnnotaMD installers:', error)
    return []
  }

  const detached: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !INSTALLER_VOLUME_NAME.test(entry.name)) continue

    const volumePath = path.join(volumesRoot, entry.name)
    const installerAppPath = path.join(volumePath, 'AnnotaMD.app')
    try {
      await dependencies.access(installerAppPath)
    } catch {
      continue
    }

    try {
      await dependencies.runCommand(LAUNCH_SERVICES_REGISTER, ['-u', installerAppPath])
    } catch (error) {
      log.warn(`Unable to unregister mounted AnnotaMD installer at ${installerAppPath}:`, error)
    }

    try {
      await dependencies.runCommand('hdiutil', ['detach', volumePath])
      detached.push(volumePath)
    } catch (error) {
      log.warn(`Unable to detach mounted AnnotaMD installer at ${volumePath}:`, error)
    }
  }

  return detached
}
