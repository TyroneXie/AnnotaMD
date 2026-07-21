import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const outfile = 'bundle/index.mjs'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  logLevel: 'info'
})

const bundle = await readFile(outfile, 'utf8')
await writeFile(outfile, bundle.replace(/[ \t]+$/gm, ''))
