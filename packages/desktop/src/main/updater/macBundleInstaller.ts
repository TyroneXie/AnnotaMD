import path from 'node:path'
import fs from 'fs-extra'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { parse } from 'plist'

const run = promisify(execFile)
const bundleIdentifier = 'com.github.tyronexie.annotamd'
const journalName = 'pending-mac-update.json'

export interface PreparedMacUpdate {
  target: string
  stage: string
  version: string
  userData: string
}

export const macAppBundlePath = (executablePath: string): string | null => {
  const bundle = path.dirname(path.dirname(path.dirname(executablePath)))
  if (!bundle.endsWith('.app') || executablePath !== path.join(bundle, 'Contents', 'MacOS', 'AnnotaMD')) return null
  try {
    const real = fs.realpathSync(bundle)
    return real.endsWith('.app') ? real : null
  } catch {
    return bundle
  }
}

export const canReplaceMacAppBundle = (executablePath = process.execPath): boolean => {
  const bundle = macAppBundlePath(executablePath)
  if (!bundle || bundle.includes('/AppTranslocation/')) return false
  try {
    if (!fs.statSync(bundle).isDirectory()) return false
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

export const prepareMacBundleUpdate = async(
  archive: string,
  version: string,
  executablePath: string,
  userData: string,
  architecture: string
): Promise<PreparedMacUpdate> => {
  const target = macAppBundlePath(executablePath)
  if (!target || !canReplaceMacAppBundle(executablePath)) {
    throw new Error('The application folder is not writable. Move AnnotaMD to Applications before updating.')
  }
  const stage = await fs.mkdtemp(path.join(path.dirname(target), '.annotamd-update-'))
  try {
    await run('/usr/bin/ditto', ['-x', '-k', archive, stage])
    const candidate = path.join(stage, 'AnnotaMD.app')
    const info = parse(await fs.readFile(path.join(candidate, 'Contents', 'Info.plist'), 'utf8')) as Record<string, unknown>
    if (info.CFBundleIdentifier !== bundleIdentifier || info.CFBundleExecutable !== 'AnnotaMD'
      || info.CFBundleShortVersionString !== version) {
      throw new Error('The downloaded application does not match the requested AnnotaMD update.')
    }
    const binary = path.join(candidate, 'Contents', 'MacOS', 'AnnotaMD')
    const { stdout } = await run('/usr/bin/lipo', ['-archs', binary], { encoding: 'utf8' })
    if (!stdout.trim().split(/\s+/).includes(architecture)) {
      throw new Error('The downloaded application does not support this Mac architecture.')
    }
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', candidate])
    const prepared = { target, stage, version, userData }
    const journal = path.join(userData, journalName)
    const previous: PreparedMacUpdate | null = await fs.readJson(journal).catch(() => null)
    await fs.outputJson(journal, prepared, { mode: 0o600 })
    if (previous?.target === target && previous.stage !== stage && ownsStagingFolder(previous.stage, target)) {
      await fs.remove(previous.stage)
    }
    return prepared
  } catch (error) {
    await fs.remove(stage)
    throw error
  }
}

const ownsStagingFolder = (stage: string, target: string): boolean =>
  typeof stage === 'string' && path.dirname(stage) === path.dirname(target)
  && path.basename(stage).startsWith('.annotamd-update-')

// Arguments remain separate from the shell source, including application paths
// containing quotes, spaces, dollar signs or backticks.
export const macUpdateInstallerScript = `#!/bin/sh
target=$1
stage=$2
parent_pid=$3
user_data=$4
launcher=$5
backup="$stage/previous.app"
candidate="$stage/AnnotaMD.app"
exec >> "$stage/install.log" 2>&1
while kill -0 "$parent_pid" 2>/dev/null; do /bin/sleep 0.2; done
[ -f "$stage/install-approved" ] || exit 0

launch_app() {
  if [ -n "$launcher" ]; then
    "$launcher" "$target" "$user_data" &
  else
    /usr/bin/nohup "$target/Contents/MacOS/AnnotaMD" --user-data-dir "$user_data" &
  fi
  launched_pid=$!
}

rollback() {
  if [ -d "$backup" ]; then
    if [ -e "$target" ]; then /bin/mv "$target" "$stage/failed.app" || exit 1; fi
    /bin/mv "$backup" "$target" || exit 1
  fi
  launch_app
  exit 1
}

/bin/mv "$target" "$backup" || exit 1
/bin/mv "$candidate" "$target" || rollback
launch_app
while :; do
  if [ -f "$stage/ready" ]; then
    /bin/rm -rf "$stage"
    exit 0
  fi
  kill -0 "$launched_pid" 2>/dev/null || rollback
  /bin/sleep 0.2
done
`

export const approveMacBundleInstall = (update: PreparedMacUpdate): void => {
  fs.writeFileSync(path.join(update.stage, 'install-approved'), '')
}

export const startMacBundleInstall = async(update: PreparedMacUpdate): Promise<ChildProcess> => {
  const script = path.join(update.stage, 'install.sh')
  await fs.writeFile(script, macUpdateInstallerScript, { mode: 0o700 })
  await fs.outputJson(path.join(update.userData, journalName), update, { mode: 0o600 })
  const child = spawn('/bin/sh', [script, update.target, update.stage, String(process.pid), update.userData, ''], {
    detached: true, stdio: 'ignore'
  })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', resolve)
  })
  child.unref()
  return child
}

export const acknowledgeMacBundleUpdate = async(
  executablePath: string,
  version: string,
  userData: string
): Promise<void> => {
  const journal = path.join(userData, journalName)
  if (!await fs.pathExists(journal)) return
  const update = await fs.readJson(journal) as PreparedMacUpdate
  const target = macAppBundlePath(executablePath)
  if (!target || update.target !== target || update.version !== version
    || !ownsStagingFolder(update.stage, target)) return
  if (await fs.pathExists(update.stage)) await fs.writeFile(path.join(update.stage, 'ready'), '')
  await fs.remove(journal)
}
