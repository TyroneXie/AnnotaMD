import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import { promisify } from 'node:util'
import type {
  AiCliDetectionRequest,
  AiCliDetectionResult
} from '@shared/types/aiWorkspace'
import { AI_CLI_PROVIDER_PRESETS } from '@shared/types/aiProviderPresets'
import { discoverExecutableDirectories } from '../piWorkspace/PiExecutableResolver'

const execFileAsync = promisify(execFile)
const VERSION_TIMEOUT_MS = 3_000
const VERSION_MAX_BUFFER = 64 * 1024

export interface CliExecutableDetectorOptions {
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
  discoverDirectories?: typeof discoverExecutableDirectories
  executableProbe?: (pathname: string) => Promise<boolean>
  versionProbe?: (pathname: string, environment: NodeJS.ProcessEnv) => Promise<string>
}

const executableNames = (
  command: string,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv
): string[] => {
  if (platform !== 'win32') return [command]
  const extensions = (environment.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map(extension => extension.trim().toLowerCase())
    .filter(Boolean)
  return [command, ...extensions.map(extension => `${command}${extension}`)]
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

const defaultVersionProbe = async(
  pathname: string,
  environment: NodeJS.ProcessEnv
): Promise<string> => {
  try {
    const { stdout, stderr } = await execFileAsync(pathname, ['--version'], {
      env: environment,
      timeout: VERSION_TIMEOUT_MS,
      maxBuffer: VERSION_MAX_BUFFER,
      windowsHide: true
    })
    return `${stdout}\n${stderr}`.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? ''
  } catch {
    return ''
  }
}

export const detectCliExecutable = async(
  request: AiCliDetectionRequest,
  options: CliExecutableDetectorOptions = {}
): Promise<AiCliDetectionResult> => {
  const preset = AI_CLI_PROVIDER_PRESETS[request.provider]
  const platform = options.platform ?? process.platform
  const pathApi = platform === 'win32' ? win32 : posix
  const environment: NodeJS.ProcessEnv = {
    ...(options.environment ?? process.env),
    ...(request.environment ?? {})
  }
  const executableProbe = options.executableProbe ?? (
    pathname => defaultExecutableProbe(pathname, platform)
  )
  const versionProbe = options.versionProbe ?? defaultVersionProbe
  const explicitPath = request.executablePath?.trim()

  if (explicitPath && !pathApi.isAbsolute(explicitPath)) {
    return {
      found: false,
      provider: request.provider,
      command: preset.command,
      message: 'CLI executable path must be absolute.'
    }
  }

  const candidates = explicitPath
    ? [pathApi.normalize(explicitPath)]
    : (await (options.discoverDirectories ?? discoverExecutableDirectories)({
        platform,
        environment
      })).flatMap(directory => executableNames(
        preset.command,
        platform,
        environment
      ).map(filename => pathApi.join(directory, filename)))

  for (const candidate of candidates) {
    if (!await executableProbe(candidate)) continue
    const version = await versionProbe(candidate, environment)
    return {
      found: true,
      provider: request.provider,
      command: preset.command,
      executablePath: candidate,
      ...(version ? { version } : {}),
      message: version
        ? `Detected ${preset.label}: ${version}`
        : `Detected ${preset.label}.`
    }
  }

  return {
    found: false,
    provider: request.provider,
    command: preset.command,
    message: `Could not find ${preset.label} on PATH.`
  }
}
