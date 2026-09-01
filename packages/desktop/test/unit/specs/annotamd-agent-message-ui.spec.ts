import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAgentMarkdown } from '../../../src/renderer/src/components/agent/agentMarkdown'
import { isAgentTimelineNearBottom } from '../../../src/renderer/src/components/agent/agentTimelineScroll'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('Agent message presentation', () => {
  it('persists an independently adjustable Agent text size with a smaller default', () => {
    const schema = read('packages/desktop/src/main/preferences/schema.json')
    const defaults = read('packages/desktop/static/preference.json')
    const store = read('packages/desktop/src/renderer/src/store/preferences.ts')
    const preference = read(
      'packages/desktop/src/renderer/src/prefComponents/agent/index.vue'
    )
    const workspace = read(
      'packages/desktop/src/renderer/src/components/agent/AgentWorkspacePanel.vue'
    )
    const timeline = read(
      'packages/desktop/src/renderer/src/components/agent/AgentMessageTimeline.vue'
    )

    expect(schema).toMatch(
      /"agentFontSize"\s*:\s*\{[^}]*"maximum"\s*:\s*18[^}]*"minimum"\s*:\s*10[^}]*"default"\s*:\s*12/s
    )
    expect(defaults).toMatch(/"agentFontSize"\s*:\s*12/)
    expect(store).toMatch(/agentFontSize:\s*number/)
    expect(store).toMatch(/agentFontSize:\s*12/)
    expect(preference).toContain(':value="agentFontSize"')
    expect(preference).toContain("onSelectChange('agentFontSize', value)")
    expect(preference).toContain(':min="10"')
    expect(preference).toContain(':max="18"')
    expect(workspace).toContain(':style="agentWorkspaceStyle"')
    expect(workspace).toContain("'--annotamd-agent-font-size': `${agentFontSize.value}px`")
    expect(timeline).toMatch(
      /\.annotamd-agent-message-content\s*\{[^}]*font-size:\s*var\(--annotamd-agent-font-size,\s*12px\);/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-process-note-content\s*\{[^}]*font-size:\s*clamp\(9px,\s*calc\(var\(--annotamd-agent-font-size,\s*12px\)\s*-\s*2px\),\s*16px\);/s
    )
  })

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
    expect(timeline).toContain("message.role === 'assistant' && message.status !== 'failed'")
    expect(timeline).toContain('entry.message.content.trim().length > 0')
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

  it('uses one completed-process disclosure with a flat internal timeline', () => {
    const timeline = read(
      'packages/desktop/src/renderer/src/components/agent/AgentMessageTimeline.vue'
    )
    expect(timeline).toContain('data-testid="ai-process-group"')
    expect(timeline).toContain('data-testid="ai-process-group-toggle"')
    expect(timeline).toContain('data-testid="ai-process-group-body"')
    expect(timeline).toContain('data-testid="ai-process-message"')
    expect(timeline).toContain('data-testid="ai-tool-list"')
    expect(timeline).toContain('data-testid="ai-tool-message"')
    expect(timeline).not.toContain('data-testid="ai-tool-group"')
    expect(timeline).not.toContain('data-testid="ai-tool-group-viewport"')
    expect(timeline).not.toContain('data-testid="ai-tool-details"')
    expect(timeline).toContain("entry.type === 'process-group'")
    expect(timeline).toContain("item.type === 'activity'")
    expect(timeline).toContain("type: 'process'")
    expect(timeline).toContain('AI_REASONING_MESSAGE_TOOL')
    expect(timeline).toContain('AI_RUN_SUMMARY_TOOL')
    expect(timeline).toContain('missingFinalAnswer')
    expect(timeline).toContain('toolActivityDuration')
    expect(timeline).toContain('runError(entry.summary)')
    expect(timeline).toContain('v-if="entry.missingFinal"')
    expect(timeline).toContain(':aria-label="processLabel(item.message)"')
    expect(timeline).not.toContain('annotamd-agent-process-note-header')
    expect(timeline).toContain('flushToolGroup()')
    expect(timeline).toContain('processItems.push')
    expect(timeline).toContain('processGroupExpansionOverrides.value.get(entry.id)')
    expect(timeline).toContain("entry.running || runStatus(entry) === 'failed'")
    expect(timeline).toContain('@click="toggleProcessGroup(entry)"')
    expect(timeline).toContain('v-if="processGroupExpanded(entry) && entry.items.length"')
    expect(timeline).toContain("t('annotamd.agentWorkspace.toolActivityComplete')")
    expect(timeline).toContain('v-for="activity in item.messages"')
    expect(timeline).not.toContain('toolGroupExpanded(')
    expect(timeline).not.toContain('toolExpanded(')
    expect(timeline).not.toContain('toggleToolGroup')
    expect(timeline).not.toContain('toggleTool(')
    expect(timeline).toMatch(
      /\.annotamd-agent-process-group-toggle\s*\{[^}]*min-height:\s*30px;[^}]*align-items:\s*baseline;/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-process-group-body\s*\{[^}]*gap:\s*7px;[^}]*margin:\s*3px 4px 6px 24px;/s
    )
    expect(timeline).not.toMatch(/\.annotamd-agent-process-group-body\s*\{[^}]*border-left:/s)
    expect(timeline).toMatch(
      /\.annotamd-agent-process-note\s*\{[^}]*padding:\s*1px 0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-process-note-content\s*\{[^}]*font-size:\s*clamp\(9px,\s*calc\(var\(--annotamd-agent-font-size,\s*12px\)\s*-\s*2px\),\s*16px\);[^}]*line-height:\s*1\.55;/s
    )
    expect(timeline).toMatch(
      /\.annotamd-agent-tool-line\s*\{[^}]*min-height:\s*24px;[^}]*align-items:\s*center;/s
    )
    expect(timeline).toContain(
      '.annotamd-agent-process-group-toggle > .annotamd-agent-tool-state { align-self: baseline; }'
    )
    expect(timeline).toContain("activity.message.status === 'streaming'")
    expect(timeline).toContain("activity.message.status === 'complete'")
    expect(timeline).toContain("activity.message.status === 'failed'")
    expect(timeline).toContain('toolDisplayName(activity.message.toolName)')
    expect(timeline).toContain("return t('annotamd.agentWorkspace.toolActivityComplete')")
    expect(timeline).toContain("message.toolName === AI_REASONING_MESSAGE_TOOL")
    expect(timeline).toContain("activity.message.status === 'failed' && activity.message.content")
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
