import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface BridgeConfig {
  port: number
  token: string
}

interface BridgeCandidateOptions {
  platform?: NodeJS.Platform
  homeDirectory?: string
  environment?: NodeJS.ProcessEnv
}

type BridgeProbe = (config: BridgeConfig) => Promise<boolean>

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))]

export const getBridgeFileCandidates = (
  options: BridgeCandidateOptions = {}
): string[] => {
  const platform = options.platform ?? process.platform
  const homeDirectory = options.homeDirectory ?? homedir()
  const environment = options.environment ?? process.env
  const baseDirectory = platform === 'darwin'
    ? join(homeDirectory, 'Library', 'Application Support')
    : platform === 'win32'
      ? environment.APPDATA ?? homeDirectory
      : environment.XDG_CONFIG_HOME ?? join(homeDirectory, '.config')

  // Prefer installed profiles over development profiles. Older AnnotaMD
  // releases wrote their bridge into the MarkText user-data directory, while
  // early auto-generated MCP configs pinned ANNOTAMD_BRIDGE_FILE to a dev
  // profile. Treat that environment value as a fallback so an installed app
  // always wins when both are running.
  return unique([
    join(baseDirectory, 'AnnotaMD', 'agent-bridge.json'),
    join(baseDirectory, 'marktext', 'agent-bridge.json'),
    environment.ANNOTAMD_BRIDGE_FILE ?? '',
    join(baseDirectory, 'annotamd-dev', 'agent-bridge.json'),
    join(baseDirectory, 'marktext-dev', 'agent-bridge.json')
  ])
}

const parseBridgeConfig = (value: string): BridgeConfig | null => {
  try {
    const config = JSON.parse(value) as Partial<BridgeConfig>
    return Number.isInteger(config.port) && Number(config.port) > 0 && typeof config.token === 'string'
      && config.token.length > 0
      ? { port: Number(config.port), token: config.token }
      : null
  } catch {
    return null
  }
}

export const discoverRunningBridge = async(
  candidates: string[],
  probe: BridgeProbe
): Promise<BridgeConfig | null> => {
  for (const candidate of unique(candidates)) {
    try {
      const config = parseBridgeConfig(await readFile(candidate, 'utf8'))
      if (config && await probe(config)) return config
    } catch {
      // Missing, stale, or unreadable manifests are expected after an update.
    }
  }
  return null
}
