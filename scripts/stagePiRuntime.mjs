#!/usr/bin/env node
/**
 * Stages the Pi runtime that ships inside AnnotaMD.
 *
 * Two facts drive this script:
 *  - The published bundle is not self-contained: it loads `jiti` to compile an
 *    extension, and AnnotaMD always registers its bridge adapter.
 *  - Pi's own dependencies pull in the SDKs of every provider it supports
 *    (OpenAI, Anthropic, Google, AWS) - roughly 125 MB this product never
 *    reaches, because AnnotaMD speaks only the OpenAI-compatible and Anthropic
 *    wire formats through `models.json`.
 * So the runtime is installed once, then reduced to the package plus `jiti`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = '@earendil-works/pi-coding-agent'
const KEPT_DEPENDENCIES = ['jiti']
const DROPPED_PACKAGE_PATHS = ['docs', 'examples', 'schemas', 'CHANGELOG.md', 'containerization.md']

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDirectory, '..', 'packages', 'desktop')
const target = join(desktopRoot, 'resources', 'pi')
const versionFile = join(target, 'staged-version.json')

const directorySize = (directory) => readdirSync(directory, { withFileTypes: true })
  .reduce((total, entry) => {
    const full = join(directory, entry.name)
    // Pruning leaves dangling links in node_modules/.bin.
    if (entry.isSymbolicLink()) return total
    try {
      return total + (entry.isDirectory() ? directorySize(full) : statSync(full).size)
    } catch {
      return total
    }
  }, 0)

const pinnedVersion = (() => {
  const desktopPackage = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
  const version = desktopPackage.devDependencies?.[PACKAGE_NAME]
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${PACKAGE_NAME} must be pinned to an exact version in packages/desktop/package.json`)
  }
  return version
})()

if (existsSync(versionFile) && JSON.parse(readFileSync(versionFile, 'utf8')).version === pinnedVersion) {
  console.log(`Pi runtime ${pinnedVersion} is already staged`)
  process.exit(0)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
writeFileSync(join(target, 'package.json'), JSON.stringify({
  name: 'annotamd-pi-runtime',
  private: true,
  dependencies: { [PACKAGE_NAME]: pinnedVersion }
}, null, 2))

// Node cannot execFile a Windows .cmd shim. Invoke npm through Node itself,
// keeping paths with spaces as arguments instead of enabling a shell.
const npmCommand = process.platform === 'win32' ? process.execPath : 'npm'
const npmPrefix = process.platform === 'win32'
  ? [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  : []
execFileSync(npmCommand, [...npmPrefix,
  'install',
  '--omit=dev',
  '--omit=optional',
  '--no-audit',
  '--no-fund',
  '--ignore-scripts',
  '--loglevel=error'
], { cwd: target, stdio: 'inherit' })

const modulesRoot = join(target, 'node_modules')
const packageRoot = join(modulesRoot, ...PACKAGE_NAME.split('/'))

// Drop every dependency except the ones the runtime actually loads, keeping the
// scoped directory only while one of its packages survives.
const keep = new Set(KEPT_DEPENDENCIES)
for (const entry of readdirSync(modulesRoot)) {
  if (entry.startsWith('.')) continue
  if (entry.startsWith('@')) {
    const scopeRoot = join(modulesRoot, entry)
    for (const scoped of readdirSync(scopeRoot)) {
      const name = `${entry}/${scoped}`
      if (name === PACKAGE_NAME || keep.has(name)) continue
      rmSync(join(scopeRoot, scoped), { recursive: true, force: true })
    }
    if (readdirSync(scopeRoot).length === 0) rmSync(scopeRoot, { recursive: true, force: true })
    continue
  }
  if (entry === PACKAGE_NAME || keep.has(entry)) continue
  rmSync(join(modulesRoot, entry), { recursive: true, force: true })
}

for (const relative of DROPPED_PACKAGE_PATHS) {
  rmSync(join(packageRoot, relative), { recursive: true, force: true })
}
const prune = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      prune(full)
      continue
    }
    if (entry.name.endsWith('.map') || entry.name.endsWith('.d.ts')) rmSync(full, { force: true })
  }
}
prune(packageRoot)

const cli = join(packageRoot, 'dist', 'bundle', 'cli.js')
if (!existsSync(cli)) throw new Error(`Staged Pi runtime is missing ${cli}`)

writeFileSync(versionFile, JSON.stringify({ version: pinnedVersion }, null, 2))
const megabytes = (directorySize(target) / 1024 / 1024).toFixed(1)
console.log(`Staged Pi ${pinnedVersion} (${megabytes} MB)`)
