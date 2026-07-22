import path from 'path'

const ANNOTAMD_DEV_DIRECTORY = 'annotamd-dev'
const ANNOTAMD_PRODUCTION_DIRECTORY = 'AnnotaMD'

interface CommentDatabasePathOptions {
  appDataPath: string
  userDataPath: string
  isDevelopment: boolean
  isAutomatedTest?: boolean
}

export const getAnnotaMDDevUserDataPath = (appDataPath: string): string => {
  return path.join(appDataPath, ANNOTAMD_DEV_DIRECTORY)
}

export const getAnnotaMDCommentDatabasePath = ({
  appDataPath,
  userDataPath,
  isDevelopment,
  isAutomatedTest = false
}: CommentDatabasePathOptions): string => {
  const directory = isDevelopment && !isAutomatedTest
    ? path.join(appDataPath, ANNOTAMD_PRODUCTION_DIRECTORY)
    : userDataPath
  return path.join(directory, 'annotamd.sqlite')
}

export const resolveAssetPath = (
  storedPath: unknown,
  userDataPath: string,
  folderName: 'images' | 'screenshot'
): string => {
  const defaultPath = path.join(userDataPath, folderName)
  if (typeof storedPath !== 'string') return defaultPath

  return storedPath
}
