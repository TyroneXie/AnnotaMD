import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getIconData } from '@iconify/utils'

const require = createRequire(import.meta.url)

const THEMES = [
  { name: 'tabler', label: 'Tabler', collection: 'tabler' },
  { name: 'lucide', label: 'Lucide', collection: 'lucide' },
  { name: 'phosphor', label: 'Phosphor', collection: 'ph' },
  { name: 'remix', label: 'Remix Icon', collection: 'ri' },
  { name: 'material', label: 'Material Symbols', collection: 'material-symbols' },
  { name: 'hugeicons', label: 'Hugeicons', collection: 'hugeicons' },
  { name: 'mdi', label: 'Material Design Icons', collection: 'mdi' },
  { name: 'bootstrap', label: 'Bootstrap Icons', collection: 'bi' }
]

const ICON_CANDIDATES = {
  'text-style': ['text-size', 'typography', 'text', 'format-size', 'type'],
  strong: ['bold', 'text-bold', 'format-bold', 'type-bold'],
  strikethrough: ['strikethrough', 'text-strikethrough', 'format-strikethrough', 'type-strikethrough'],
  italic: ['italic', 'text-italic', 'format-italic', 'type-italic'],
  underline: ['underline', 'text-underline', 'format-underlined', 'type-underline'],
  link: ['link', 'link-2', 'chain'],
  unlink: ['unlink', 'link-off', 'link-break', 'chain-broken'],
  'inline-code': ['code-xml', 'code-2', 'code', 'brackets-angle', 'code-slash'],
  color: ['highlighter', 'text-color', 'format-color-text', 'palette', 'paint-brush'],
  comment: ['message-square', 'message', 'comment', 'chat', 'chat-square'],
  delete: ['trash-2', 'trash', 'delete', 'bin'],
  'move-up': ['arrow-up'],
  'move-down': ['arrow-down'],
  'move-left': ['arrow-left'],
  'move-right': ['arrow-right'],
  'insert-left': ['column-insert-left', 'layout-column-insert-left', 'arrow-bar-left', 'panel-left'],
  'insert-right': ['column-insert-right', 'layout-column-insert-right', 'arrow-bar-right', 'panel-right'],
  'insert-above': ['row-insert-top', 'layout-row-insert-top', 'arrow-bar-up', 'panel-top'],
  'insert-below': ['row-insert-bottom', 'layout-row-insert-bottom', 'arrow-bar-down', 'panel-bottom'],
  'align-left': ['align-left', 'format-align-left', 'text-align-left'],
  'align-center': ['align-center', 'format-align-center', 'text-align-center'],
  'align-right': ['align-right', 'format-align-right', 'text-align-right'],
  'reset-width': ['arrows-horizontal', 'arrow-left-right', 'width', 'horizontal-distribute-center'],
  edit: ['pencil', 'edit-3', 'edit', 'pen'],
  more: ['dots', 'ellipsis', 'more-horizontal', 'three-dots'],
  'copy-link': ['link', 'copy-link', 'link-2'],
  'web-link': ['world', 'globe-2', 'globe', 'language'],
  'inline-image': ['photo', 'image', 'image-square'],
  copy: ['copy', 'copies', 'content-copy'],
  wrap: ['text-wrap', 'wrap-text', 'format-text-wrapping-wrap'],
  'heading-link': ['link', 'link-2', 'chain'],
  'diagram-view': ['layout-dashboard', 'view-grid', 'grid-2x2', 'grid'],
  fullscreen: ['maximize', 'maximize-2', 'fullscreen'],
  palette: ['palette', 'color-palette'],
  download: ['download', 'download-2'],
  'link-view': ['link', 'link-2', 'chain'],
  'title-view': ['heading', 'text-title', 'title'],
  paragraph: ['pilcrow', 'paragraph', 'format-pilcrow'],
  'horizontal-line': ['separator-horizontal', 'horizontal-rule', 'minus', 'remove'],
  frontmatter: ['file-code', 'file-description', 'document-code', 'file-text'],
  table: ['table', 'table-2', 'grid-table'],
  math: ['math', 'sigma', 'function-square', 'function'],
  html: ['brand-html5', 'html', 'code-browser', 'web'],
  code: ['code', 'braces', 'code-2', 'code-block'],
  quote: ['quote', 'blockquote', 'format-quote', 'quotes'],
  highlight: ['highlighter', 'highlight', 'ink-highlighter'],
  emoji: ['mood-smile', 'smile', 'emoji', 'face-smile'],
  'ordered-list': ['list-numbers', 'list-ordered', 'format-list-numbered'],
  'bullet-list': ['list', 'list-bullets', 'format-list-bulleted', 'list-ul'],
  'task-list': ['list-checks', 'list-check', 'checklist', 'task-list'],
  chart: ['chart-bar', 'bar-chart-3', 'bar-chart', 'chart'],
  mermaid: ['hierarchy-2', 'workflow', 'flowchart', 'schema'],
  plantuml: ['hierarchy-3', 'network', 'account-tree', 'diagram-3'],
  flowchart: ['flowchart', 'workflow', 'account-tree', 'git-branch'],
  sequence: ['git-merge', 'workflow', 'route', 'timeline'],
  footnote: ['text-caption', 'subscript', 'asterisk', 'footprints'],
  'copy-plain-text': ['text', 'letter-t', 'type', 'text-t'],
  'copy-markdown': ['markdown', 'brand-markdown', 'file-type-md'],
  duplicate: ['copy', 'duplicate', 'copies'],
  cut: ['cut', 'scissors'],
  promote: ['arrow-up'],
  demote: ['arrow-down'],
  'heading-number-continue': ['list-start', 'corner-down-right', 'arrow-forward', 'arrow-right'],
  'heading-number-restart': ['list-restart', 'restore', 'arrow-counter-clockwise', 'arrow-counterclockwise', 'restart', 'history', 'repeat'],
  'heading-number-set': ['playlist-edit', 'list-numbers', 'list-ordered', 'format-list-numbered', 'left-to-right-list-number', 'list-ol']
}

