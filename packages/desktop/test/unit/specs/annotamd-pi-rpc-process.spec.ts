// @vitest-environment node

import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodePiBridgeEnvelope,
  encodePiBridgeEnvelope,
  PiRpcCompatibilityError,
  PiRpcProcessManager,
  type PiAdapterHandshake,
  type PiRpcProcessOptions
} from '../../../src/main/piWorkspace/PiRpcProcessManager'

class FakePiProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false

  kill(): boolean {
    this.killed = true
    return true
  }
}

const runtimes: PiRpcProcessManager[] = []
const adapterPath = '/app/resources/pi-adapter/adapter.mjs'

const readyHandshake = (overrides: Partial<PiAdapterHandshake> = {}): PiAdapterHandshake => ({
  adapterProtocol: 1,
  adapterVersion: '1.0.0',
  piVersion: '0.84.3',
  capabilities: ['snapshot-v1', 'proposal-v1', 'approval-v1', 'feedback-v1', 'abortable-input'],
  activeTools: ['read', 'edit', 'write'],
  tools: {
    read: { sourceInfo: { path: adapterPath } },
    edit: { sourceInfo: { path: adapterPath } },
    write: { sourceInfo: { path: adapterPath } }
  },
  toolOwners: {
    read: 'annotamd-pi-adapter/v1',
    edit: 'annotamd-pi-adapter/v1',
    write: 'annotamd-pi-adapter/v1'
  },
  ...overrides
})

const writeReady = (process: FakePiProcess, handshake = readyHandshake()): void => {
  const encoded = Buffer.from(JSON.stringify(handshake), 'utf8').toString('base64url')
  process.stdout.write(`${JSON.stringify({
    type: 'extension_ui_request',
    id: 'ready-notify',
    method: 'notify',
    message: `ANNOTAMD_ADAPTER_READY:${encoded}`
  })}\n`)
}

const createRuntime = (
  handshake = readyHandshake(),
  launch: Pick<PiRpcProcessOptions, 'executablePath'> & Partial<Pick<
    PiRpcProcessOptions,
    'executableArgs' | 'model' | 'thinkingLevel' | 'noSession'
  >> = {
    executablePath: '/opt/bin/pi'
  }
): {
  runtime: PiRpcProcessManager
  process: FakePiProcess
  spawnProcess: ReturnType<typeof vi.fn>
  commands: Array<Record<string, unknown>>
} => {
  const process = new FakePiProcess()
  const commands: Array<Record<string, unknown>> = []
  let pendingInput = ''
  process.stdin.on('data', (chunk: Buffer) => {
    pendingInput += chunk.toString('utf8')
    while (pendingInput.includes('\n')) {
      const newline = pendingInput.indexOf('\n')
      const line = pendingInput.slice(0, newline)
      pendingInput = pendingInput.slice(newline + 1)
      if (!line) continue
      const command = JSON.parse(line) as Record<string, unknown>
      commands.push(command)
      if (command.type === 'get_state') {
        process.stdout.write(`${JSON.stringify({
          id: command.id,
          type: 'response',
          command: 'get_state',
          success: true,
          data: {
            model: { provider: 'test', id: 'model' },
            isStreaming: false,
            sessionId: 'session-1',
            sessionFile: '/sessions/session-1.jsonl'
          }
        })}\n`)
      } else if (command.type === 'get_available_models') {
        process.stdout.write(`${JSON.stringify({
          id: command.id,
          type: 'response',
          command: 'get_available_models',
          success: true,
          data: {
            models: [
              { provider: 'test', id: 'model', name: 'Test model' },
              { provider: 'test', id: 'second' }
            ]
          }
        })}\n`)
      } else if (command.type === 'get_available_thinking_levels') {
        process.stdout.write(`${JSON.stringify({
          id: command.id,
          type: 'response',
          command: 'get_available_thinking_levels',
          success: true,
          data: { levels: ['off', 'high', 'xhigh'] }
        })}\n`)
      } else if (command.type === 'prompt' || command.type === 'abort') {
        process.stdout.write(`${JSON.stringify({
          id: command.id,
          type: 'response',
          command: command.type,
          success: true
        })}\n`)
      }
    }
  })
  const spawnProcess = vi.fn(() => process)
  const runtime = new PiRpcProcessManager({
    ...launch,
    piVersion: '0.84.3',
    workspacePath: '/workspace',
    adapterPath,
    spawnProcess: spawnProcess as never
  })
  runtimes.push(runtime)
  queueMicrotask(() => writeReady(process, handshake))
  return { runtime, process, spawnProcess, commands }
}

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose()
})

