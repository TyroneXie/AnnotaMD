import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const desktopRoot = resolve(__dirname, '../../..')
const adapterPath = resolve(desktopRoot, 'resources/pi-adapter/adapter.mjs')
const manifestPath = resolve(desktopRoot, 'resources/pi-adapter/manifest.json')
const builderPath = resolve(desktopRoot, 'electron-builder.yml')

const adapterSource = readFileSync(adapterPath, 'utf8')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
const builderSource = readFileSync(builderPath, 'utf8')

describe('bundled external Pi adapter contract', () => {
  it('declares the verified external runtime and packaged entrypoint', () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      adapterProtocol: 1,
      adapterVersion: '1.0.0',
      entry: 'adapter.mjs',
      piPackage: '@earendil-works/pi-coding-agent',
      minimumPiVersion: '0.84.3',
      verifiedPiVersions: ['0.84.3'],
      maxDocumentBytes: 8 * 1024 * 1024,
      capabilities: ['snapshot-v1', 'proposal-v1', 'approval-v1', 'feedback-v1', 'abortable-input'],
      toolOwners: {
        read: 'annotamd-pi-adapter/v1',
        edit: 'annotamd-pi-adapter/v1',
        write: 'annotamd-pi-adapter/v1'
      }
    })
    expect(builderSource).toMatch(/from: resources\/pi-adapter\s+to: pi-adapter/)
    expect(adapterSource).toContain("from '@earendil-works/pi-coding-agent'")
    expect(adapterSource).not.toMatch(/Documents\/work\/github\/pi|node_modules\/.*pi-coding-agent/)
  })

  it('is valid JavaScript and overrides the three document tools', () => {
    const syntaxCheck = spawnSync(process.execPath, ['--check', adapterPath], { encoding: 'utf8' })
    expect(syntaxCheck.status, syntaxCheck.stderr).toBe(0)
    expect(adapterSource.match(/pi\.registerTool\(\{/g)).toHaveLength(3)
    expect(adapterSource).toContain('createReadTool')
    expect(adapterSource).toContain('createEditTool')
    expect(adapterSource).toContain('createWriteTool')
    expect(adapterSource.match(/executionMode: 'sequential'/g)).toHaveLength(2)
  })

  it('uses the stock RPC UI tunnel with bounded base64url envelopes', () => {
    expect(adapterSource).toContain("const BRIDGE_TITLE = 'annotamd.bridge.v1'")
    expect(adapterSource).toContain("const WIRE_PREFIX = 'am1.'")
    expect(adapterSource).toContain("const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024")
    expect(adapterSource).toContain("toString('base64url')")
    expect(adapterSource).toContain("Buffer.from(encoded, 'base64url')")
    expect(adapterSource).toContain('ctx.ui.input(BRIDGE_TITLE, encodeEnvelope(request), { signal })')
    expect(adapterSource).toContain("kind: 'snapshot'")
    expect(adapterSource).toContain("kind: 'proposal'")
    expect(adapterSource).toContain("kind: 'approval'")
    expect(adapterSource).toContain('snapshot content hash does not match its content')
  })

  it('announces readiness without blocking and keeps document tools fail closed', () => {
    expect(adapterSource).toContain("pi.on('session_start'")
    expect(adapterSource).toContain("const READY_PREFIX = 'ANNOTAMD_ADAPTER_READY:'")
    expect(adapterSource).toContain('adapterProtocol: PROTOCOL_VERSION')
    expect(adapterSource).toContain("capabilities: ['snapshot-v1', 'proposal-v1', 'approval-v1', 'feedback-v1', 'abortable-input']")
    expect(adapterSource).toContain("pi.on('tool_call'")
    expect(adapterSource).toContain('const allTools = ctx.getAllTools()')
    expect(adapterSource).toContain('const activeTools = ctx.getActiveTools()')
    expect(adapterSource).toContain('candidate.name === name')
    expect(adapterSource).toContain('tool.sourceInfo.path')
    expect(adapterSource).toContain('activeTools,')
    expect(adapterSource).toContain('tools,')
    expect(adapterSource.match(/'annotamd-pi-adapter\/v1'/g)).toHaveLength(3)
    expect(adapterSource).toContain('const ready = encodeReadyPayload({')
    expect(adapterSource).toContain('ctx.ui.notify(`${READY_PREFIX}${ready}`, \'info\')')
    expect(adapterSource).not.toMatch(/session_start[\s\S]{0,800}ui\.input/)
    expect(adapterSource).not.toMatch(/writeFile as fsWriteFile|mkdir as fsMkdir/)
    expect(adapterSource).not.toMatch(/fsAccess|fsReadFile|detectSupportedImageMimeTypeFromFile/)
    expect(adapterSource).toContain("throw new BridgeProtocolError('read target is not the current AnnotaMD document')")
    expect(adapterSource).toContain("throw new BridgeProtocolError('edit target is not the current AnnotaMD document')")
    expect(adapterSource).toContain("throw new BridgeProtocolError('write target is not the current AnnotaMD document')")
    expect(adapterSource).toContain('return baseReadTool.execute(toolCallId, params, signal, onUpdate)')
    expect(adapterSource).toContain('return baseEditTool.execute(toolCallId, params, signal, onUpdate)')
    expect(adapterSource).toContain('return baseWriteTool.execute(toolCallId, params, signal, onUpdate)')
    expect(adapterSource).toContain("case 'accepted'")
    expect(adapterSource).toContain("case 'rejected'")
    expect(adapterSource).toContain("case 'feedback'")
    expect(adapterSource).toContain("case 'conflict'")
    expect(adapterSource).toContain('ctx.abort()')
  })
})
