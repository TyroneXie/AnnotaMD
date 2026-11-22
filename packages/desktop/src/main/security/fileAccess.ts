import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { WebContents } from 'electron'

interface Grant { pathname: string; directory: boolean; writable: boolean }
const grants = new Map<number, Grant[]>()

export function canonicalPath(value: unknown, remainingLinks = 40): string {
  if (remainingLinks <= 0) throw new Error('Too many symbolic links')
  if (typeof value !== 'string' || value.includes('\0') || !path.isAbsolute(value)) {
    throw new Error('Expected an absolute filesystem path')
  }
  const suffix: string[] = []
  let existing = path.resolve(value)
  while (!fs.existsSync(existing)) {
    try {
      if (fs.lstatSync(existing).isSymbolicLink()) {
        const target = path.resolve(path.dirname(existing), fs.readlinkSync(existing))
        return path.join(canonicalPath(target, remainingLinks - 1), ...suffix)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error('No existing parent directory')
    suffix.unshift(path.basename(existing))
    existing = parent
  }
  return path.join(fs.realpathSync(existing), ...suffix)
}

export function grantFileAccess(sender: WebContents, pathname: string, directory = true, writable = true): void {
  const canonical = canonicalPath(pathname)
  let entries = grants.get(sender.id)
  if (!entries) {
    entries = []
    grants.set(sender.id, entries)
    sender.once('destroyed', () => grants.delete(sender.id))
  }
  if (!entries.some(entry => entry.pathname === canonical && entry.directory === directory && entry.writable === writable)) {
    entries.push({ pathname: canonical, directory, writable })
  }
}

export function assertFileAccess(sender: WebContents, pathname: unknown, write = false): string {
  const canonical = canonicalPath(pathname)
  const roots: Grant[] = [
    { pathname: canonicalPath(app.getPath('userData')), directory: true, writable: true },
    ...(grants.get(sender.id) ?? [])
  ]
  if (!write) roots.push({ pathname: canonicalPath(app.getAppPath()), directory: true, writable: false })
  const allowed = roots.some(grant => {
    if (write && !grant.writable) return false
    const relative = path.relative(grant.pathname, canonical)
    return relative === '' || (grant.directory && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  })
  if (!allowed) throw new Error('Filesystem path is outside this window’s authorized locations')
  return canonical
}
