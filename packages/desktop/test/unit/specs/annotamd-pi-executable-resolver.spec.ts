// @vitest-environment node

import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, win32 } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPiExecutableCandidates,
  buildManagedPiCliCandidates,
  createPiExecutableInspector,
  discoverExecutableDirectories,
  inspectPiExecutable,
  parsePiVersion,
  type PiExecutableResolverOptions
} from '../../../src/main/piWorkspace/PiExecutableResolver'

const temporaryDirectories: string[] = []

const createTemporaryRoot = async(): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'annotamd-pi-executable-'))
  temporaryDirectories.push(root)
  return root
}

const createExecutable = async(pathname: string): Promise<void> => {
  await mkdir(resolve(pathname, '..'), { recursive: true })
  await writeFile(pathname, '#!/bin/sh\n')
  await chmod(pathname, 0o755)
}

const createFile = async(pathname: string): Promise<void> => {
  await mkdir(resolve(pathname, '..'), { recursive: true })
  await writeFile(pathname, '', 'utf8')
}

const createVersionedNode = async(pathname: string, version: string): Promise<void> => {
  await mkdir(resolve(pathname, '..'), { recursive: true })
  await writeFile(pathname, `#!/bin/sh\necho v${version}\n`, 'utf8')
  await chmod(pathname, 0o755)
}

const linuxOptions = (root: string, pathValue: string): PiExecutableResolverOptions => ({
  platform: 'linux',
  environment: {},
  pathValue,
  homeDirectory: join(root, 'home'),
  currentDirectory: root,
  includeSystemDirectories: false
})

