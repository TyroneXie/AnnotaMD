import path from 'path'

export interface BufferedProjectRoots {
  rootDirectories?: unknown
  rootDirectory?: unknown
  projectTree?: { pathname?: unknown } | null
}

const normalizeRoot = (pathname: string): string => {
  const normalized = path.normalize(pathname)
  return normalized.length > 1 ? normalized.replace(/[\\/]+$/, '') : normalized
}

const isSameOrNested = (root: string, pathname: string): boolean => {
  if (root === pathname) return true
  const relative = path.relative(root, pathname)
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export const addProjectRoot = (
  currentRoots: string[],
  pathname: string
): { roots: string[]; added: boolean } => {
  const root = normalizeRoot(pathname)
  if (!root) return { roots: [...currentRoots], added: false }

  const normalizedRoots = currentRoots.map(normalizeRoot)
  const overlaps = normalizedRoots.some(
    (existing) => isSameOrNested(existing, root) || isSameOrNested(root, existing)
  )
  if (overlaps) return { roots: normalizedRoots, added: false }

  return { roots: [...normalizedRoots, root], added: true }
}

export const removeProjectRoot = (currentRoots: string[], pathname: string): string[] => {
  const root = normalizeRoot(pathname)
  return currentRoots.map(normalizeRoot).filter((item) => item !== root)
}

export const findProjectRootForPath = (
  currentRoots: string[],
  pathname: string
): string | null => {
  const target = normalizeRoot(pathname)
  return currentRoots
    .map(normalizeRoot)
    .filter((root) => isSameOrNested(root, target))
    .sort((a, b) => b.length - a.length)[0] ?? null
}

export const readBufferedProjectRoots = (state: unknown): string[] => {
  const value = (state || {}) as BufferedProjectRoots
  const candidates = Array.isArray(value.rootDirectories)
    ? value.rootDirectories
    : [value.rootDirectory, value.projectTree?.pathname]

  return candidates.reduce<string[]>((roots, candidate) => {
    if (typeof candidate !== 'string' || !candidate) return roots
    return addProjectRoot(roots, candidate).roots
  }, [])
}
