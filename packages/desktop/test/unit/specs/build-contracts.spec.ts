import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import ts from 'typescript'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const postinstall = readFileSync(resolve(root, 'scripts/postinstall.ts'), 'utf8')
function runInstall(sourcePresent: boolean) {
  const execute = vi.fn()
  const write = vi.fn()
  const fakeFs = {
    existsSync: (filename: string) => filename.endsWith('native-keymap') && sourcePresent,
    writeFileSync: write
  }
  const run = () => runInNewContext(postinstall, {
    __dirname: resolve(root, 'scripts'),
    process: { platform: 'linux', env: {} },
    console: { log: vi.fn(), error: vi.fn() },
    require: (name: string) => {
      if (name === 'child_process') return { execSync: execute }
      if (name === 'path') return path
      if (name === 'fs') return fakeFs
      throw new Error(`Unexpected module: ${name}`)
    }
  })
  return { run, execute, write }
}
describe('reproducible build contracts', () => {
  it('fails before running commands when a required optional native source is missing', () => {
    const { run, execute, write } = runInstall(false)
    expect(run).toThrow('Missing native-keymap source')
    expect(execute).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('patches and rebuilds installed sources without invoking dependency mutation commands', () => {
    const { run, execute, write } = runInstall(true)
    run()
    const commands = execute.mock.calls.map(call => String(call[0]))
    expect(commands).toHaveLength(3)
    expect(commands.join('\n')).toContain('patch-package')
    expect(commands.join('\n')).toContain('electron-rebuild')
    expect(commands.join('\n')).not.toMatch(/\b(?:add|install)\b/)
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the runtime IPC allowlist in sync with the typed channel contract', () => {
    const result = spawnSync(process.execPath, ['scripts/generateIpcChannels.mjs', '--check'], { cwd: root, encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('rejects unsupported macOS archive architectures before packaging', () => {
    const result = spawnSync(process.execPath, ['scripts/createMacUpdateZip.mjs', 'wrong-arch'], { cwd: root, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Unsupported macOS architecture')
  })

  it.runIf(process.platform === 'darwin')('creates a full ZIP and checksum-backed manifest without differential files', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'annotamd-mac-artifacts-'))
    try {
      const version = JSON.parse(readFileSync(resolve(root, 'packages/desktop/package.json'), 'utf8')).version as string
      const base = `annotamd-mac-arm64-${version}`
      const contents = resolve(directory, 'mac-arm64/AnnotaMD.app/Contents')
      mkdirSync(contents, { recursive: true })
      writeFileSync(resolve(contents, 'Info.plist'), 'test app fixture')
      writeFileSync(resolve(directory, `${base}.dmg`), 'test disk image fixture')
      const result = spawnSync(process.execPath, ['scripts/createMacUpdateZip.mjs', 'arm64', directory], { cwd: root, encoding: 'utf8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const archive = readFileSync(resolve(directory, `${base}.zip`))
      const manifest = readFileSync(resolve(directory, 'latest-mac.yml'), 'utf8')
      expect(manifest).toContain(`path: "${base}.zip"`)
      expect(manifest).toContain(createHash('sha512').update(archive).digest('base64'))
      expect(readdirSync(directory).some(name => name.endsWith('.blockmap'))).toBe(false)
      expect(manifest).not.toContain('blockMapSize')
      const archiveCheck = spawnSync('/usr/bin/unzip', ['-tq', resolve(directory, `${base}.zip`)], { encoding: 'utf8' })
      expect(archiveCheck.status).toBe(0)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it.each(['win32', 'linux'] as const)('stages Pi using an executable npm entry on %s without a shell', platform => {
    const windows = platform === 'win32'
    const paths = windows ? path.win32 : path.posix
    const executable = windows ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node'
    const scriptPath = windows ? 'C:\\repo\\scripts\\stagePiRuntime.mjs' : '/repo/scripts/stagePiRuntime.mjs'
    const source = readFileSync(resolve(root, 'scripts/stagePiRuntime.mjs'), 'utf8').replace('import.meta.url', JSON.stringify('file:///staging-script.mjs'))
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const stopped = new Error('stopped after command capture')
    const execute = vi.fn<(...args: unknown[]) => never>(() => { throw stopped })
    expect(() => runInNewContext(compiled, {
      exports: {},
      process: { platform, execPath: executable },
      console: { log: vi.fn() },
      require: (name: string) => {
        if (name === 'node:child_process') return { execFileSync: execute }
        if (name === 'node:path') return paths
        if (name === 'node:url') return { fileURLToPath: () => scriptPath }
        if (name === 'node:fs') {
          return {
            existsSync: () => false,
            readFileSync: () => JSON.stringify({ devDependencies: { '@earendil-works/pi-coding-agent': '1.5.2' } }),
            rmSync: vi.fn(),
            mkdirSync: vi.fn(),
            writeFileSync: vi.fn()
          }
        }
        throw Error(`Unexpected module: ${name}`)
      }
    })).toThrow(stopped)
    expect(execute).toHaveBeenCalledWith(
      windows ? executable : 'npm',
      [
        ...(windows ? [paths.join(paths.dirname(executable), 'node_modules/npm/bin/npm-cli.js')] : []),
        'install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'
      ],
      expect.objectContaining({ stdio: 'inherit' })
    )
    expect(execute.mock.calls[0]?.[2]).not.toHaveProperty('shell')
  })
})
