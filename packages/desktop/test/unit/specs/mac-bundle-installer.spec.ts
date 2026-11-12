// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import os from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { build } from 'plist'
import {
  acknowledgeMacBundleUpdate, canReplaceMacAppBundle, macAppBundlePath,
  macUpdateInstallerScript, prepareMacBundleUpdate
} from '../../../src/main/updater/macBundleInstaller'

const run = promisify(execFile)
let root: string

beforeEach(async() => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'annotamd-update-qa-')) })
afterEach(async() => { await fs.remove(root) })

const paths = () => {
  const target = path.join(root, 'AnnotaMD `literal` $value.app')
  return {target, executable: path.join(target, 'Contents/MacOS/AnnotaMD'), userData: path.join(root, 'user data')}
}

it('only enables bundle replacement for a writable app bundle outside App Translocation', async() => {
  const {executable, target} = paths()
  await fs.ensureDir(target)
  expect(macAppBundlePath(executable)).toBe(await fs.realpath(target))
  expect(canReplaceMacAppBundle(executable)).toBe(true)
  expect(macAppBundlePath('/usr/local/bin/node')).toBeNull()
  expect(canReplaceMacAppBundle('/tmp/AppTranslocation/random/AnnotaMD.app/Contents/MacOS/AnnotaMD')).toBe(false)
})

it.skipIf(process.platform === 'win32')('resolves application aliases to the same bundle before comparing installation identity', async() => {
  const {target, executable} = paths()
  await fs.ensureDir(target)
  const alias = path.join(root, 'alias.app')
  await fs.ensureSymlink(target, alias)
  expect(macAppBundlePath(path.join(alias, 'Contents/MacOS/AnnotaMD'))).toBe(macAppBundlePath(executable))
})

describe.skipIf(process.platform !== 'darwin')('validating an ad-hoc signed update', () => {
  beforeEach(async() => { await fs.ensureDir(paths().target) })
  const archive = async(changes: Record<string, string> = {}, tamper = false) => {
    const source = path.join(root, 'source/AnnotaMD.app')
    await fs.ensureDir(path.join(source, 'Contents/MacOS'))
    const program = path.join(root, 'fixture.c')
    await fs.writeFile(program, 'int main(void) { return 0; }\n')
    await run('/usr/bin/clang', [program, '-arch', process.arch === 'arm64' ? 'arm64' : 'x86_64',
      '-o', path.join(source, 'Contents/MacOS', changes.CFBundleExecutable ?? 'AnnotaMD')])
    await fs.outputFile(path.join(source, 'Contents/Resources/note.txt'), 'original')
    await fs.writeFile(path.join(source, 'Contents/Info.plist'), build({
      CFBundleIdentifier: 'com.github.tyronexie.annotamd', CFBundleExecutable: 'AnnotaMD',
      CFBundlePackageType: 'APPL', CFBundleShortVersionString: '2.20.0', ...changes
    }))
    await run('/usr/bin/codesign', ['--force', '--sign', '-', source])
    if (tamper) await fs.writeFile(path.join(source, 'Contents/Resources/note.txt'), 'changed')
    const zip = path.join(root, 'update.zip')
    await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', source, zip])
    return zip
  }

  it('prepares a locally signed update without an Apple developer certificate or changing the installed app', async() => {
    const {target, executable, userData} = paths()
    await fs.outputFile(path.join(target, 'old-version'), 'keep')
    const prepared = await prepareMacBundleUpdate(await archive(), '2.20.0', executable, userData, process.arch === 'arm64' ? 'arm64' : 'x86_64')
    expect(await fs.readFile(path.join(target, 'old-version'), 'utf8')).toBe('keep')
    expect(await fs.pathExists(path.join(prepared.stage, 'AnnotaMD.app/Contents/MacOS/AnnotaMD'))).toBe(true)
    const signature = await run('/usr/bin/codesign', ['-dv', '--verbose=4', path.join(prepared.stage, 'AnnotaMD.app')])
    expect(signature.stderr).toContain('Signature=adhoc')
  })

  it.each([
    {CFBundleIdentifier: 'org.other.app'}, {CFBundleShortVersionString: '2.19.0'},
    {CFBundleExecutable: 'other'}
  ])('rejects mismatched bundle identity before touching the installed app: %j', async changes => {
    const {executable, userData} = paths()
    await expect(prepareMacBundleUpdate(await archive(changes), '2.20.0', executable, userData, 'arm64')).rejects.toThrow('does not match')
    expect((await fs.readdir(root)).filter(name => name.startsWith('.annotamd-update-'))).toEqual([])
  })

  it('rejects an unsupported architecture and removes the staging folder', async() => {
    const {executable, userData} = paths()
    await expect(prepareMacBundleUpdate(await archive(), '2.20.0', executable, userData, 'not-a-cpu')).rejects.toThrow('architecture')
    expect((await fs.readdir(root)).filter(name => name.startsWith('.annotamd-update-'))).toEqual([])
  })

  it('rejects a modified bundle even when its version and identity match', async() => {
    const {executable, userData} = paths()
    await expect(prepareMacBundleUpdate(await archive({}, true), '2.20.0', executable, userData, process.arch === 'arm64' ? 'arm64' : 'x86_64')).rejects.toThrow('codesign')
    expect((await fs.readdir(root)).filter(name => name.startsWith('.annotamd-update-'))).toEqual([])
  })
})

