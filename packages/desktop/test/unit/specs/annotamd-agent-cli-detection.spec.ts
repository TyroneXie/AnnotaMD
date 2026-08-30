import { describe, expect, it, vi } from 'vitest'
import { detectCliExecutable } from 'main_renderer/ai/CliExecutableDetector'

describe('AnnotaMD CLI executable detection', () => {
  it('finds the provider command from DBX-style PATH discovery and reports its version', async() => {
    const executableProbe = vi.fn(async(pathname: string) => pathname === '/mock/bin/codex')
    const versionProbe = vi.fn(async() => 'codex-cli 1.2.3')

    const result = await detectCliExecutable({ provider: 'codex' }, {
      platform: 'darwin',
      environment: { PATH: '/mock/bin' },
      discoverDirectories: async() => ['/mock/bin'],
      executableProbe,
      versionProbe
    })

    expect(result).toEqual({
      found: true,
      provider: 'codex',
      command: 'codex',
      executablePath: '/mock/bin/codex',
      version: 'codex-cli 1.2.3',
      message: 'Detected Codex CLI: codex-cli 1.2.3'
    })
    expect(versionProbe).toHaveBeenCalledWith('/mock/bin/codex', { PATH: '/mock/bin' })
  })

  it('rejects a relative override and does not execute it', async() => {
    const executableProbe = vi.fn(async() => true)

    const result = await detectCliExecutable({
      provider: 'claude-code',
      executablePath: './claude'
    }, {
      platform: 'darwin',
      executableProbe
    })

    expect(result.found).toBe(false)
    expect(result.message).toContain('absolute')
    expect(executableProbe).not.toHaveBeenCalled()
  })

  it('returns the DBX command name when the CLI is not installed', async() => {
    const result = await detectCliExecutable({ provider: 'opencode' }, {
      platform: 'darwin',
      discoverDirectories: async() => ['/mock/bin'],
      executableProbe: async() => false
    })

    expect(result).toMatchObject({
      found: false,
      provider: 'opencode',
      command: 'opencode'
    })
  })
})
