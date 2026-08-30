import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
test('keeps the three comment tools and gates document tools behind an Agent scope', async() => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')
  const toolNames = [...source.matchAll(/registerTool\('([^']+)'/g)].map((match) => match[1])

  assert.deepEqual(toolNames, [
    'annotamd_list_comments',
    'annotamd_get_comment',
    'annotamd_reply_comment',
    'annotamd_get_context',
    'annotamd_read_document',
    'annotamd_edit_document',
    'annotamd_replace_document'
  ])
  assert.match(source, /if \(agentScopeToken\) \{[\s\S]*annotamd_get_context/)
  assert.match(source, /agentMutationsEnabled = process\.env\.ANNOTAMD_AGENT_MUTATIONS !== '0'/)
  assert.match(source, /if \(agentMutationsEnabled\) server\.registerTool\('annotamd_edit_document'/)
  assert.match(source, /if \(agentMutationsEnabled\) server\.registerTool\('annotamd_replace_document'/)
  assert.match(source, /callBridge\(method, \{ \.\.\.params, scopeToken: agentScopeToken \}\)/)
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

test('document mutation tools require revision and sha256 baselines', async() => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')

  assert.match(source, /annotamd_edit_document[\s\S]*expectedRevision: z\.number\(\)\.int\(\)\.nonnegative\(\)/)
  assert.match(source, /annotamd_edit_document[\s\S]*expectedHash: z\.string\(\)\.regex\(\/\^\[a-f0-9\]\{64\}\$\//)
  assert.match(source, /annotamd_replace_document[\s\S]*markdown: z\.string\(\)/)
  assert.doesNotMatch(source, /registerTool\('(?:write_file|shell|execute_command)'/)
})
