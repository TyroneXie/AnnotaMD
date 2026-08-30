import { marked, type Tokens } from 'marked'
import { sanitize } from '@/util/dompurify'

export type AgentMarkdownPart =
  | { type: 'html'; html: string }
  | { type: 'code'; code: string; language: string }

const AGENT_MARKDOWN_SANITIZE_OPTIONS = Object.freeze({
  ALLOW_DATA_ATTR: false,
  FORBID_ATTR: ['style', 'contenteditable', 'target'],
  FORBID_TAGS: [
    'base',
    'button',
    'embed',
    'form',
    'iframe',
    'input',
    'link',
    'meta',
    'object',
    'option',
    'select',
    'style',
    'textarea'
  ],
  USE_PROFILES: { html: true },
  RETURN_TRUSTED_TYPE: false
})

const renderHtml = (source: string): string => {
  const rendered = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true
  })
  return sanitize(String(rendered), AGENT_MARKDOWN_SANITIZE_OPTIONS)
}

/**
 * Keep fenced code as Vue-owned DOM so its copy action never relies on event
 * handlers injected through Markdown HTML. Every other block is rendered by
 * Marked and sanitized before it reaches `v-html`.
 */
export const renderAgentMarkdown = (source: string): AgentMarkdownPart[] => {
  if (!source) return []

  const parts: AgentMarkdownPart[] = []
  let markdown = ''

  const flushMarkdown = (): void => {
    if (!markdown) return
    const html = renderHtml(markdown)
    if (html) parts.push({ type: 'html', html })
    markdown = ''
  }

  for (const token of marked.lexer(source, { gfm: true })) {
    if (token.type !== 'code') {
      markdown += token.raw
      continue
    }

    flushMarkdown()
    const code = token as Tokens.Code
    parts.push({
      type: 'code',
      code: code.text,
      language: code.lang?.trim().split(/\s+/, 1)[0] || 'text'
    })
  }

  flushMarkdown()
  return parts
}
