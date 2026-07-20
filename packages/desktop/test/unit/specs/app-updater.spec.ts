import { describe, expect, it } from 'vitest'
import { isAppUpdateSupported } from '../../../src/main/updater/support'
import { reduceUpdateState, shouldAutomaticallyDownload } from '../../../src/main/updater/state'
import type { AppUpdateState } from '../../../src/shared/types/update'
import preferenceSchema from '../../../src/main/preferences/schema.json'
import defaultPreferences from '../../../static/preference.json'
// The release workflow runs this dependency-free ESM module directly with Node.
// @ts-expect-error JavaScript release helper intentionally has no declaration file.
import {
  groupUpdateArtifacts,
  serializeUpdateManifest,
  validateUpdateArtifacts
} from '../../../../../scripts/generateUpdateManifests.mjs'

const initialState = (): AppUpdateState => ({
  status: 'idle',
  currentVersion: '2.11.0'
})

describe('application updater support', () => {
  it('enables automatic downloads by default while keeping installation explicit', () => {
    expect(preferenceSchema.autoDownloadUpdates.default).toBe(true)
    expect(defaultPreferences.autoDownloadUpdates).toBe(true)
    expect(
      shouldAutomaticallyDownload(true, {
        status: 'available',
        currentVersion: '2.11.0',
        version: '2.12.0'
      })
    ).toBe(true)
    expect(
      shouldAutomaticallyDownload(false, {
        status: 'available',
        currentVersion: '2.11.0',
        version: '2.12.0'
      })
    ).toBe(false)
  })

  it('publishes both desktop architectures in each platform update manifest', () => {
    const files = [
      'annotamd-mac-x64-2.12.0.zip',
      'annotamd-mac-arm64-2.12.0.zip',
      'annotamd-win-x64-2.12.0-setup.exe',
      'annotamd-win-arm64-2.12.0-setup.exe',
      'annotamd-linux-2.12.0.AppImage'
    ].map((url) => ({ url, sha512: `${url}-hash`, size: 42 }))
    const groups = groupUpdateArtifacts(files)

    expect(groups['latest-mac.yml']).toHaveLength(2)
    expect(groups['latest.yml']).toHaveLength(2)
    expect(groups['latest-linux.yml']).toHaveLength(1)
    expect(() => validateUpdateArtifacts(groups)).not.toThrow()
    const macManifest = serializeUpdateManifest(
      '2.12.0',
      groups['latest-mac.yml'],
      '2026-07-20T00:00:00.000Z'
    )
    expect(macManifest).toContain('annotamd-mac-x64-2.12.0.zip')
    expect(macManifest).toContain('annotamd-mac-arm64-2.12.0.zip')
  })

  it('supports packaged macOS apps with update metadata', () => {
    expect(
      isAppUpdateSupported({
        resourcesPath: '/app/resources',
        platform: 'darwin',
        pathExists: (filePath) => filePath.endsWith('app-update.yml')
      })
    ).toBe(true)
  })

  it('limits Windows and Linux updates to installable targets', () => {
    const pathExists = (filePath: string) =>
      filePath.endsWith('app-update.yml') || filePath.endsWith('icons/md.ico')

    expect(
      isAppUpdateSupported({ resourcesPath: '/app/resources', platform: 'win32', pathExists })
    ).toBe(true)
    expect(
      isAppUpdateSupported({ resourcesPath: '/app/resources', platform: 'linux', pathExists })
    ).toBe(false)
    expect(
      isAppUpdateSupported({
        resourcesPath: '/app/resources',
        platform: 'linux',
        appImagePath: '/tmp/AnnotaMD.AppImage',
        pathExists
      })
    ).toBe(true)
  })
})

describe('application updater state', () => {
  it('tracks an available update through download completion', () => {
    let state = reduceUpdateState(initialState(), { type: 'available', version: '2.12.0' })
    expect(state).toMatchObject({ status: 'available', version: '2.12.0' })

    state = reduceUpdateState(state, { type: 'download-started' })
    state = reduceUpdateState(state, {
      type: 'download-progress',
      percent: 43.6,
      transferred: 436,
      total: 1000
    })
    expect(state).toMatchObject({ status: 'downloading', progress: 43.6 })

    state = reduceUpdateState(state, { type: 'downloaded', version: '2.12.0' })
    expect(state).toMatchObject({ status: 'downloaded', version: '2.12.0', progress: 100 })
  })

  it('keeps the target version after a download error so retry remains available', () => {
    const available = reduceUpdateState(initialState(), { type: 'available', version: '2.12.0' })
    const failed = reduceUpdateState(available, { type: 'error', message: 'network timeout' })

    expect(failed).toMatchObject({
      status: 'error',
      version: '2.12.0',
      message: 'network timeout'
    })
  })

  it('clears stale update metadata when no update is available', () => {
    const stale: AppUpdateState = {
      status: 'downloading',
      currentVersion: '2.11.0',
      version: '2.12.0',
      progress: 90,
      transferred: 900,
      total: 1000
    }

    expect(reduceUpdateState(stale, { type: 'not-available' })).toEqual({
      status: 'up-to-date',
      currentVersion: '2.11.0'
    })
  })
})
