const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
}

const decodeHtmlEntities = (value: string): string => value.replace(
  /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
  (_match, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? _match
    const hex = entity[1]?.toLowerCase() === 'x'
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match
  }
)

const readAttribute = (tag: string, name: string): string => {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
}

const normalizeTitle = (value: string): string => decodeHtmlEntities(value)
  .replace(/<[^>]*>/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const normalizeUrlLikeTitle = (value: string): string => {
  try {
    return decodeURIComponent(value)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
      .trim()
      .toLowerCase()
  } catch {
    return value
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
      .trim()
      .toLowerCase()
  }
}

export const isUsablePageTitle = (value: string, rawUrl: string): boolean => {
  const title = normalizeTitle(value)
  if (!title || /^(?:untitled|无标题)$/i.test(title)) return false
  try {
    const url = new URL(rawUrl)
    const normalizedTitle = normalizeUrlLikeTitle(title)
    const normalizedHost = url.hostname.replace(/^www\./i, '').toLowerCase()
    return normalizedTitle !== normalizeUrlLikeTitle(rawUrl)
      && normalizedTitle !== normalizedHost
      && !normalizedTitle.startsWith(`${normalizedHost}/`)
  } catch {
    return true
  }
}

export const getPageTitleFallback = (rawUrl: string): string => {
  try {
    const url = new URL(rawUrl)
    if (!/^(?:www\.)?msn\.cn$/i.test(url.hostname)) return ''
    const segments = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment))
    const articleIdIndex = segments.findIndex(segment => /^ar-[a-z0-9]+$/i.test(segment))
    return articleIdIndex > 0 ? segments[articleIdIndex - 1] : ''
  } catch {
    return ''
  }
}

export interface PageMetadata {
  title: string
  icon: string
}

export interface PageMetadataFallbackRequest {
  url: string
  userAgent: string
}

const MOBILE_SAFARI_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'

export const getPageMetadataFallbackRequest = (rawUrl: string): PageMetadataFallbackRequest | undefined => {
  try {
    const url = new URL(rawUrl)
    if (!/^(?:www\.)?toutiao\.com$/i.test(url.hostname)) return undefined
    if (!/^\/article\/\d+\/?$/.test(url.pathname)) return undefined
    url.hostname = 'm.toutiao.com'
    url.search = ''
    url.hash = ''
    return { url: url.toString(), userAgent: MOBILE_SAFARI_USER_AGENT }
  } catch {
    return undefined
  }
}

const resolveMetadataUrl = (value: string, baseUrl: string): string => {
  if (!value || !baseUrl) return ''
  try {
    const url = new URL(decodeHtmlEntities(value), baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:'
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

export const extractPageMetadata = (html: string, baseUrl = ''): PageMetadata => {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const preferredMetaNames = [
    'og:title',
    'twitter:title',
    'application-name',
    'apple-mobile-web-app-title'
  ]
  const metadata = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    const name = (readAttribute(tag, 'property') || readAttribute(tag, 'name')).toLowerCase()
    const content = readAttribute(tag, 'content')
    if (name && content) metadata.set(name, normalizeTitle(content))
  }

  let resolvedTitle = title ? normalizeTitle(title) : ''
  if (!resolvedTitle) {
    for (const name of preferredMetaNames) {
      const value = metadata.get(name)
      if (value) {
        resolvedTitle = value
        break
      }
    }
  }

  let icon = ''
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = readAttribute(tag, 'rel').toLowerCase()
    if (!/(?:^|\s)(?:shortcut\s+icon|icon|apple-touch-icon)(?:\s|$)/.test(rel)) continue
    icon = resolveMetadataUrl(readAttribute(tag, 'href'), baseUrl)
    if (icon) break
  }

  return { title: resolvedTitle, icon }
}

export const extractPageTitle = (html: string): string => extractPageMetadata(html).title