describe('PiRpcProcessManager', () => {
  it('starts an external Pi in safe RPC mode and verifies the adapter', async() => {
    const { runtime, spawnProcess } = createRuntime()

    await expect(runtime.start()).resolves.toEqual({
      readiness: {
        status: 'ready',
        executablePath: '/opt/bin/pi',
        version: '0.84.3',
        adapterProtocol: 1,
        model: 'test/model'
      },
      session: {
        id: 'session-1',
        sessionFile: '/sessions/session-1.jsonl'
      }
    })
    expect(spawnProcess).toHaveBeenCalledWith(
      '/opt/bin/pi',
      [
        '--mode', 'rpc',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-context-files',
        '--extension', '/app/resources/pi-adapter/adapter.mjs',
        '--no-approve'
      ],
      expect.objectContaining({ cwd: '/workspace', shell: false })
    )
  })

  it('prepends a fixed CLI path when Pi is launched through Node on Windows', async() => {
    const cliPath = 'C:\\Users\\Ada\\AppData\\Roaming\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js'
    const { runtime, spawnProcess } = createRuntime(readyHandshake(), {
      executablePath: 'C:\\Node\\node.exe',
      executableArgs: [cliPath]
    })

    await expect(runtime.start()).resolves.toMatchObject({
      readiness: {
        executablePath: 'C:\\Node\\node.exe',
        executableArgs: [cliPath]
      }
    })
    expect(spawnProcess).toHaveBeenCalledWith(
      'C:\\Node\\node.exe',
      [
        cliPath,
        '--mode', 'rpc',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-context-files',
        '--extension', '/app/resources/pi-adapter/adapter.mjs',
        '--no-approve'
      ],
      expect.objectContaining({ shell: false })
    )
  })

  it('uses isolated sessions and safe startup model selection with Pi built-in tools enabled', async() => {
    const { runtime, spawnProcess } = createRuntime(readyHandshake(), {
      executablePath: '/opt/bin/pi',
      noSession: true,
      model: 'openai-codex/gpt-5.4',
      thinkingLevel: 'high'
    })

    await runtime.start()
    const args = spawnProcess.mock.calls[0]![1] as string[]
    expect(args).toEqual([
      '--mode', 'rpc',
      '--no-session',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--no-context-files',
      '--extension', adapterPath,
      '--no-approve',
      '--provider', 'openai-codex',
      '--model', 'gpt-5.4',
      '--thinking', 'high'
    ])
    expect(args).not.toContain('--no-builtin-tools')
  })

  it('discovers Pi models and thinking levels over RPC', async() => {
    const { runtime } = createRuntime()
    await runtime.start()

    await expect(runtime.getAvailableModels()).resolves.toEqual([
      { provider: 'test', id: 'model', name: 'Test model' },
      { provider: 'test', id: 'second' }
    ])
    await expect(runtime.getAvailableThinkingLevels()).resolves.toEqual(['off', 'high', 'xhigh'])
  })

  it('fails closed when the adapter does not own mutation tools', async() => {
    const { runtime } = createRuntime(readyHandshake({
      toolOwners: {
        read: 'annotamd-pi-adapter/v1',
        edit: 'another-extension',
        write: 'annotamd-pi-adapter/v1'
      }
    }))

    await expect(runtime.start()).rejects.toBeInstanceOf(PiRpcCompatibilityError)
  })

  it('fails closed when Pi resolves a required tool from another extension', async() => {
    const { runtime } = createRuntime(readyHandshake({
      tools: {
        read: { sourceInfo: { path: adapterPath } },
        edit: { sourceInfo: { path: '/tmp/overriding-extension.mjs' } },
        write: { sourceInfo: { path: adapterPath } }
      }
    }))

    await expect(runtime.start()).rejects.toThrow(
      'Pi resolved edit from a different extension than the AnnotaMD adapter.'
    )
  })

  it('fails closed when a required adapter tool is not active', async() => {
    const { runtime } = createRuntime(readyHandshake({
      activeTools: ['read', 'write']
    }))

    await expect(runtime.start()).rejects.toThrow(
      'Pi did not activate required AnnotaMD tools: edit.'
    )
  })

  it('sends prompts and preserves extension request ids in responses', async() => {
    const { runtime, process, commands } = createRuntime()
    await runtime.start()
    const extensionMessages: unknown[] = []
    runtime.onMessage(message => extensionMessages.push(message))

    process.stdout.write(`${JSON.stringify({
      type: 'extension_ui_request',
      id: 'extension-request-1',
      method: 'input',
      title: 'annotamd.bridge.v1',
      placeholder: encodePiBridgeEnvelope({ v: 1, kind: 'snapshot' })
    })}\n`)
    runtime.respondToExtension('extension-request-1', {
      value: encodePiBridgeEnvelope({ v: 1, kind: 'snapshot', handled: false })
    })
    await runtime.prompt('Review this document')

    expect(extensionMessages).toEqual([expect.objectContaining({
      type: 'extension_ui_request',
      id: 'extension-request-1'
    })])
    expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'extension_ui_response', id: 'extension-request-1' }),
      expect.objectContaining({ type: 'prompt', message: 'Review this document' })
    ]))
  })

  it('round-trips the versioned bridge envelope', () => {
    const envelope = {
      v: 1,
      kind: 'proposal',
      content: 'line one\nline two line three'
    }
    expect(decodePiBridgeEnvelope(encodePiBridgeEnvelope(envelope))).toEqual(envelope)
    expect(() => decodePiBridgeEnvelope('plain text')).toThrow(PiRpcCompatibilityError)
  })
})
