interface SseRecord {
  event?: string
  data: string
}

export class SseDecoder {
  private buffer = ''

  push(chunk: string): SseRecord[] {
    this.buffer += chunk.replace(/\r\n/g, '\n')
    const records: SseRecord[] = []
    let boundary = this.buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary)
      this.buffer = this.buffer.slice(boundary + 2)
      const record = this.parse(block)
      if (record) records.push(record)
      boundary = this.buffer.indexOf('\n\n')
    }
    return records
  }

  finish(): SseRecord[] {
    const record = this.parse(this.buffer)
    this.buffer = ''
    return record ? [record] : []
  }

  private parse(block: string): SseRecord | undefined {
    if (!block.trim()) return undefined
    let event: string | undefined
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (!data.length) return undefined
    return { event, data: data.join('\n') }
  }
}

export const readSse = async(
  response: Response,
  onRecord: (event: string | undefined, data: string) => void
): Promise<void> => {
  if (!response.body) throw new Error('Streaming response has no body.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const sse = new SseDecoder()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      for (const record of sse.push(decoder.decode(value, { stream: true }))) {
        onRecord(record.event, record.data)
      }
    }
    for (const record of sse.push(decoder.decode())) onRecord(record.event, record.data)
    for (const record of sse.finish()) onRecord(record.event, record.data)
  } finally {
    reader.releaseLock()
  }
}
