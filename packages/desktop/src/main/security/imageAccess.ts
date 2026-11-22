import fs from 'node:fs/promises'

// A markdown image reference may authorize only that image, not its directory
// or arbitrary files renamed with an image extension.
export async function hasImageHeader(pathname: string): Promise<boolean> {
  const file = await fs.open(pathname, 'r')
  try {
    const buffer = Buffer.alloc(4096)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    const bytes = buffer.subarray(0, bytesRead)
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
      /^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii')) ||
      (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') ||
      /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(bytes.toString('utf8').replace(/^\uFEFF/, ''))
  } finally {
    await file.close()
  }
}