describe.skipIf(process.platform === 'win32')('the detached installation transaction', () => {
  const setup = async(approved = true, failNewLaunch = false) => {
    const {target, userData} = paths()
    const stage = path.join(root, '.annotamd-update-test')
    await fs.outputFile(path.join(target, 'version'), 'old')
    await fs.outputFile(path.join(stage, 'AnnotaMD.app/version'), 'new')
    if (approved) await fs.writeFile(path.join(stage, 'install-approved'), '')
    const script = path.join(stage, 'install.sh')
    await fs.writeFile(script, macUpdateInstallerScript)
    const launcher = path.join(root, 'launch app')
    await fs.writeFile(launcher, `#!/bin/sh
version=$(/bin/cat "$1/version")
if [ "$version" = new ]; then
  ${failNewLaunch ? 'exit 1' : '/usr/bin/touch "$UPDATE_STAGE/ready"'}
fi
echo "$version" >> "$UPDATE_LAUNCHES"
/bin/sleep 0.5
`, {mode: 0o700})
    return {target, stage, script, userData, launcher}
  }
  const execute = (p: Awaited<ReturnType<typeof setup>>) => new Promise<number | null>((resolve, reject) => {
    const child = spawn('/bin/sh', [p.script, p.target, p.stage, '99999999', p.userData, p.launcher], {
      env: {...process.env, UPDATE_STAGE: p.stage, UPDATE_LAUNCHES: path.join(root, 'launches')}, stdio: 'ignore'
    })
    child.once('error', reject)
    child.once('exit', resolve)
  })

  it('replaces and relaunches only after shutdown approval, preserving paths literally', async() => {
    const p = await setup()
    expect(await execute(p)).toBe(0)
    expect(await fs.readFile(path.join(p.target, 'version'), 'utf8')).toBe('new')
    expect(await fs.pathExists(p.stage)).toBe(false)
    expect(await fs.readFile(path.join(root, 'launches'), 'utf8')).toBe('new\n')
  })

  it('leaves the old app intact if shutdown was not approved', async() => {
    const p = await setup(false)
    expect(await execute(p)).toBe(0)
    expect(await fs.readFile(path.join(p.target, 'version'), 'utf8')).toBe('old')
    expect(await fs.pathExists(path.join(root, 'launches'))).toBe(false)
  })

  it('rolls back and relaunches the old app when the new app fails to start', async() => {
    const p = await setup(true, true)
    expect(await execute(p)).toBe(1)
    expect(await fs.readFile(path.join(p.target, 'version'), 'utf8')).toBe('old')
    await vi.waitFor(async() => expect(await fs.readFile(path.join(root, 'launches'), 'utf8')).toBe('old\n'))
  })
})

it('acknowledges only the expected version and installed bundle', async() => {
  const {target, executable, userData} = paths()
  const stage = path.join(root, '.annotamd-update-ack')
  await fs.ensureDir(stage)
  const journal = path.join(userData, 'pending-mac-update.json')
  await fs.outputJson(journal, {target, stage, version: '2.20.0', userData})
  await acknowledgeMacBundleUpdate(executable, '2.19.0', userData)
  expect(await fs.pathExists(path.join(stage, 'ready'))).toBe(false)
  await acknowledgeMacBundleUpdate(executable, '2.20.0', userData)
  expect(await fs.pathExists(path.join(stage, 'ready'))).toBe(true)
  expect(await fs.pathExists(journal)).toBe(false)
})
