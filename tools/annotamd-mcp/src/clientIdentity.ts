export interface McpClientInfo {
  name?: string
  version?: string
}

export interface AnnotaMDClientIdentity {
  name: string
  version?: string
}

export const resolveClientIdentity = (
  configuredName: string | undefined,
  clientInfo: McpClientInfo | undefined
): AnnotaMDClientIdentity => {
  const name = configuredName?.trim() || clientInfo?.name?.trim() || 'Agent'
  const version = clientInfo?.version?.trim() || undefined
  return { name, version }
}
