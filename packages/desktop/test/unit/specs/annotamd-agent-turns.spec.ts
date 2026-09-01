import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  buildCommentAgentPrompt,
  cloneAgentSessions,
  DEFAULT_AGENT_PROMPT_TEMPLATE,
  LEGACY_AGENT_PROMPT_TEMPLATE,
  migrateAgentPromptTemplate,
  normalizeCommentAgentReply,
  shouldRevealCommentAgentConversation,
  UNIFIED_AGENT_CONVERSATION_KEY
} from '../../../src/shared/types/agentTurns'
import type { AnnotaMDCommentRecord } from '../../../src/shared/types/comments'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

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

describe('AnnotaMD unified AI comment turns', () => {
  it('builds one provider-neutral prompt with live document context and safe edit rules', () => {
    const prompt = buildCommentAgentPrompt(
      '/documents/test.md',
      comment,
      '请解释这一段',
      '前文需要解释的原文后文'
    )
    expect(prompt.startsWith('用户最新批注意见：请解释这一段')).toBe(true)
    expect(prompt).toContain('/documents/test.md')
    expect(prompt).toContain('comment-1')
    expect(prompt).toContain('前文需要解释的原文后文')
    expect(prompt).toContain('Local：请解释这一段')
    expect(prompt).toContain('AnnotaMD 文档工具')
    expect(prompt).toContain('不要使用 shell 或通用文件写入')
    expect(prompt).toContain('始终返回一条简短的纯文字答复')
    expect(prompt).not.toContain('{{当前评论}}')
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
    const prompt = buildCommentAgentPrompt(
      '/documents/test.md', repeatedComment, '处理第二处', markdown
    )
    expect(prompt).toContain('SECOND same')
    expect(prompt).not.toContain('FIRST same')
  })

  it('normalizes the final shared-runtime answer before it becomes a comment reply', () => {
    expect(normalizeCommentAgentReply('\u001b[31m已完成\u001b[0m\u0000')).toBe('已完成')
    expect(normalizeCommentAgentReply('x'.repeat(2500))).toHaveLength(2000)
  })

  it('keeps old prompt data readable without executing it in the new comment path', () => {
    expect(migrateAgentPromptTemplate(LEGACY_AGENT_PROMPT_TEMPLATE))
      .toBe(DEFAULT_AGENT_PROMPT_TEMPLATE)
    expect(migrateAgentPromptTemplate('我的自定义模板')).toBe('我的自定义模板')
    expect(read('packages/desktop/src/main/ipc/agentTurns.ts')).not.toContain('agentPromptTemplate')
  })

  it('removes visible Agent consultation actions from comments while retaining legacy turn recovery', () => {
    for (const relativePath of [
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue',
      'packages/desktop/src/renderer/src/components/annotamd/DocumentCommentFooter.vue'
    ]) {
      const source = read(relativePath)
      expect(source).not.toContain("t('annotamd.comments.sendAgent')")
      expect(source).not.toContain('annotamd-send-agent')
      expect(source).not.toContain('submitCommentToAgent')
      expect(source).not.toContain('saveReplyToAgent')
      expect(source).not.toContain('sendExistingMessageToAgent')
      expect(source).not.toContain('agentTurns.send')
      expect(source).not.toContain('SAVE_CURRENT_FOR_AGENT')
      expect(source).not.toContain('selectedAgentProfile')
    }

    expect(read('packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue'))
      .not.toContain('class="annotamd-agent-status"')

    const main = read('packages/desktop/src/main/ipc/agentTurns.ts')
    expect(main).toContain('service.sendAndWait')
    expect(main).toContain("mode: 'agent'")
    expect(main).toContain("'annotamd::agent-turns::started'")
    expect(main).toContain('getAiWorkspaceService().stop')
    expect(main).toContain('candidate.turnId === completion.turnId')
    expect(main).toContain('configId: request.selection?.configId')
    expect(main).not.toContain('runClaudeAgentTurn')

    const turnStore = read('packages/desktop/src/renderer/src/store/agentTurns.ts')
    expect(turnStore).toContain("'annotamd::agent-turns::stop'")
    expect(turnStore).toContain('activeByComment')
    expect(turnStore).toContain('if (!shouldRevealCommentAgentConversation(result)) return')
    expect(turnStore).toContain('await conversations.select(result.conversationId, true)')
    expect(turnStore).toContain("useLayoutStore().SET_LAYOUT({ rightColumn: 'agent', showSideBar: true })")
    expect(turnStore).toContain("settings.selectedConfig('agent')")
    expect(turnStore).toContain('modelId: settings.selections.agent.modelId')
    for (const relativePath of [
      'packages/desktop/src/renderer/src/components/annotamd/CommentPane.vue',
      'packages/desktop/src/renderer/src/components/annotamd/DocumentCommentFooter.vue'
    ]) {
      expect(read(relativePath)).toContain('agentTurns.stop(comment.id)')
    }
  })

  it('reveals the shared Agent conversation only for a document-changing comment turn', () => {
    expect(shouldRevealCommentAgentConversation({
      conversationId: 'conversation-1',
      reply: 'Only answered the comment'
    })).toBe(false)
    expect(shouldRevealCommentAgentConversation({
      conversationId: 'conversation-1',
      reply: 'Updated the document',
      changeSet: {
        id: 'change-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        documentId: 'document-1',
        documentUri: 'file:///documents/test.md',
        originalContent: 'before',
        appliedContent: 'after',
        status: 'applied-unreviewed',
        additions: 1,
        deletions: 1,
        createdAt: 1
      }
    })).toBe(true)
  })

  it('keeps one shared AI conversation per document/comment without deleting legacy sessions', () => {
    expect(UNIFIED_AGENT_CONVERSATION_KEY).toBe('annotamd-unified-ai')
    const store = read('packages/desktop/src/renderer/src/store/agentTurns.ts')
    expect(store).toContain('result.conversationId')
    expect(store).toContain("includes('was not found')")
    expect(store).toContain('file.markdown')
    expect(store).toContain('dirty: !file.isSaved')
  })

  it('copies nested legacy and unified session state into an IPC-cloneable value', () => {
    const source = {
      '/documents/test.md': {
        'comment-1': {
          'profile-1': 'session-1',
          [UNIFIED_AGENT_CONVERSATION_KEY]: 'conversation-1'
        }
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

  it('removes prompt templates from the visible AI settings flow', () => {
    const source = read('packages/desktop/src/renderer/src/prefComponents/agent/index.vue')
    const composer = read('packages/desktop/src/renderer/src/components/agent/AgentComposer.vue')
    expect(source).not.toContain('saveTemplate')
    expect(source).not.toContain('usePromptTemplatesStore')
    expect(composer).not.toContain('AgentTemplateSelector')
  })
})
