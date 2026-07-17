import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const collections = [
  ['tabler', 'Tabler'],
  ['lucide', 'Lucide'],
  ['ph', 'Phosphor'],
  ['ri', 'Remix Icon'],
  ['material-symbols', 'Material Symbols'],
  ['hugeicons', 'Hugeicons'],
  ['mdi', 'Material Design Icons'],
  ['bi', 'Bootstrap Icons']
]
const query = process.argv.slice(2).join('-').trim().toLowerCase()

if (!query) {
  console.error('Usage: npm run icons:search -- <keyword>')
  process.exitCode = 1
} else {
  for (const [collection, label] of collections) {
    const data = require(`@iconify-json/${collection}/icons.json`)
    const matches = [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})]
      .filter(name => name.includes(query))
      .slice(0, 40)
    console.log(`\n${label} (${collection}) — ${matches.length ? matches.length : 'no'} matches`)
    if (matches.length) console.log(matches.join('\n'))
  }
}
