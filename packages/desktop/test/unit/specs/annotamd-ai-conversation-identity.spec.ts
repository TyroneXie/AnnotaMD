import { describe, expect, it } from 'vitest'
import type { AiConversation } from '@shared/types/aiWorkspace'
import { matchesAiConversationIdentity } from '@shared/types/aiConversationIdentity'

const conversation = (): AiConversation => ({
  id: 'conversation-1',
  title: 'Conversation',
  mode: 'agent',
  configId: 'config-1',
  provider: 'codex',
  modelId: 'gpt-5',
  effort: { kind: 'preset', id: 'high' },
  templateIds: ['template-1'],
  workspacePath: '/workspace/one',
  status: 'completed',
  createdAt: 1,
  updatedAt: 2
})

const identity = () => ({
  mode: 'agent' as const,
  configId: 'config-1',
  provider: 'codex' as const,
  modelId: 'gpt-5',
  effort: { kind: 'preset' as const, id: 'high' },
  templateIds: ['template-1'],
  workspacePath: '/workspace/one'
})

describe('AI conversation identity', () => {
  it('reuses a conversation only when every runtime identity field still matches', () => {
    expect(matchesAiConversationIdentity(conversation(), identity())).toBe(true)

    for (const changed of [
      { ...identity(), mode: 'ask' as const },
      { ...identity(), configId: 'config-2' },
      { ...identity(), provider: 'claude-code' as const },
      { ...identity(), modelId: 'gpt-5-mini' },
      { ...identity(), effort: { kind: 'preset' as const, id: 'medium' } },
      { ...identity(), templateIds: ['template-2'] },
      { ...identity(), workspacePath: '/workspace/two' }
    ]) {
      expect(matchesAiConversationIdentity(conversation(), changed)).toBe(false)
    }
  })

  it('treats an omitted effort as the provider default', () => {
    const current = { ...conversation(), effort: undefined }
    const requested = { ...identity(), effort: { kind: 'provider-default' as const } }

    expect(matchesAiConversationIdentity(current, requested)).toBe(true)
  })
})