afterEach(async() => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('PiExecutableResolver', () => {
  it('finds an independently installed Pi and verifies its version', async() => {
    const root = await createTemporaryRoot()
    const executablePath = join(root, 'bin', 'pi')
    await createExecutable(executablePath)
    const versionProbe = vi.fn().mockResolvedValue('0.84.3\n')

    const result = await inspectPiExecutable({
      ...linuxOptions(root, join(root, 'bin')),
      versionProbe
    })

    expect(result).toEqual({ status: 'ready', executablePath, version: '0.84.3' })
    expect(versionProbe).toHaveBeenCalledWith(expect.objectContaining({
      command: executablePath,
      timeoutMs: 3_000,
      maxBuffer: 64 * 1024
    }))
  })

  it('reports missing without treating a source checkout as an installation', async() => {
    const root = await createTemporaryRoot()
    await mkdir(join(root, 'pi-source'), { recursive: true })

    const result = await inspectPiExecutable(linuxOptions(root, ''))

    expect(result.status).toBe('missing')
    expect(result.executablePath).toBeUndefined()
  })

  it('rejects old and unparsable commands without crashing', async() => {
    const root = await createTemporaryRoot()
    const executablePath = join(root, 'bin', 'pi')
    await createExecutable(executablePath)
    const options = linuxOptions(root, join(root, 'bin'))

    const old = await inspectPiExecutable({
      ...options,
      versionProbe: vi.fn().mockResolvedValue('pi v0.84.2')
    })
    expect(old).toMatchObject({ status: 'incompatible', version: '0.84.2' })

    const invalid = await inspectPiExecutable({
      ...options,
      versionProbe: vi.fn().mockResolvedValue('development checkout')
    })
    expect(invalid).toMatchObject({ status: 'incompatible', executablePath })
  })

  it('accepts newer Pi versions for the later RPC capability probe', async() => {
    const root = await createTemporaryRoot()
    const executablePath = join(root, 'bin', 'pi')
    await createExecutable(executablePath)

    const result = await inspectPiExecutable({
      ...linuxOptions(root, join(root, 'bin')),
      versionProbe: vi.fn().mockResolvedValue('1.2.0')
    })

    expect(result).toMatchObject({ status: 'ready', version: '1.2.0' })
  })

  it('builds bounded absolute candidates on macOS, Linux and Windows', () => {
    expect(buildPiExecutableCandidates({
      platform: 'darwin',
      environment: {},
      pathValue: '',
      homeDirectory: '/Users/ada',
      currentDirectory: '/workspace'
    })).toEqual(expect.arrayContaining([
      '/Users/ada/.local/bin/pi',
      '/Users/ada/Library/pnpm/pi',
      '/opt/homebrew/bin/pi'
    ]))

    const relativeConfiguration = buildPiExecutableCandidates({
      platform: 'linux',
      environment: {
        ANNOTAMD_PI_PATH: 'tools/custom-pi',
        PNPM_HOME: 'workspace-pnpm'
      },
      pathValue: 'relative-bin:/opt/pi-tools',
      homeDirectory: '/home/ada',
      currentDirectory: '/workspace',
      includeSystemDirectories: false
    })
    expect(relativeConfiguration).not.toContain('/workspace/tools/custom-pi')
    expect(relativeConfiguration).not.toContain('/workspace/relative-bin/pi')
    expect(relativeConfiguration).not.toContain('workspace-pnpm/pi')
    expect(relativeConfiguration).toContain('/opt/pi-tools/pi')

    const windows = buildPiExecutableCandidates({
      platform: 'win32',
      environment: {
        APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local'
      },
      pathValue: 'C:\\Tools',
      homeDirectory: 'C:\\Users\\Ada',
      currentDirectory: 'C:\\Workspace'
    })
    expect(windows).toContain('C:\\Tools\\pi.cmd')
    expect(windows.every(candidate => win32.isAbsolute(candidate))).toBe(true)
  })

  it('rejects relative explicit paths instead of resolving them inside the workspace', async() => {
    const root = await createTemporaryRoot()
    const result = await inspectPiExecutable({
      ...linuxOptions(root, ''),
      environment: { ANNOTAMD_PI_PATH: 'tools/pi' }
    })

    expect(result).toMatchObject({
      status: 'error',
      message: 'ANNOTAMD_PI_PATH must be an absolute path.'
    })
  })

  it('filters relative PATH and version-manager directories from discovery', async() => {
    const directories = await discoverExecutableDirectories({
      platform: 'linux',
      environment: {
        PNPM_HOME: 'relative-pnpm',
        NVM_DIR: 'relative-nvm',
        FNM_DIR: 'relative-fnm'
      },
      pathValue: 'relative-bin:/opt/absolute-bin',
      homeDirectory: '/home/ada',
      includeSystemDirectories: false
    })

    expect(directories).toContain('/opt/absolute-bin')
    expect(directories.every(directory => directory.startsWith('/'))).toBe(true)
    expect(directories.some(directory => directory.includes('relative-'))).toBe(false)
  })

  it('continues past an incompatible command to a later valid Pi', async() => {
    const root = await createTemporaryRoot()
    const broken = join(root, 'broken', 'pi')
    const valid = join(root, 'valid', 'pi')
    await Promise.all([createExecutable(broken), createExecutable(valid)])
    const versionProbe = vi.fn().mockImplementation(async({ command }) => (
      command === broken ? 'not Pi' : '0.84.3'
    ))

    const result = await inspectPiExecutable({
      ...linuxOptions(root, `${join(root, 'broken')}:${join(root, 'valid')}`),
      versionProbe
    })

    expect(result).toEqual({ status: 'ready', executablePath: valid, version: '0.84.3' })
    expect(versionProbe).toHaveBeenCalledTimes(2)
  })

  it('pins an npm Pi launch to a compatible Node even when an older Node is first', async() => {
    const root = await createTemporaryRoot()
    const piPath = join(root, 'bin', 'pi')
    const cliPath = buildManagedPiCliCandidates(piPath, 'linux')[0]!
    const oldNode = join(root, 'old-node', 'node')
    const compatibleNode = join(root, 'new-node', 'node')
    await Promise.all([
      createExecutable(piPath),
      createFile(cliPath),
      createVersionedNode(oldNode, '20.18.0'),
      createVersionedNode(compatibleNode, '22.19.0')
    ])
    const versionProbe = vi.fn().mockResolvedValue('0.84.3')

    const result = await inspectPiExecutable({
      ...linuxOptions(
        root,
        [join(root, 'bin'), join(root, 'old-node'), join(root, 'new-node')].join(':')
      ),
      versionProbe
    })

    expect(result).toEqual({
      status: 'ready',
      executablePath: compatibleNode,
      executableArgs: [cliPath],
      version: '0.84.3'
    })
    expect(versionProbe).toHaveBeenCalledWith(expect.objectContaining({
      command: compatibleNode,
      args: [cliPath, '--version'],
      environment: expect.objectContaining({
        PATH: expect.stringMatching(new RegExp(`^${join(root, 'new-node')}`))
      })
    }))
  })

  it('launches a Windows npm pi.cmd through node.exe without a shell', async() => {
    const piPath = 'C:\\Users\\Ada\\AppData\\Roaming\\npm\\pi.cmd'
    const cliPath = buildManagedPiCliCandidates(piPath, 'win32')[0]!
    const oldNode = 'C:\\OldNode\\node.exe'
    const compatibleNode = 'C:\\Node\\node.exe'
    const executables = new Set([piPath, oldNode, compatibleNode])
    const versionProbe = vi.fn().mockResolvedValue('0.84.3')

    const result = await inspectPiExecutable({
      platform: 'win32',
      environment: {
        ANNOTAMD_PI_PATH: piPath,
        Path: 'C:\\OldNode;C:\\Node',
        APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming'
      },
      homeDirectory: 'C:\\Users\\Ada',
      currentDirectory: 'C:\\Workspace',
      includeSystemDirectories: false,
      executableProbe: async pathname => executables.has(pathname),
      fileProbe: async pathname => pathname === cliPath,
      nodeVersionProbe: async({ command }) => command === oldNode ? 'v20.18.0' : 'v22.19.0',
      versionProbe
    })

    expect(result).toEqual({
      status: 'ready',
      executablePath: compatibleNode,
      executableArgs: [cliPath],
      version: '0.84.3'
    })
    expect(versionProbe).toHaveBeenCalledWith(expect.objectContaining({
      command: compatibleNode,
      args: [cliPath, '--version']
    }))
  })

  it('parses strict semantic versions from Pi output', () => {
    expect(parsePiVersion('0.84.3\n')).toBe('0.84.3')
    expect(parsePiVersion('pi v0.85.0-beta.1')).toBe('0.85.0-beta.1')
    expect(parsePiVersion('version 84')).toBeUndefined()
  })

  it('caches readiness until a forced refresh', async() => {
    const inspect = createPiExecutableInspector()
    const root = await createTemporaryRoot()
    const versionProbe = vi.fn().mockResolvedValue('0.84.3')
    const options = { ...linuxOptions(root, ''), versionProbe }

    await inspect(false, options)
    const executablePath = join(root, 'bin', 'pi')
    await createExecutable(executablePath)
    expect((await inspect(false, { ...options, pathValue: join(root, 'bin') })).status).toBe('missing')
    expect((await inspect(true, { ...options, pathValue: join(root, 'bin') })).status).toBe('ready')
    expect(versionProbe).toHaveBeenCalledTimes(1)
  })
})
