import fs from 'fs-extra'
import { statSync, constants, type Stats } from 'fs'
import { ipcMain } from 'electron'
import { isFile as commonIsFile, isDirectory as commonIsDirectory } from 'common/filesystem'
import { assertFileAccess, canonicalPath, grantFileAccess } from '../security/fileAccess'

interface SerializedStat {
  size: number
  mtimeMs: number
  ctimeMs: number
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

const serializeStat = (stats: Stats): SerializedStat => ({
  size: stats.size,
  mtimeMs: stats.mtimeMs,
  ctimeMs: stats.ctimeMs,
  isFile: stats.isFile(),
  isDirectory: stats.isDirectory(),
  isSymbolicLink: stats.isSymbolicLink()
})

const toBuffer = (data: unknown): unknown => {
  if (data == null) return data
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (typeof data === 'string') return data
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'Buffer' &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return Buffer.from((data as { data: number[] }).data)
  }
  return data
}

export const registerFsHandlers = (): void => {
  ipcMain.on('annotamd::native-file-drop', (event, rawPath: string) => {
    const pathname = canonicalPath(rawPath)
    grantFileAccess(event.sender, pathname, statSync(pathname).isDirectory())
    event.returnValue = true
  })
  ipcMain.handle('annotamd::fs::is-file', (e, p: string) => commonIsFile(assertFileAccess(e.sender, p)))
  ipcMain.handle('annotamd::fs::is-directory', (e, p: string) => commonIsDirectory(assertFileAccess(e.sender, p)))
  ipcMain.handle('annotamd::fs::empty-dir', (e, p: string) => fs.emptyDir(assertFileAccess(e.sender, p, true)))
  ipcMain.handle('annotamd::fs::copy', (e, src: string, dest: string) => fs.copy(assertFileAccess(e.sender, src), assertFileAccess(e.sender, dest, true)))
  ipcMain.handle('annotamd::fs::ensure-dir', (e, p: string) => fs.ensureDir(assertFileAccess(e.sender, p, true)))

  ipcMain.handle('annotamd::fs::output-file', (e, p: string, data: unknown) =>
    fs.outputFile(assertFileAccess(e.sender, p, true), toBuffer(data) as string | NodeJS.ArrayBufferView)
  )
  ipcMain.handle('annotamd::fs::move', (e, src: string, dest: string) =>
    fs.move(assertFileAccess(e.sender, src, true), assertFileAccess(e.sender, dest, true), { overwrite: false })
  )
  ipcMain.handle('annotamd::fs::stat', async(e, p: string) => serializeStat(await fs.stat(assertFileAccess(e.sender, p))))

  ipcMain.handle('annotamd::fs::write-file', (e, p: string, data: unknown) =>
    fs.writeFile(assertFileAccess(e.sender, p, true), toBuffer(data) as string | NodeJS.ArrayBufferView)
  )
  ipcMain.handle('annotamd::fs::read-file', async(e, p: string, encoding?: BufferEncoding) => {
    const buf = await fs.readFile(assertFileAccess(e.sender, p), encoding)
    return buf
  })
  ipcMain.handle('annotamd::fs::path-exists', (e, p: string) => fs.pathExists(assertFileAccess(e.sender, p)))
  ipcMain.handle('annotamd::fs::unlink', (e, p: string) => fs.unlink(assertFileAccess(e.sender, p, true)))
  ipcMain.handle('annotamd::fs::readdir', (e, p: string) => fs.readdir(assertFileAccess(e.sender, p)))
  ipcMain.handle('annotamd::fs::is-executable', (e, p: string) => {
    try {
      const stat = statSync(assertFileAccess(e.sender, p))
      if (process.platform === 'win32') return stat.isFile()
      return (
        stat.isFile() &&
        (stat.mode & (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH)) !== 0
      )
    } catch {
      return false
    }
  })
}
