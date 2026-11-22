import type { AiAttachment } from '@shared/types/aiWorkspace'

const AI_IMAGE_ATTACHMENT_COUNT_MAX = 4
const AI_IMAGE_ATTACHMENT_BYTES_MAX = 5 * 1024 * 1024
const AI_IMAGE_ATTACHMENTS_TOTAL_BYTES_MAX = 12 * 1024 * 1024
const AI_TEXT_ATTACHMENT_COUNT_MAX = 8
const AI_TEXT_ATTACHMENT_CHARACTERS_MAX = 12_000
const AI_TEXT_ATTACHMENTS_TOTAL_CHARACTERS_MAX = 32_000
const AI_IMAGE_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
])

const safeAttachmentName = (value: string): string => {
  const name = value.trim().split(/[\\/]/).pop()?.trim() ?? ''
  if (!name || name.length > 180) throw new Error('Attachment name is invalid.')
  return name
}

export const normalizeAttachments = (items: readonly AiAttachment[] | undefined): AiAttachment[] => {
  if (!items?.length) return []
  const images = items.filter(item => item.kind === 'image')
  const texts = items.filter(item => item.kind === 'text')
  if (images.length > AI_IMAGE_ATTACHMENT_COUNT_MAX) {
    throw new Error(`A maximum of ${AI_IMAGE_ATTACHMENT_COUNT_MAX} images can be attached.`)
  }
  if (texts.length > AI_TEXT_ATTACHMENT_COUNT_MAX) {
    throw new Error(`A maximum of ${AI_TEXT_ATTACHMENT_COUNT_MAX} text files can be attached.`)
  }

  let imageBytes = 0
  let textCharacters = 0
  return items.map((item) => {
    const name = safeAttachmentName(item.name)
    if (item.kind === 'text') {
      if (typeof item.content !== 'string' || item.content.length > AI_TEXT_ATTACHMENT_CHARACTERS_MAX) {
        throw new Error(`Text attachment ${name} exceeds ${AI_TEXT_ATTACHMENT_CHARACTERS_MAX} characters.`)
      }
      textCharacters += item.content.length
      if (textCharacters > AI_TEXT_ATTACHMENTS_TOTAL_CHARACTERS_MAX) {
        throw new Error(`Text attachments exceed ${AI_TEXT_ATTACHMENTS_TOTAL_CHARACTERS_MAX} characters.`)
      }
      return { kind: 'text', name, content: item.content, truncated: Boolean(item.truncated) }
    }

    if (!AI_IMAGE_MEDIA_TYPES.has(item.mediaType)) {
      throw new Error(`Unsupported image type: ${item.mediaType}`)
    }
    const data = item.data.replace(/\s+/g, '')
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new Error(`Image attachment ${name} is not valid base64 data.`)
    }
    const bytes = Buffer.from(data, 'base64')
    if (bytes.length !== item.sizeBytes || bytes.length > AI_IMAGE_ATTACHMENT_BYTES_MAX) {
      throw new Error(`Image attachment ${name} exceeds the supported size limit.`)
    }
    imageBytes += bytes.length
    if (imageBytes > AI_IMAGE_ATTACHMENTS_TOTAL_BYTES_MAX) {
      throw new Error('Image attachments exceed the 12 MB total size limit.')
    }
    return { kind: 'image', name, mediaType: item.mediaType, data, sizeBytes: bytes.length }
  })
}
