import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeUpdateManifest } from './generateUpdateManifests.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const arch = process.argv[2] ?? process.arch
if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`)
if (process.platform !== 'darwin') throw new Error('macOS update archives must be created on macOS')
const output = path.resolve(process.argv[3] ?? path.join(root, 'dist'))
const { version } = JSON.parse(await readFile(path.join(root, 'packages/desktop/package.json'), 'utf8'))
const app = path.join(output, arch === 'arm64' ? 'mac-arm64' : 'mac', 'AnnotaMD.app')
const base = `annotamd-mac-${arch}-${version}`
await stat(path.join(app, 'Contents/Info.plist'))
await stat(path.join(output, `${base}.dmg`))
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, path.join(output, `${base}.zip`)])
const files = []
for (const extension of ['zip', 'dmg']) {
  const url = `${base}.${extension}`
  const filename = path.join(output, url)
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  files.push({ url, sha512: hash.digest('base64'), size: (await stat(filename)).size })
}
await writeFile(path.join(output, 'latest-mac.yml'), serializeUpdateManifest(version, files, new Date().toISOString()))
console.log(`Created macOS ${arch} update ZIP and manifest`)