const HEADING_NAMES = {
  tabler: ['h-1', 'h-2', 'h-3', 'h-4', 'h-5', 'h-6'],
  lucide: ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6'],
  phosphor: ['text-h-one', 'text-h-two', 'text-h-three', 'text-h-four', 'text-h-five', 'text-h-six'],
  remix: ['h-1', 'h-2', 'h-3', 'h-4', 'h-5', 'h-6'],
  material: ['format-h1', 'format-h2', 'format-h3', 'format-h4', 'format-h5', 'format-h6'],
  hugeicons: ['heading-01', 'heading-02', 'heading-03', 'heading-04', 'heading-05', 'heading-06'],
  mdi: ['format-header-1', 'format-header-2', 'format-header-3', 'format-header-4', 'format-header-5', 'format-header-6'],
  bootstrap: ['type-h1', 'type-h2', 'type-h3', 'type-h4', 'type-h5', 'type-h6']
}

const OVERRIDES = {
  tabler: {
    duplicate: 'copy-plus',
    promote: 'chevrons-up',
    demote: 'chevrons-down'
  },
  lucide: {
    html: 'code-xml',
    'copy-markdown': 'file-code',
    duplicate: 'copy-plus',
    promote: 'chevrons-up',
    demote: 'chevrons-down'
  },
  phosphor: {
    strong: 'text-b',
    strikethrough: 'text-strikethrough',
    italic: 'text-italic',
    underline: 'text-underline',
    paragraph: 'paragraph',
    more: 'dots-three',
    'insert-left': 'arrow-line-left',
    'insert-right': 'arrow-line-right',
    'insert-above': 'arrow-line-up',
    'insert-below': 'arrow-line-down',
    wrap: 'text-align-left',
    'diagram-view': 'squares-four',
    fullscreen: 'arrows-out',
    'title-view': 'text-h',
    html: 'file-html',
    emoji: 'smiley',
    mermaid: 'flow-arrow',
    'copy-markdown': 'markdown-logo',
    duplicate: 'file-plus',
    promote: 'caret-double-up',
    demote: 'caret-double-down'
  },
  remix: {
    strong: 'bold',
    strikethrough: 'strikethrough',
    italic: 'italic',
    underline: 'underline',
    more: 'more-2',
    paragraph: 'paragraph',
    'horizontal-line': 'separator',
    unlink: 'link-unlink',
    delete: 'delete-bin-line',
    'insert-left': 'insert-column-left',
    'insert-right': 'insert-column-right',
    'insert-above': 'insert-row-top',
    'insert-below': 'insert-row-bottom',
    copy: 'file-copy-line',
    html: 'html5-line',
    quote: 'double-quotes-l',
    highlight: 'mark-pen-line',
    emoji: 'emotion-happy-line',
    'bullet-list': 'list-unordered',
    mermaid: 'flow-chart',
    duplicate: 'file-add-line',
    promote: 'arrow-up-double-line',
    demote: 'arrow-down-double-line'
  },
  material: {
    strong: 'format-bold',
    strikethrough: 'format-strikethrough',
    italic: 'format-italic',
    underline: 'format-underlined',
    'align-left': 'format-align-left',
    'align-center': 'format-align-center',
    'align-right': 'format-align-right',
    paragraph: 'format-paragraph',
    'horizontal-line': 'horizontal-rule',
    'move-up': 'arrow-upward',
    'move-down': 'arrow-downward',
    'insert-left': 'arrow-left',
    'insert-right': 'arrow-right',
    'insert-above': 'add-row-above-outline',
    'insert-below': 'add-row-below-outline',
    more: 'more-horiz',
    'diagram-view': 'dashboard',
    frontmatter: 'description',
    emoji: 'mood',
    'copy-plain-text': 'text-fields',
    duplicate: 'library-add-outline',
    promote: 'keyboard-double-arrow-up-rounded',
    demote: 'keyboard-double-arrow-down-rounded'
  },
  hugeicons: {
    link: 'link-01',
    unlink: 'unlink-01',
    delete: 'delete-02',
    'move-up': 'arrow-up-01',
    'move-down': 'arrow-down-01',
    'move-left': 'arrow-left-01',
    'move-right': 'arrow-right-01',
    'insert-above': 'insert-row-up',
    'insert-below': 'insert-row-down',
    'inline-image': 'image-01',
    'heading-link': 'link-01',
    palette: 'paint-board',
    download: 'download-01',
    'link-view': 'link-01',
    html: 'html-5',
    'ordered-list': 'left-to-right-list-number',
    'bullet-list': 'left-to-right-list-bullet',
    'task-list': 'check-list',
    mermaid: 'flowchart-01',
    plantuml: 'hierarchy',
    'copy-markdown': 'file-code',
    cut: 'scissor-01',
    duplicate: 'copy-plus',
    promote: 'arrow-up-double',
    demote: 'arrow-down-double'
  },
  mdi: {
    strong: 'format-bold',
    strikethrough: 'format-strikethrough',
    italic: 'format-italic',
    underline: 'format-underline',
    paragraph: 'format-paragraph',
    more: 'dots-horizontal',
    'horizontal-line': 'minus',
    'insert-left': 'table-column-plus-before',
    'insert-right': 'table-column-plus-after',
    'insert-above': 'table-row-plus-before',
    'insert-below': 'table-row-plus-after',
    'title-view': 'format-title',
    quote: 'format-quote-open-outline',
    'task-list': 'format-list-checks',
    duplicate: 'content-duplicate',
    promote: 'chevron-double-up',
    demote: 'chevron-double-down'
  },
  bootstrap: {
    'text-style': 'type',
    strong: 'type-bold',
    strikethrough: 'type-strikethrough',
    italic: 'type-italic',
    underline: 'type-underline',
    paragraph: 'paragraph',
    'horizontal-line': 'hr',
    more: 'three-dots',
    'copy-markdown': 'markdown',
    unlink: 'link-45deg',
    'align-left': 'text-left',
    'align-right': 'text-right',
    'title-view': 'type-h1',
    math: 'calculator',
    html: 'filetype-html',
    emoji: 'emoji-smile',
    'ordered-list': 'list-ol',
    mermaid: 'diagram-3',
    flowchart: 'diagram-3',
    sequence: 'diagram-2',
    duplicate: 'file-earmark-plus',
    promote: 'chevron-double-up',
    demote: 'chevron-double-down'
  }
}

