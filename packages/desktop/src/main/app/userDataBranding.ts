import fs from 'fs'
import path from 'path'

const LEGACY_DEV_DIRECTORY = 'marktext-dev'
const ANNOTAMD_DEV_DIRECTORY = 'annotamd-dev'

export const getAnnotaMDDevUserDataPath = (appDataPath: string): string => {
  const legacyPath = path.join(appDataPath, LEGACY_DEV_DIRECTORY)
  const annotamdPath = path.join(appDataPath, ANNOTAMD_DEV_DIRECTORY)

  if (!fs.existsSync(annotamdPath) && fs.existsSync(legacyPath)) {
    fs.renameSync(legacyPath, annotamdPath)
  }

  return annotamdPath
}

export const migrateLegacyAssetPath = (
  storedPath: unknown,
  userDataPath: string,
  folderName: 'images' | 'screenshot'
): string => {
  const defaultPath = path.join(userDataPath, folderName)
  if (typeof storedPath !== 'string') return defaultPath

  const legacyPath = path.join(path.dirname(userDataPath), LEGACY_DEV_DIRECTORY, folderName)
  return path.normalize(storedPath) === path.normalize(legacyPath) ? defaultPath : storedPath
}
