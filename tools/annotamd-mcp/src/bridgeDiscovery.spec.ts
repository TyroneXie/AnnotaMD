import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { discoverRunningBridge, getBridgeFileCandidates } from './bridgeDiscovery.js'

test('prefers the running installed app over a pinned development bridge', async() => {
  const home = await mkdtemp(join(tmpdir(), 'annotamd-bridge-'))
  const base = join(home, 'Library', 'Application Support')
  const installed = join(base, 'marktext', 'agent-bridge.json')
  const development = join(base, 'annotamd-dev', 'agent-bridge.json')
  await mkdir(join(base, 'marktext'), { recursive: true })
  await mkdir(join(base, 'annotamd-dev'), { recursive: true })
  await writeFile(installed, JSON.stringify({ port: 4100, token: 'installed' }))
  await writeFile(development, JSON.stringify({ port: 4200, token: 'development' }))

  const candidates = getBridgeFileCandidates({
    platform: 'darwin',
    homeDirectory: home,
    environment: { ANNOTAMD_BRIDGE_FILE: development }
  })
  const config = await discoverRunningBridge(candidates, async(value) => value.port === 4100)

  assert.deepEqual(config, { port: 4100, token: 'installed' })
  await rm(home, { recursive: true, force: true })
})

test('skips stale manifests and falls back to the active development app', async() => {
  const home = await mkdtemp(join(tmpdir(), 'annotamd-bridge-'))
  const base = join(home, 'Library', 'Application Support')
  const installed = join(base, 'AnnotaMD', 'agent-bridge.json')
  const development = join(base, 'annotamd-dev', 'agent-bridge.json')
  await mkdir(join(base, 'AnnotaMD'), { recursive: true })
  await mkdir(join(base, 'annotamd-dev'), { recursive: true })
  await writeFile(installed, JSON.stringify({ port: 4100, token: 'stale' }))
  await writeFile(development, JSON.stringify({ port: 4200, token: 'active' }))

  const candidates = getBridgeFileCandidates({ platform: 'darwin', homeDirectory: home })
  const config = await discoverRunningBridge(candidates, async(value) => value.token === 'active')

  assert.deepEqual(config, { port: 4200, token: 'active' })
  await rm(home, { recursive: true, force: true })
})
