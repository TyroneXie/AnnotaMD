import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveClientIdentity } from './clientIdentity.js'

test('uses the configured name for first-party Agent setup', () => {
  assert.deepEqual(resolveClientIdentity('codex', {
    name: 'codex-mcp-client',
    version: '1.2.3'
  }), {
    name: 'codex',
    version: '1.2.3'
  })
})

test('discovers WorkBuddy and QoderWork from the MCP handshake', () => {
  assert.deepEqual(resolveClientIdentity(undefined, {
    name: 'WorkBuddy',
    version: '2.0.0'
  }), {
    name: 'WorkBuddy',
    version: '2.0.0'
  })
  assert.deepEqual(resolveClientIdentity(undefined, {
    name: 'QoderWork',
    version: '3.1.0'
  }), {
    name: 'QoderWork',
    version: '3.1.0'
  })
})

test('falls back to a generic Agent only when the client reports no identity', () => {
  assert.deepEqual(resolveClientIdentity(undefined, undefined), {
    name: 'Agent',
    version: undefined
  })
})
