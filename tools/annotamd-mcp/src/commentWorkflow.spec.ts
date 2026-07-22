import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
test('exposes only the three focused comment tools', async() => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')
  const toolNames = [...source.matchAll(/registerTool\('([^']+)'/g)].map((match) => match[1])

  assert.deepEqual(toolNames, [
    'annotamd_list_comments',
    'annotamd_get_comment',
    'annotamd_reply_comment'
  ])
  assert.doesNotMatch(source, /registerResource\(/)
  assert.doesNotMatch(source, /registerPrompt\(/)
})

test('lists comments by file path and reads one or many comment ids', async() => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')

  assert.match(source, /annotamd_list_comments[\s\S]*filePath: z\.string\(\)\.min\(1\)/)
  assert.match(source, /commentId: z\.string\(\)\.min\(1\)\.optional\(\)/)
  assert.match(source, /commentIds: z\.array\(z\.string\(\)\.min\(1\)\)\.min\(1\)\.optional\(\)/)
  assert.doesNotMatch(source, /documentId: z\.string/)
})
