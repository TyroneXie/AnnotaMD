import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { promisify } from 'node:util'
import type { PiRuntimeReadiness } from './PiRuntimeTypes'

export interface PiExecutableResolverOptions {
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
  pathValue?: string
  homeDirectory?: string
  currentDirectory?: string
  includeSystemDirectories?: boolean
  versionProbe?: PiVersionProbe
  nodeVersionProbe?: PiNodeVersionProbe
  executableProbe?: PiPathProbe
  fileProbe?: PiPathProbe
}

export interface PiVersionProbeRequest {
  command: string
  args: string[]
  environment: NodeJS.ProcessEnv
  currentDirectory: string
  timeoutMs: number
  maxBuffer: number
}

export type PiVersionProbe = (request: PiVersionProbeRequest) => Promise<string>

export interface PiNodeVersionProbeRequest {
  command: string
  environment: NodeJS.ProcessEnv
  currentDirectory: string
  timeoutMs: number
  maxBuffer: number
}

export type PiNodeVersionProbe = (request: PiNodeVersionProbeRequest) => Promise<string>
export type PiPathProbe = (pathname: string) => Promise<boolean>

export interface PiLaunchCommand {
  command: string
  argsPrefix: string[]
}

const execFileAsync = promisify(execFile)
const MINIMUM_PI_VERSION = [0, 84, 3] as const
const MINIMUM_NODE_VERSION = [22, 19, 0] as const
const VERSION_PROBE_TIMEOUT_MS = 3_000
const VERSION_PROBE_MAX_BUFFER = 64 * 1024
const MAX_VERSION_MANAGER_VERSIONS = 32
const PI_PACKAGE_PATH = ['@earendil-works', 'pi-coding-agent'] as const
const PI_BUNDLED_CLI_PATH = ['dist', 'bundle', 'cli.js'] as const

const executableNames = (platform: NodeJS.Platform): string[] => (
  platform === 'win32' ? ['pi.exe', 'pi.cmd', 'pi.bat', 'pi'] : ['pi']
)

