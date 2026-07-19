import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import commandExists from 'command-exists'
import type {
  AnnotaMDMcpClientConfigureResult,
  AnnotaMDMcpClientId,
  AnnotaMDMcpClientState,
  AnnotaMDMcpManualConfigResult
} from '@shared/types/mcpClients'

const execFileAsync = promisify(execFile)
const SERVER_NAME = 'annotamd'
const COMMAND_TIMEOUT_MS = 8_000
let cachedInspection: AnnotaMDMcpClientState[] | null = null
let inspectionInFlight: Promise<AnnotaMDMcpClientState[]> | null = null

export interface McpLaunchSpec {
  command: string
  args: string[]
  env: Record<string, string>
}

export const executableCandidates: Record<AnnotaMDMcpClientId, string[]> = {
  codex: [
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    join(homedir(), '.local', 'bin', 'codex')
  ],
  'claude-code': [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(homedir(), '.local', 'bin', 'claude')
  ]
}

const commandNames: Record<AnnotaMDMcpClientId, string> = {
  codex: 'codex',
  'claude-code': 'claude'
}

const isExecutable = async(pathname: string): Promise<boolean> => {
  try {
    await access(pathname, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

const findExecutable = async(id: AnnotaMDMcpClientId): Promise<string | undefined> => {
  if (commandExists.sync(commandNames[id])) return commandNames[id]
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, commandNames[id]))
  const candidates = [...new Set([...fromPath, ...executableCandidates[id]])]
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate
  }
  return undefined
}

const run = async(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    env: process.env
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

const getLaunchSpec = (clientName?: AnnotaMDMcpClientId): McpLaunchSpec => {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'annotamd-mcp', 'index.mjs')
    : resolve(app.getAppPath(), '..', '..', 'tools', 'annotamd-mcp', 'dist', 'index.js')
  const env: Record<string, string> = {
    ELECTRON_RUN_AS_NODE: '1',
    ANNOTAMD_BRIDGE_FILE: join(app.getPath('userData'), 'agent-bridge.json')
  }
  if (clientName) env.ANNOTAMD_CLIENT_NAME = clientName
  return {
    command: process.execPath,
    args: [script],
    env
  }
}

export const hasNamedMcpServer = (output: string): boolean => {
  const normalized = output.toLowerCase()
  if (normalized.includes('no mcp server named')) return false
  if (normalized.includes('not found')) return false
  return normalized.includes(SERVER_NAME)
}

const isConfiguredWithCli = async(
  id: Extract<AnnotaMDMcpClientId, 'codex' | 'claude-code'>,
  executable: string
): Promise<boolean> => {
  const args = id === 'codex'
    ? ['mcp', 'get', SERVER_NAME, '--json']
    : ['mcp', 'get', SERVER_NAME]
  try {
    const { stdout, stderr } = await run(executable, args)
    return hasNamedMcpServer(`${stdout}\n${stderr}`)
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string }
    return hasNamedMcpServer(`${detail.stdout ?? ''}\n${detail.stderr ?? ''}`)
  }
}

export const createStandardMcpManualConfig = (launch: McpLaunchSpec): string => {
  return JSON.stringify({
    mcpServers: {
      annotamd: {
        command: launch.command,
        args: launch.args,
        env: launch.env
      }
    }
  }, null, 2)
}

export const createCustomAgentManualConfig = (): AnnotaMDMcpManualConfigResult => {
  return {
    manualConfig: createStandardMcpManualConfig(getLaunchSpec())
  }
}

export const inspectMcpClient = async(id: AnnotaMDMcpClientId): Promise<AnnotaMDMcpClientState> => {
  const executable = await findExecutable(id)
  if (!executable) {
    return {
      id,
      installed: false,
      configured: false,
      canAutoConfigure: true
    }
  }

  try {
    const configured = await isConfiguredWithCli(id, executable)
    return {
      id,
      installed: true,
      configured,
      canAutoConfigure: true,
      executable
    }
  } catch (error) {
    return {
      id,
      installed: true,
      configured: false,
      canAutoConfigure: true,
      executable,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export const inspectMcpClients = async(
  forceRefresh = false
): Promise<AnnotaMDMcpClientState[]> => {
  if (!forceRefresh && cachedInspection) return cachedInspection
  if (!forceRefresh && inspectionInFlight) return inspectionInFlight

  const inspection = Promise.all((['codex', 'claude-code'] as const)
    .map(inspectMcpClient))
  inspectionInFlight = inspection
  try {
    cachedInspection = await inspection
    return cachedInspection
  } finally {
    if (inspectionInFlight === inspection) inspectionInFlight = null
  }
}

const updateCachedInspection = (client: AnnotaMDMcpClientState): void => {
  if (!cachedInspection) return
  cachedInspection = cachedInspection.map((current) => (
    current.id === client.id ? client : current
  ))
}

export const createCliConfigureArgs = (
  id: Extract<AnnotaMDMcpClientId, 'codex' | 'claude-code'>,
  launch: McpLaunchSpec
): string[] => {
  const envArgs = Object.entries(launch.env).flatMap(([key, value]) => (
    id === 'codex' ? ['--env', `${key}=${value}`] : ['-e', `${key}=${value}`]
  ))
  return id === 'codex'
    ? ['mcp', 'add', SERVER_NAME, ...envArgs, '--', launch.command, ...launch.args]
    : ['mcp', 'add', SERVER_NAME, '--scope', 'user', ...envArgs, '--', launch.command, ...launch.args]
}

const configureWithCli = async(
  id: Extract<AnnotaMDMcpClientId, 'codex' | 'claude-code'>,
  executable: string
): Promise<void> => {
  const launch = getLaunchSpec(id)
  const args = createCliConfigureArgs(id, launch)
  await run(executable, args)
}

export const configureMcpClient = async(
  id: AnnotaMDMcpClientId
): Promise<AnnotaMDMcpClientConfigureResult> => {
  const before = await inspectMcpClient(id)
  if (!before.installed) {
    return { success: false, message: 'client-not-installed', client: before }
  }
  if (before.configured) {
    updateCachedInspection(before)
    return { success: true, client: before }
  }
  try {
    await configureWithCli(id, before.executable!)
    const client = await inspectMcpClient(id)
    updateCachedInspection(client)
    return { success: client.configured, client }
  } catch (error) {
    const client = await inspectMcpClient(id)
    updateCachedInspection(client)
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      client
    }
  }
}
