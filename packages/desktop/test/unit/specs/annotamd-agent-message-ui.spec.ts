import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAgentMarkdown } from '../../../src/renderer/src/components/agent/agentMarkdown'
import { isAgentTimelineNearBottom } from '../../../src/renderer/src/components/agent/agentTimelineScroll'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('Agent message presentation', () => {
  it('renders Markdown while keeping fenced code in a separately copyable part', () => {
    const source = [
      'A **bold** answer.',
      '',
      '```ts',
      'const answer = 42',
      '```',
      '',
      '- one'
    ].join('\n')

    expect(renderAgentMarkdown(source)).toEqual([
      { type: 'html', html: '<p>A <strong>bold</strong> answer.</p>\n' },
      { type: 'code', code: 'const answer = 42', language: 'ts' },
      { type: 'html', html: '<ul>\n<li>one</li>\n</ul>\n' }
    ])
  })

  it('sanitizes model-provided HTML and unsafe links before rendering it', () => {
    const [part] = renderAgentMarkdown(
      '<img src="x" onerror="alert(1)"><script>alert(2)</script>' +
      '<form><button>Run</button></form>[bad](javascript:alert(3))'
    )
    expect(part.type).toBe('html')
    if (part.type !== 'html') return
    expect(part.html).not.toMatch(/onerror|script|form|button|javascript:/i)
  })

  it('exposes message and code copy actions through Vue-owned Element Plus icons', () => {
    const timeline = read(
      'packages/desktop/src/renderer/src/components/agent/AgentMessageTimeline.vue'
    )
    expect(timeline).toContain('data-testid="ai-copy-message"')
    expect(timeline).toContain('data-testid="ai-copy-code"')
    expect(timeline).toContain('CopyDocument,')
    expect(timeline).toContain('renderAgentMarkdown(message.content)')
    expect(timeline).toContain("message.role === 'assistant' && message.status === 'streaming'")
    expect(timeline).toContain('message.content.trim().length > 0')
  })

  it('uses compact opposing bubbles without visible role-label rows', () => {
    const timeline = read(
      'packages/desktop/src/renderer/src/components/agent/AgentMessageTimeline.vue'
    )
    expect(timeline).toContain('formatMessageTime(entry.message.createdAt)')
    expect(timeline).toContain(':aria-label="roleLabel(entry.message.role)"')
    expect(timeline).not.toContain('<span>{{ roleLabel(entry.message.role) }}</span>')
    expect(timeline).toMatch(
      /\.annotamd-agent-message\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*92%;[^}]*align-self:\s*flex-start;/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-message\.is-user\s*\{[^}]*max-width:\s*82%;[^}]*align-self:\s*flex-end;/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-message-bubble\s*\{[^}]*border:\s*1px solid var\(--annotamd-border\);[^}]*border-radius:\s*10px;/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-message\.is-user \.annotamd-agent-message-bubble\s*\{[^}]*var\(--annotamd-green\)[^}]*background:\s*color-mix\(in srgb, var\(--annotamd-green\) 10%, var\(--annotamd-surface\)\);/s
    )
    expect(timeline).toMatch(/\.annotamd-agent-message-meta\s*\{[^}]*justify-content:\s*flex-end;/s)
  })

  it('shows persisted tool messages as compact expandable status rows', () => {
    const timeline = read(
      'packages/desktop/src/renderer/src/components/agent/AgentMessageTimeline.vue'
    )
    expect(timeline).toContain('data-testid="ai-tool-message"')
    expect(timeline).toContain('data-testid="ai-tool-details"')
    expect(timeline).toContain("entry.message.status === 'streaming'")
    expect(timeline).toContain("entry.message.status === 'complete'")
    expect(timeline).toContain("entry.message.status === 'failed'")
    expect(timeline).toContain('entry.message.toolName')
  })
})

describe('Agent composer IME handling', () => {
  it('does not submit an unfinished composition and preserves Shift+Enter', () => {
    const composer = read('packages/desktop/src/renderer/src/components/agent/AgentComposer.vue')
    expect(composer).toContain('@compositionstart="composing = true"')
    expect(composer).toContain('@compositionend="composing = false"')
    expect(composer).toContain('event.shiftKey')
    expect(composer).toContain('event.isComposing')
    expect(composer).toContain('event.keyCode === 229')
    expect(composer).toMatch(/event\.preventDefault\(\)\s+emit\('send'\)/)
  })
})

describe('Agent timeline follow behavior', () => {
  it('follows updates only while the reader is near the bottom', () => {
    expect(isAgentTimelineNearBottom({ scrollHeight: 1000, scrollTop: 452, clientHeight: 500 }))
      .toBe(true)
    expect(isAgentTimelineNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 500 }))
      .toBe(false)
  })

  it('checks the old layout before waiting for the updated DOM', () => {
    const panel = read(
      'packages/desktop/src/renderer/src/components/agent/AgentWorkspacePanel.vue'
    )
    expect(panel).toMatch(
      /const shouldFollow = activeId !== previousActiveId \|\| !timeline\.value \|\|\s+isAgentTimelineNearBottom\(timeline\.value\)\s+await nextTick\(\)/
    )
    expect(panel).toContain('if (shouldFollow && timeline.value)')
    expect(panel).toContain('conversations.changeSets.map')
  })
})
