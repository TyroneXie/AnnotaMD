// @vitest-environment node

import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PiJsonlTransport,
  PiJsonlTransportError,
  type PiJsonlTransportOptions
} from '../../../src/main/piWorkspace/PiJsonlTransport'

interface TransportFixture {
  stdout: PassThrough
  stdin: PassThrough
  transport: PiJsonlTransport
  writtenRecords: () => Array<Record<string, unknown>>
  writtenText: () => string
}

const transports: PiJsonlTransport[] = []

const createFixture = (
  options: Partial<Omit<PiJsonlTransportOptions, 'readable' | 'writable'>> = {}
): TransportFixture => {
  const stdout = new PassThrough()
  const stdin = new PassThrough()
  const written: Buffer[] = []
  stdin.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))
  const transport = new PiJsonlTransport({
    readable: stdout,
    writable: stdin,
    ...options
  })
  transports.push(transport)

  const writtenText = (): string => Buffer.concat(written).toString('utf8')
  return {
    stdout,
    stdin,
    transport,
    writtenText,
    writtenRecords: () => writtenText()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
  }
}

afterEach(() => {
  for (const transport of transports.splice(0)) transport.dispose()
})

describe('Pi JSONL transport', () => {
  it('splits Buffer input on LF only and ignores empty LF/CRLF records', () => {
    const { stdout, transport } = createFixture()
    const messages: unknown[] = []
    transport.onMessage((message) => messages.push(message))
    const expected = {
      type: 'agent-event',
      text: 'before\u2028middle\u2029after\rinside'
    }
    const payload = Buffer.from(`\n\r\n${JSON.stringify(expected)}\r\n`)
    const unicodeStart = payload.indexOf(Buffer.from('\u2028'))

    stdout.write(payload.subarray(0, unicodeStart + 1))
    stdout.write(payload.subarray(unicodeStart + 1, unicodeStart + 2))
    stdout.write(payload.subarray(unicodeStart + 2))

    expect(messages).toEqual([expected])
  })

  it('reports malformed JSON explicitly and rejects in-flight requests', async() => {
    const { stdout, transport } = createFixture()
    const errors: PiJsonlTransportError[] = []
    transport.onError((error) => errors.push(error))
    const pending = transport.request({ type: 'get_state' })
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'invalid-json'
    })

    stdout.write(Buffer.from('{"type":invalid}\n'))

    await rejected
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(PiJsonlTransportError)
    expect(errors[0]?.code).toBe('invalid-json')
    expect(transport.isClosed).toBe(true)
  })

  it('fails a record as soon as it exceeds the configured line limit', () => {
    const { stdout, transport } = createFixture({
      maxLineBytes: 12,
      maxOutputBytes: 100
    })
    const errors: PiJsonlTransportError[] = []
    transport.onError((error) => errors.push(error))

    stdout.write(Buffer.from('{"payload":"too-long"}'))

    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('line-output-limit')
    expect(transport.isClosed).toBe(true)
  })

  it('counts cumulative raw output bytes across otherwise valid records', () => {
    const { stdout, transport } = createFixture({
      maxLineBytes: 64,
      maxOutputBytes: 18
    })
    const messages: unknown[] = []
    const errors: PiJsonlTransportError[] = []
    transport.onMessage((message) => messages.push(message))
    transport.onError((error) => errors.push(error))

    stdout.write(Buffer.from('{"a":1}\n'))
    stdout.write(Buffer.from('{"b":2}\n'))
    stdout.write(Buffer.from('{"c":3}\n'))

    expect(messages).toEqual([{ a: 1 }, { b: 2 }])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('total-output-limit')
  })

  it('adds unique request ids and correlates reverse-order responses', async() => {
    const { stdout, transport, writtenRecords, writtenText } = createFixture()
    const events: unknown[] = []
    transport.onMessage((message) => events.push(message))

    const first = transport.request<{ value: string }>({
      id: 'caller-controlled-id',
      type: 'prompt',
      message: 'one\u2028two'
    })
    const second = transport.request<{ value: string }>({ type: 'get_state' })
    const [firstCommand, secondCommand] = writtenRecords()

    expect(firstCommand?.id).toBeTypeOf('string')
    expect(firstCommand?.id).not.toBe('caller-controlled-id')
    expect(secondCommand?.id).toBeTypeOf('string')
    expect(firstCommand?.id).not.toBe(secondCommand?.id)
    expect(writtenText()).toContain('one\u2028two')
    expect(writtenText().endsWith('\n')).toBe(true)

    stdout.write(Buffer.from(`${JSON.stringify({
      type: 'response',
      id: 'unknown-id',
      value: 'not-correlated'
    })}\n`))
    stdout.write(Buffer.from(`${JSON.stringify({
      type: 'response',
      id: secondCommand?.id,
      value: 'second'
    })}\r\n`))
    stdout.write(Buffer.from(`${JSON.stringify({
      type: 'response',
      id: firstCommand?.id,
      value: 'first'
    })}\n`))

    await expect(first).resolves.toMatchObject({ value: 'first' })
    await expect(second).resolves.toMatchObject({ value: 'second' })
    expect(events).toEqual([{
      type: 'response',
      id: 'unknown-id',
      value: 'not-correlated'
    }])
  })

  it('sends uncorrelated extension UI responses with their original id', () => {
    const { transport, writtenRecords, writtenText } = createFixture()

    transport.send({
      type: 'extension_ui_response',
      id: 'extension-ui-1',
      value: 'keep\u2029separator'
    })

    expect(writtenRecords()).toEqual([{
      type: 'extension_ui_response',
      id: 'extension-ui-1',
      value: 'keep\u2029separator'
    }])
    expect(writtenText()).toContain('keep\u2029separator')
    expect(transport.pendingRequestCount).toBe(0)
  })

  it('emits an unterminated final record before closing the stream', async() => {
    const { stdout, transport } = createFixture()
    const messages: unknown[] = []
    transport.onMessage((message) => messages.push(message))
    const ended = new Promise<void>((resolve) => stdout.once('end', resolve))

    stdout.end(Buffer.from('{"type":"last"}'))
    await ended

    expect(messages).toEqual([{ type: 'last' }])
    expect(transport.isClosed).toBe(true)
  })

  it.each([
    ['close', (transport: PiJsonlTransport) => transport.close()],
    ['dispose', (transport: PiJsonlTransport) => transport.dispose()]
  ])('rejects every pending request on %s', async(_label, finish) => {
    const { transport } = createFixture()
    const first = transport.request({ type: 'get_state' })
    const second = transport.request({ type: 'get_commands' })
    const firstRejected = expect(first).rejects.toMatchObject({ code: 'closed' })
    const secondRejected = expect(second).rejects.toMatchObject({ code: 'closed' })

    finish(transport)

    await firstRejected
    await secondRejected
    expect(transport.pendingRequestCount).toBe(0)
    await expect(transport.request({ type: 'get_state' })).rejects.toMatchObject({
      code: 'closed'
    })
  })
})
