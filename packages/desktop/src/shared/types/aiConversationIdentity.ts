import type {
  AiConversation,
  AiEffortSelection,
  AiPermissionMode,
  AiProviderId,
  AiWorkspaceMode
} from './aiWorkspace'

export interface AiConversationIdentity {
  mode: AiWorkspaceMode
  configId?: string
  provider?: AiProviderId
  modelId?: string
  effort?: AiEffortSelection
  permissionMode: AiPermissionMode
  templateIds: string[]
  workspacePath?: string
}

const optionalText = (value?: string): string => value?.trim() ?? ''

const effortKey = (effort?: AiEffortSelection): string => {
  if (!effort || effort.kind === 'provider-default') return 'provider-default'
  if (effort.kind === 'preset') return `preset:${effort.id}`
  if (effort.kind === 'integer') return `integer:${effort.value}`
  if (effort.kind === 'boolean') return `boolean:${effort.value}`
  return `text:${effort.value}`
}

export const matchesAiConversationIdentity = (
  conversation: AiConversation,
  identity: AiConversationIdentity
): boolean => (
  conversation.mode === identity.mode &&
  optionalText(conversation.configId) === optionalText(identity.configId) &&
  optionalText(conversation.provider) === optionalText(identity.provider) &&
  optionalText(conversation.modelId) === optionalText(identity.modelId) &&
  effortKey(conversation.effort) === effortKey(identity.effort) &&
  conversation.permissionMode === identity.permissionMode &&
  conversation.templateIds.length === identity.templateIds.length &&
  conversation.templateIds.every((id, index) => id === identity.templateIds[index]) &&
  optionalText(conversation.workspacePath) === optionalText(identity.workspacePath)
)
