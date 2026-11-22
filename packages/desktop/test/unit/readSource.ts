import { readFileSync, type PathOrFileDescriptor } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Read SFC styles as well as its template/script for existing source contract tests. */
export function readSource(filename: PathOrFileDescriptor, encoding: 'utf8'): string {
  const source = readFileSync(filename, encoding)
  if (typeof filename !== 'string' || !filename.endsWith('.vue')) return source
  return source.replace(/<style\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/style>/g, (_match, before, src, after) =>
    `<style${before}${after}>\n${readFileSync(resolve(dirname(filename), src), 'utf8')}\n</style>`)
}
