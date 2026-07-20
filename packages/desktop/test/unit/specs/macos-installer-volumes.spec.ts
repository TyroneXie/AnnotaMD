import { describe, expect, it, vi } from 'vitest'
import { cleanupMountedAnnotaMdInstallers } from '../../../src/main/utils/macosInstallerVolumes'

const directoryEntry = (name: string, isDirectory = true) => ({
  name,
  isDirectory: () => isDirectory
})

const createDependencies = () => ({
  readdir: vi.fn(),
  access: vi.fn(),
  runCommand: vi.fn()
})

describe('cleanupMountedAnnotaMdInstallers', () => {
  it.each([
    ['win32', true, '/Applications/AnnotaMD.app/Contents/MacOS/AnnotaMD'],
    ['darwin', false, '/Applications/AnnotaMD.app/Contents/MacOS/AnnotaMD'],
    ['darwin', true, '/Volumes/AnnotaMD 2.11.0-arm64/AnnotaMD.app/Contents/MacOS/AnnotaMD'],
    [
      'darwin',
      true,
      '/private/var/folders/aa/AppTranslocation/123/d/AnnotaMD.app/Contents/MacOS/AnnotaMD'
    ]
  ] as const)('does nothing for an ineligible launch', async (platform, isPackaged, executablePath) => {
    const dependencies = createDependencies()

    await expect(
      cleanupMountedAnnotaMdInstallers(
        { platform, isPackaged, executablePath },
        dependencies
      )
    ).resolves.toEqual([])
    expect(dependencies.readdir).not.toHaveBeenCalled()
  })

  it('unregisters and detaches only mounted AnnotaMD installer apps', async () => {
    const dependencies = createDependencies()
    dependencies.readdir.mockResolvedValue([
      directoryEntry('AnnotaMD 2.10.1-arm64'),
      directoryEntry('AnnotaMD 2.11.0-arm64'),
      directoryEntry('AnnotaMD Backup'),
      directoryEntry('Other App 1.0'),
      directoryEntry('AnnotaMD note.txt', false)
    ])
    dependencies.access.mockResolvedValue(undefined)
    dependencies.runCommand.mockResolvedValue(undefined)

    const result = await cleanupMountedAnnotaMdInstallers(
      {
        platform: 'darwin',
        isPackaged: true,
        executablePath: '/Applications/AnnotaMD.app/Contents/MacOS/AnnotaMD'
      },
      dependencies
    )

    expect(result).toEqual([
      '/Volumes/AnnotaMD 2.10.1-arm64',
      '/Volumes/AnnotaMD 2.11.0-arm64'
    ])
    expect(dependencies.runCommand).toHaveBeenCalledTimes(4)
    expect(dependencies.runCommand).toHaveBeenCalledWith(
      expect.stringContaining('LaunchServices.framework/Support/lsregister'),
      ['-u', '/Volumes/AnnotaMD 2.10.1-arm64/AnnotaMD.app']
    )
    expect(dependencies.runCommand).toHaveBeenCalledWith('hdiutil', [
      'detach',
      '/Volumes/AnnotaMD 2.11.0-arm64'
    ])
  })

  it('ignores a matching volume without an AnnotaMD app', async () => {
    const dependencies = createDependencies()
    dependencies.readdir.mockResolvedValue([directoryEntry('AnnotaMD Backup')])
    dependencies.access.mockRejectedValue(new Error('missing'))

    await expect(
      cleanupMountedAnnotaMdInstallers(
        {
          platform: 'darwin',
          isPackaged: true,
          executablePath: '/Applications/AnnotaMD.app/Contents/MacOS/AnnotaMD'
        },
        dependencies
      )
    ).resolves.toEqual([])
    expect(dependencies.runCommand).not.toHaveBeenCalled()
  })
})