function variants(name) {
  return [name, `${name}-line`, `${name}-outline`, `${name}-outlined`, `outline-${name}`]
}

function findIcon(collection, theme, semantic) {
  const override = OVERRIDES[theme]?.[semantic]
  const candidates = override ? [override] : ICON_CANDIDATES[semantic]
  for (const candidate of candidates.flatMap(variants)) {
    if (getIconData(collection, candidate)) return candidate
  }
  return null
}

const generated = {}
const missing = []

for (const theme of THEMES) {
  const collection = require(`@iconify-json/${theme.collection}/icons.json`)
  const icons = {}
  for (const semantic of Object.keys(ICON_CANDIDATES)) {
    const name = findIcon(collection, theme.name, semantic)
    if (!name) {
      missing.push(`${theme.name}:${semantic}`)
      continue
    }
    const icon = getIconData(collection, name)
    icons[semantic] = {
      source: name,
      viewBox: `0 0 ${icon.width} ${icon.height}`,
      body: icon.body
    }
  }
  HEADING_NAMES[theme.name].forEach((name, index) => {
    const icon = getIconData(collection, name)
    if (!icon) {
      missing.push(`${theme.name}:heading-${index + 1}`)
      return
    }
    icons[`heading-${index + 1}`] = {
      source: name,
      viewBox: `0 0 ${icon.width} ${icon.height}`,
      body: icon.body
    }
  })
  generated[theme.name] = { label: theme.label, collection: theme.collection, icons }
}

if (missing.length) {
  console.error(`Missing official icon mappings:\n${missing.join('\n')}`)
  process.exitCode = 1
} else {
  const output =
    `// Generated by scripts/generateOfficialIconThemes.mjs. Do not edit by hand.\n` +
    `export interface OfficialIconGlyph { source: string; viewBox: string; body: string }\n` +
    `export interface OfficialIconTheme { label: string; collection: string; icons: Record<string, OfficialIconGlyph> }\n` +
    `export const OFFICIAL_ICON_THEMES: Record<string, OfficialIconTheme> = ${JSON.stringify(generated, null, 2)};\n`
  const target = resolve('packages/muya/src/ui/generatedOfficialIconThemes.ts')
  await writeFile(target, output)
  console.log(`Generated ${Object.keys(generated).length} complete official icon themes at ${target}`)
}
