import { describe, expect, it } from 'vitest'
import { imageDataUrlToFile } from '@/util/fileSystem'

describe('clipboard data URL persistence', () => {
  it.each(['png', 'jpeg', 'webp'])('decodes image/%s to a binary file before applying insert preferences', async(type) => {
    const file = await imageDataUrlToFile(`data:image/${type};base64,AQID`)
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe(`image/${type}`)
    expect(file.name).toMatch(new RegExp(`^pasted-image-[\\da-f-]+\\.${type}$`))
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('preserves SVG bytes and uses the SVG extension', async() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    const file = await imageDataUrlToFile(`data:image/svg+xml,${encodeURIComponent(svg)}`)
    expect(file.name).toMatch(/^pasted-image-[\da-f-]+\.svg$/)
    expect(file.type).toBe('image/svg+xml')
    expect(await file.text()).toBe(svg)
  })

  it('gives rapid consecutive pastes distinct names so one image cannot overwrite another', () => {
    const src = 'data:image/png;base64,AQID'
    expect(imageDataUrlToFile(src).name).not.toBe(imageDataUrlToFile(src).name)
  })
})
