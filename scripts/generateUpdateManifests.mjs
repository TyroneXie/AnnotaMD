import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const artifactPatterns = {
  'latest-mac.yml': /^annotamd-mac-(?:x64|arm64)-.+\.(?:zip|dmg)$/,
  'latest.yml': /^annotamd-win-(?:x64|arm64)-.+-setup\.exe$/,
  'latest-linux.yml': /^annotamd-linux-.+\.(?:AppImage|deb|rpm)$/
}

const requiredArtifacts = {
  'latest-mac.yml': [
    /^annotamd-mac-x64-.+\.zip$/,
    /^annotamd-mac-arm64-.+\.zip$/
  ],
  'latest.yml': [
    /^annotamd-win-x64-.+-setup\.exe$/,
    /^annotamd-win-arm64-.+-setup\.exe$/
  ],
  'latest-linux.yml': [/^annotamd-linux-.+\.AppImage$/]
}

const artifactPriority = (name) => {
  if (name.endsWith('.zip') || name.endsWith('.AppImage') || name.endsWith('.exe')) return 0
  if (name.endsWith('.dmg') || name.endsWith('.deb')) return 1
  return 2
}

const quote = (value) => JSON.stringify(value)

export const serializeUpdateManifest = (version, files, releaseDate) => {
  if (!version || files.length === 0) throw new Error('An update manifest needs a version and files')
  const ordered = [...files].sort(
    (left, right) =>
      artifactPriority(left.url) - artifactPriority(right.url) || left.url.localeCompare(right.url)
  )
  const primary = ordered[0]
  const lines = [`version: ${quote(version)}`, 'files:']
  for (const file of ordered) {
    lines.push(`  - url: ${quote(file.url)}`)
    lines.push(`    sha512: ${quote(file.sha512)}`)
    lines.push(`    size: ${file.size}`)
    if (file.blockMapSize) lines.push(`    blockMapSize: ${file.blockMapSize}`)
  }
  lines.push(`path: ${quote(primary.url)}`)
  lines.push(`sha512: ${quote(primary.sha512)}`)
  lines.push(`releaseDate: ${quote(releaseDate)}`)
  return `${lines.join('\n')}\n`
}

export const groupUpdateArtifacts = (files) =>
  Object.fromEntries(
    Object.entries(artifactPatterns).map(([manifest, pattern]) => [
      manifest,
      files.filter((file) => pattern.test(file.url))
    ])
  )

export const validateUpdateArtifacts = (groups) => {
  for (const [manifest, patterns] of Object.entries(requiredArtifacts)) {
    const files = groups[manifest] ?? []
    for (const pattern of patterns) {
      if (!files.some((file) => pattern.test(file.url))) {
        throw new Error(`Missing required artifact for ${manifest}: ${pattern}`)
      }
    }
  }
}

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('base64')))
  })

const readArtifact = async(outputDirectory, name) => {
  const filePath = path.join(outputDirectory, name)
  const fileStat = await stat(filePath)
  let blockMapSize
  try {
    blockMapSize = (await stat(`${filePath}.blockmap`)).size
  } catch {
    blockMapSize = undefined
  }
  return {
    url: name,
    sha512: await hashFile(filePath),
    size: fileStat.size,
    blockMapSize
  }
}

export const generateUpdateManifests = async(outputDirectory, rawTag) => {
  const version = rawTag.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release tag: ${rawTag}`)
  }

  const names = await readdir(outputDirectory)
  const candidateNames = names.filter((name) =>
    Object.values(artifactPatterns).some((pattern) => pattern.test(name))
  )
  const artifacts = await Promise.all(
    candidateNames.map((name) => readArtifact(outputDirectory, name))
  )
  const groups = groupUpdateArtifacts(artifacts)
  validateUpdateArtifacts(groups)
  const releaseDate = new Date().toISOString()

  for (const [manifestName, files] of Object.entries(groups)) {
    if (files.length === 0) throw new Error(`No artifacts found for ${manifestName}`)
    await writeFile(
      path.join(outputDirectory, manifestName),
      serializeUpdateManifest(version, files, releaseDate),
      'utf8'
    )
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const [, , outputDirectory, releaseTag] = process.argv
  if (!outputDirectory || !releaseTag) {
    throw new Error('Usage: node scripts/generateUpdateManifests.mjs <dist-dir> <vX.Y.Z>')
  }
  await generateUpdateManifests(path.resolve(outputDirectory), releaseTag)
}
