import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import {
  buildClaudeTurnArgs,
  buildClaudeTurnPrompt,
  parseClaudeTurnOutput
} from '../../../src/main/agentTurns/ClaudeAgentTurnService'
import {
  DEFAULT_AGENT_PROMPT_TEMPLATE,
  LEGACY_AGENT_PROMPT_TEMPLATE,
  migrateAgentPromptTemplate
} from '../../../src/shared/types/agentTurns'
import type { AnnotaMDCommentRecord } from '../../../src/shared/types/comments'
import { cloneAgentSessions } from '../../../src/renderer/src/store/agentTurns'

const comment: AnnotaMDCommentRecord = {
  id: 'comment-1',
  filePath: '/documents/test.md',
  scope: 'selection',
  quote: '需要解释的原文',
  exactQuote: '需要解释的原文',
  body: '先看看这里',
  resolved: false,
  createdAt: 1,
  updatedAt: 2,
  replies: [{ id: 'reply-1', body: '请解释这一段', author: 'user', createdAt: 2 }]
}

describe('AnnotaMD Claude Code comment turns', () => {
  it('creates a persistent session first and resumes the same session later', () => {
    expect(buildClaudeTurnArgs([
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'auto'
    ], 'session-1', false)).toEqual([
      '-p',
      '--output-format', 'stream-json',
      '--permission-mode', 'auto',
      '--verbose',
      '--session-id', 'session-1'
    ])
    expect(buildClaudeTurnArgs([], 'session-1', true)).toEqual([
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'auto',
      '--resume', 'session-1'
    ])
    expect(buildClaudeTurnArgs(['--output-format=json'], 'session-1', true))
      .toContain('--output-format=stream-json')
  })

  it('renders editable context variables and appends fixed plain-text output rules', () => {
    const prompt = buildClaudeTurnPrompt(
      DEFAULT_AGENT_PROMPT_TEMPLATE,
      '/documents/test.md',
      comment,
      '请解释这一段',
      '前文需要解释的原文后文',
      [comment]
    )
    expect(prompt).toContain('/documents/test.md')
    expect(prompt).toContain('comment-1')
    expect(prompt).toContain('需要解释的原文')
    expect(prompt).toContain('前文需要解释的原文后文')
    expect(prompt).toContain('Local：请解释这一段')
    expect(prompt).toContain('不要依赖 AnnotaMD MCP')
    expect(prompt).toContain('只输出简短的纯文字结果')
    expect(prompt).not.toContain('{{当前评论}}')
    expect(prompt).not.toContain('不要解决、删除或移动评论')
  })

  it('upgrades only the previous default prompt template', () => {
    expect(migrateAgentPromptTemplate(LEGACY_AGENT_PROMPT_TEMPLATE))
      .toBe(DEFAULT_AGENT_PROMPT_TEMPLATE)
    expect(migrateAgentPromptTemplate('我的自定义模板')).toBe('我的自定义模板')
  })

  it('parses Claude JSON output and rejects reported errors', () => {
    expect(parseClaudeTurnOutput(JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '已回复',
      session_id: 'session-1'
    }))).toEqual({ result: '已回复', sessionId: 'session-1' })
    expect(() => parseClaudeTurnOutput(JSON.stringify({
      type: 'result',
      subtype: 'error',
      is_error: true,
      result: '登录失效'
    }))).toThrow('登录失效')
    expect(parseClaudeTurnOutput(JSON.stringify({
      type: 'result',
      result: 'x'.repeat(2500)
    })).result).toHaveLength(2000)
    expect(parseClaudeTurnOutput([
      JSON.stringify({
        type: 'assistant',
        message: { id: 'message-1', content: [{ type: 'text', text: '蓝色' }] },
        session_id: 'session-2'
      }),
      JSON.stringify({
        type: 'assistant',
        message: { id: 'message-1', content: [{ type: 'text', text: '。' }] },
        session_id: 'session-2'
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        session_id: 'session-2'
      })
    ].join('\n'))).toEqual({ result: '蓝色。', sessionId: 'session-2' })
  })

  it('uses the anchored block to disambiguate repeated quoted text', () => {
    const repeatedComment: AnnotaMDCommentRecord = {
      ...comment,
      quote: 'same',
      exactQuote: 'same',
      anchor: { key: '1/text', path: [1, 'text'], offset: 0 },
      focus: { key: '1/text', path: [1, 'text'], offset: 4 }
    }
    const markdown = `FIRST same ${'a'.repeat(140)}\n\nSECOND same ${'b'.repeat(140)}`
    const prompt = buildClaudeTurnPrompt(
      '{{被批注前后上下文100字}}',
      '/documents/test.md',
      repeatedComment,
      '处理第二处',
      markdown,
      [repeatedComment]
    )
    expect(prompt).toContain('SECOND same')
    expect(prompt).not.toContain('FIRST same')
  })

  it('keeps normal Claude tools available without bypassing all permissions', () => {
    const repoRoot = resolve(__dirname, '../../../../..')
    const source = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/main/agentTurns/ClaudeAgentTurnService.ts'
    ), 'utf8')
    expect(source).toContain("args.push('--permission-mode', 'auto')")
    expect(source).not.toContain('--dangerously-skip-permissions')
    expect(source).not.toContain('--disallowedTools')
    expect(source).not.toContain("'--tools', ''")
  })

  it('exposes Send Agent beside both root and reply composers', () => {
    const repoRoot = resolve(__dirname, '../../../../..')
    for (const relativePath of [
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue',
      'packages/desktop/src/renderer/src/components/annotamd/DocumentCommentFooter.vue'
    ]) {
      const source = readFileSync(resolve(repoRoot, relativePath), 'utf8')
      expect(source).toContain("t('annotamd.comments.sendAgent')")
      expect(source).toContain('submitCommentToAgent')
      expect(source).toContain('saveReplyToAgent')
      expect(source).toContain('agentTurns.send')
      expect(source).toContain('SAVE_CURRENT_FOR_AGENT')
    }
  })

  it('keeps multi-turn session ids isolated by document, comment and Agent', () => {
    const repoRoot = resolve(__dirname, '../../../../..')
    const source = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/store/agentTurns.ts'
    ), 'utf8')
    expect(source).toContain('sessions[filePath]?.[commentId]?.[profileId]')
    expect(source).toContain('commentSessions[profile.id] = result.sessionId')
    expect(source).toContain('cloneAgentSessions(preferences.agentSessionByDocument)')
  })

  it('copies nested session state into an IPC-cloneable value', () => {
    const source = {
      '/documents/test.md': {
        'comment-1': { 'profile-1': 'session-1' }
      }
    }
    const sessions = reactive(source)
    const cloned = cloneAgentSessions(sessions)

    expect(() => structuredClone(sessions)).toThrow()
    expect(structuredClone(cloned)).toEqual(source)
    expect(cloned).not.toBe(sessions)
    expect(cloned['/documents/test.md']).not.toBe(sessions['/documents/test.md'])
    expect(cloned['/documents/test.md']?.['comment-1'])
      .not.toBe(sessions['/documents/test.md']?.['comment-1'])
  })

  it('writes prompt-template input back while the user is typing', () => {
    const repoRoot = resolve(__dirname, '../../../../..')
    const source = readFileSync(resolve(
      repoRoot,
      'packages/desktop/src/renderer/src/prefComponents/agent/index.vue'
    ), 'utf8')
    expect(source).toContain('@update:model-value="savePromptTemplate"')
    expect(source).not.toContain('@change="savePromptTemplate"')
  })
})