const uniquePaths = (paths: string[], platform: NodeJS.Platform): string[] => {
  const seen = new Set<string>()
  return paths.filter((pathname) => {
    const key = platform === 'win32' ? pathname.toLowerCase() : pathname
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const pathEntries = (
  pathValue: string,
  platform: NodeJS.Platform
): string[] => {
  const pathApi = platform === 'win32' ? win32 : posix
  return pathValue
    .split(pathApi.delimiter)
    .map(directory => directory.trim().replace(/^"|"$/g, ''))
    .filter(directory => directory.length > 0 && pathApi.isAbsolute(directory))
    .map(directory => pathApi.normalize(directory))
}

const commonDirectories = (
  platform: NodeJS.Platform,
  homeDirectory: string,
  environment: NodeJS.ProcessEnv,
  includeSystemDirectories: boolean
): string[] => {
  const pathApi = platform === 'win32' ? win32 : posix
  const home = pathApi.resolve(homeDirectory)

  if (platform === 'win32') {
    const appData = environment.APPDATA ?? pathApi.join(home, 'AppData', 'Roaming')
    const localAppData = environment.LOCALAPPDATA ?? pathApi.join(home, 'AppData', 'Local')
    return [
      pathApi.join(home, '.local', 'bin'),
      pathApi.join(home, '.volta', 'bin'),
      pathApi.join(home, '.asdf', 'shims'),
      pathApi.join(home, '.bun', 'bin'),
      environment.PNPM_HOME ?? pathApi.join(localAppData, 'pnpm'),
      pathApi.join(appData, 'npm'),
      ...(includeSystemDirectories ? [pathApi.join(environment.ProgramFiles ?? 'C:\\Program Files', 'nodejs')] : [])
    ]
  }

  const userDirectories = [
    pathApi.join(home, '.local', 'bin'),
    pathApi.join(home, '.volta', 'bin'),
    pathApi.join(home, '.asdf', 'shims'),
    pathApi.join(home, '.bun', 'bin'),
    environment.PNPM_HOME ?? (
      platform === 'darwin'
        ? pathApi.join(home, 'Library', 'pnpm')
        : pathApi.join(home, '.local', 'share', 'pnpm')
    ),
    pathApi.join(home, '.npm-global', 'bin')
  ]

  return platform === 'darwin'
    ? [...userDirectories, ...(includeSystemDirectories ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'] : [])]
    : [...userDirectories, ...(includeSystemDirectories ? ['/usr/local/bin', '/usr/bin', '/snap/bin'] : [])]
}

interface VersionManagerRoot {
  root: string
  executableDirectory: string[]
}

const versionManagerRoots = (
  platform: NodeJS.Platform,
  homeDirectory: string,
  environment: NodeJS.ProcessEnv
): VersionManagerRoot[] => {
  const pathApi = platform === 'win32' ? win32 : posix
  const home = pathApi.resolve(homeDirectory)
  if (platform === 'win32') {
    const appData = environment.APPDATA ?? pathApi.join(home, 'AppData', 'Roaming')
    return [
      { root: environment.NVM_HOME ?? pathApi.join(appData, 'nvm'), executableDirectory: [] },
      {
        root: pathApi.join(environment.FNM_DIR ?? pathApi.join(appData, 'fnm'), 'node-versions'),
        executableDirectory: ['installation']
      }
    ]
  }

  const fnmHome = environment.FNM_DIR ?? pathApi.join(home, '.local', 'share', 'fnm')
  const roots: VersionManagerRoot[] = [
    {
      root: pathApi.join(environment.NVM_DIR ?? pathApi.join(home, '.nvm'), 'versions', 'node'),
      executableDirectory: ['bin']
    },
    {
      root: pathApi.join(fnmHome, 'node-versions'),
      executableDirectory: ['installation', 'bin']
    }
  ]
  if (platform === 'darwin' && !environment.FNM_DIR) {
    roots.push({
      root: pathApi.join(home, 'Library', 'Application Support', 'fnm', 'node-versions'),
      executableDirectory: ['installation', 'bin']
    })
  }
  return roots
}

const discoverVersionManagerDirectories = async(
  options: PiExecutableResolverOptions
): Promise<string[]> => {
  const platform = options.platform ?? process.platform
  const environment = options.environment ?? process.env
  const pathApi = platform === 'win32' ? win32 : posix
  const discovered: string[] = []

  for (const manager of versionManagerRoots(
    platform,
    options.homeDirectory ?? homedir(),
    environment
  )) {
    if (!pathApi.isAbsolute(manager.root)) continue
    try {
      const versions = (await readdir(manager.root, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
        .slice(0, MAX_VERSION_MANAGER_VERSIONS)
      discovered.push(...versions.map(version => pathApi.join(
        manager.root,
        version,
        ...manager.executableDirectory
      )))
    } catch {
      // Version managers are optional.
    }
  }
  return discovered
}

export const discoverExecutableDirectories = async(
  options: PiExecutableResolverOptions = {}
): Promise<string[]> => {
  const platform = options.platform ?? process.platform
  const environment = options.environment ?? process.env
  const pathApi = platform === 'win32' ? win32 : posix
  const pathValue = options.pathValue
    ?? environment.PATH
    ?? environment.Path
    ?? environment.path
    ?? ''

  return uniquePaths([
    ...pathEntries(pathValue, platform),
    ...commonDirectories(
      platform,
      options.homeDirectory ?? homedir(),
      environment,
      options.includeSystemDirectories ?? true
    ),
    ...await discoverVersionManagerDirectories(options)
  ].filter(directory => pathApi.isAbsolute(directory)).map(
    directory => pathApi.normalize(directory)
  ), platform)
}

export const createPiProcessEnvironment = async(
  executablePath: string,
  options: PiExecutableResolverOptions = {}
): Promise<NodeJS.ProcessEnv> => {
  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const environment = { ...(options.environment ?? process.env) }
  const pathKey = platform === 'win32'
    ? Object.keys(environment).find(key => key.toLowerCase() === 'path') ?? 'Path'
    : 'PATH'
  for (const key of Object.keys(environment)) {
    const normalizedKey = key.toLowerCase()
    if (
      normalizedKey === 'node_options' ||
      normalizedKey === 'node_path' ||
      (key !== pathKey && normalizedKey === 'path')
    ) delete environment[key]
  }
  const directories = uniquePaths([
    pathApi.dirname(executablePath),
    ...await discoverExecutableDirectories(options)
  ], platform)
  environment[pathKey] = directories.join(pathApi.delimiter)
  return environment
}

export const buildPiExecutableCandidates = (
  options: PiExecutableResolverOptions = {}
): string[] => {
  const platform = options.platform ?? process.platform
  const environment = options.environment ?? process.env
  const pathApi = platform === 'win32' ? win32 : posix
  const explicitPath = environment.ANNOTAMD_PI_PATH?.trim()
  const pathValue = options.pathValue
    ?? environment.PATH
    ?? environment.Path
    ?? environment.path
    ?? ''
  const directories = uniquePaths([
    ...pathEntries(pathValue, platform),
    ...commonDirectories(
      platform,
      options.homeDirectory ?? homedir(),
      environment,
      options.includeSystemDirectories ?? true
    )
  ].filter(directory => pathApi.isAbsolute(directory)).map(
    directory => pathApi.normalize(directory)
  ), platform)

  return uniquePaths([
    ...(explicitPath && pathApi.isAbsolute(explicitPath)
      ? [pathApi.normalize(explicitPath)]
      : []),
    ...directories.flatMap(directory => executableNames(platform).map(
      filename => pathApi.resolve(directory, filename)
    ))
  ], platform)
}

const defaultExecutableProbe = async(
  pathname: string,
  platform: NodeJS.Platform
): Promise<boolean> => {
  try {
    await access(pathname, platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
    return (await stat(pathname)).isFile()
  } catch {
    return false
  }
}

const defaultFileProbe: PiPathProbe = async(pathname) => {
  try {
    await access(pathname, fsConstants.F_OK)
    return (await stat(pathname)).isFile()
  } catch {
    return false
  }
}

const executableProbe = (
  options: PiExecutableResolverOptions,
  platform: NodeJS.Platform
): PiPathProbe => options.executableProbe ?? (
  pathname => defaultExecutableProbe(pathname, platform)
)

const findExistingPiExecutables = async(
  options: PiExecutableResolverOptions
): Promise<string[]> => {
  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const explicitPath = (options.environment ?? process.env).ANNOTAMD_PI_PATH?.trim()
  const candidates = explicitPath
    ? [pathApi.normalize(explicitPath)]
    : uniquePaths((await discoverExecutableDirectories(options)).flatMap(
      directory => executableNames(platform).map(filename => pathApi.join(directory, filename))
    ), platform)
  const probe = executableProbe(options, platform)
  const existing: string[] = []

  for (const candidate of candidates) {
    if (await probe(candidate)) existing.push(candidate)
  }
  return existing
}

const defaultVersionProbe: PiVersionProbe = async(request) => {
  const { stdout } = await execFileAsync(request.command, request.args, {
    cwd: request.currentDirectory,
    env: request.environment,
    encoding: 'utf8',
    timeout: request.timeoutMs,
    maxBuffer: request.maxBuffer,
    windowsHide: true,
    shell: false
  })
  return stdout
}

const defaultNodeVersionProbe: PiNodeVersionProbe = async(request) => {
  const { stdout } = await execFileAsync(request.command, ['--version'], {
    cwd: request.currentDirectory,
    env: request.environment,
    encoding: 'utf8',
    timeout: request.timeoutMs,
    maxBuffer: request.maxBuffer,
    windowsHide: true,
    shell: false
  })
  return stdout
}

export const parsePiVersion = (output: string): string | undefined => (
  output.trim().match(/(?:^|\s|v)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/)?.[1]
)

const isMinimumVersion = (version: string): boolean => {
  const core = version.split('-', 1)[0]!.split('.').map(Number)
  for (let index = 0; index < MINIMUM_PI_VERSION.length; index += 1) {
    const difference = (core[index] ?? 0) - MINIMUM_PI_VERSION[index]!
    if (difference !== 0) return difference > 0
  }
  return !version.includes('-')
}

const parseNodeVersion = (output: string): string | undefined => (
  output.trim().match(/^v?(\d+\.\d+\.\d+)(?:[-+].*)?$/)?.[1]
)

const isMinimumNodeVersion = (version: string): boolean => {
  const parts = version.split('.').map(Number)
  for (let index = 0; index < MINIMUM_NODE_VERSION.length; index += 1) {
    const difference = (parts[index] ?? 0) - MINIMUM_NODE_VERSION[index]!
    if (difference !== 0) return difference > 0
  }
  return true
}

const findCompatibleNodeExecutable = async(
  options: PiExecutableResolverOptions
): Promise<string | undefined> => {
  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const probe = executableProbe(options, platform)
  for (const directory of await discoverExecutableDirectories(options)) {
    const nodePath = pathApi.join(directory, platform === 'win32' ? 'node.exe' : 'node')
    if (!await probe(nodePath)) continue
    try {
      const environment = await createPiProcessEnvironment(nodePath, options)
      const output = await (options.nodeVersionProbe ?? defaultNodeVersionProbe)({
        command: nodePath,
        environment,
        currentDirectory: options.currentDirectory ?? process.cwd(),
        timeoutMs: VERSION_PROBE_TIMEOUT_MS,
        maxBuffer: VERSION_PROBE_MAX_BUFFER
      })
      const version = parseNodeVersion(output)
      if (version && isMinimumNodeVersion(version)) return nodePath
    } catch {
      // A broken or outdated Node must not hide a later compatible installation.
    }
  }
  return undefined
}

export const buildManagedPiCliCandidates = (
  piExecutablePath: string,
  platform: NodeJS.Platform
): string[] => {
  const pathApi = platform === 'win32' ? win32 : posix
  const executableDirectory = pathApi.dirname(piExecutablePath)
  const packageRoot = platform === 'win32'
    ? pathApi.join(executableDirectory, 'node_modules', ...PI_PACKAGE_PATH)
    : pathApi.join(executableDirectory, '..', 'lib', 'node_modules', ...PI_PACKAGE_PATH)
  return [pathApi.normalize(pathApi.join(packageRoot, ...PI_BUNDLED_CLI_PATH))]
}

export const resolvePiLaunchCommand = async(
  piExecutablePath: string,
  options: PiExecutableResolverOptions = {}
): Promise<PiLaunchCommand> => {
  const platform = options.platform ?? process.platform
  const fileProbe = options.fileProbe ?? defaultFileProbe
  const cliPath = (await Promise.all(buildManagedPiCliCandidates(
    piExecutablePath,
    platform
  ).map(async candidate => await fileProbe(candidate) ? candidate : undefined)))
    .find((candidate): candidate is string => Boolean(candidate))

  if (cliPath) {
    const nodePath = await findCompatibleNodeExecutable(options)
    if (!nodePath) {
      throw new Error('Pi requires Node.js 22.19.0 or newer to start.')
    }
    return { command: nodePath, argsPrefix: [cliPath] }
  }

  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(piExecutablePath)) {
    throw new Error('The detected Pi command is not a supported npm installation.')
  }
  return { command: piExecutablePath, argsPrefix: [] }
}

export const inspectPiExecutable = async(
  options: PiExecutableResolverOptions = {}
): Promise<PiRuntimeReadiness> => {
  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const explicitPath = (options.environment ?? process.env).ANNOTAMD_PI_PATH?.trim()
  if (explicitPath && !pathApi.isAbsolute(explicitPath)) {
    return {
      status: 'error',
      message: 'ANNOTAMD_PI_PATH must be an absolute path.'
    }
  }

  const candidates = await findExistingPiExecutables(options)
  if (candidates.length === 0) {
    return {
      status: 'missing',
      message: 'Pi was not found on this computer.'
    }
  }

  let firstFailure: PiRuntimeReadiness | undefined
  for (const candidate of candidates) {
    try {
      const launch = await resolvePiLaunchCommand(candidate, options)
      const environment = await createPiProcessEnvironment(launch.command, options)
      const output = await (options.versionProbe ?? defaultVersionProbe)({
        command: launch.command,
        args: [...launch.argsPrefix, '--version'],
        environment,
        currentDirectory: options.currentDirectory ?? process.cwd(),
        timeoutMs: VERSION_PROBE_TIMEOUT_MS,
        maxBuffer: VERSION_PROBE_MAX_BUFFER
      })
      const version = parsePiVersion(output)
      if (!version) {
        firstFailure ??= {
          status: 'incompatible',
          executablePath: candidate,
          message: 'The detected Pi command did not report a compatible semantic version.'
        }
        continue
      }
      if (!isMinimumVersion(version)) {
        firstFailure ??= {
          status: 'incompatible',
          executablePath: candidate,
          version,
          message: `Pi ${version} is older than the minimum supported version 0.84.3.`
        }
        continue
      }
      return {
        status: 'ready',
        executablePath: launch.command,
        ...(launch.argsPrefix.length > 0 ? { executableArgs: launch.argsPrefix } : {}),
        version
      }
    } catch (error) {
      firstFailure ??= {
        status: 'error',
        executablePath: candidate,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
  return firstFailure!
}

export const createPiExecutableInspector = (): ((
  forceRefresh?: boolean,
  options?: PiExecutableResolverOptions
) => Promise<PiRuntimeReadiness>) => {
  let cached: PiRuntimeReadiness | undefined
  let inFlight: Promise<PiRuntimeReadiness> | undefined
  return async(forceRefresh = false, options = {}) => {
    if (!forceRefresh && cached) return cached
    if (!forceRefresh && inFlight) return inFlight
    const inspection = inspectPiExecutable(options)
    inFlight = inspection
    try {
      const result = await inspection
      cached = result
      return result
    } finally {
      if (inFlight === inspection) inFlight = undefined
    }
  }
}

export const inspectInstalledPi = createPiExecutableInspector()
