export type AnnotaMDAgentProfileKind =
  | 'codex'
  | 'claude-code'
  | 'codebuddy-code'
  | 'custom'

export interface AnnotaMDAgentProfile {
  id: string
  name: string
  kind: AnnotaMDAgentProfileKind
  command: string
}

export interface AnnotaMDAgentProfilePreset {
  kind: AnnotaMDAgentProfileKind
  name: string
  command: string
}

export const displayAgentProfileName = (profile: AnnotaMDAgentProfile): string => {
  if (profile.kind === 'claude-code' && /^Claude Code(?: CLI)?$/i.test(profile.name)) {
    return 'Claude Code CLI'
  }
  if (profile.kind === 'codex' && /^Codex(?: CLI)?$/i.test(profile.name)) return 'Codex CLI'
  if (profile.kind === 'codebuddy-code' && /^CodeBuddy Code(?: CLI)?$/i.test(profile.name)) {
    return 'CodeBuddy Code CLI'
  }
  return profile.name
}

export type AgentReadinessLevel = 'ready' | 'partial' | 'unavailable'

export const classifyAgentReadiness = (
  commentAccessReady: boolean,
  appAccessReady: boolean,
  directAgentConfigured: boolean,
  directAgentReady: boolean
): AgentReadinessLevel => {
  if (!commentAccessReady) return 'unavailable'
  if (appAccessReady || directAgentReady) return 'ready'
  return directAgentConfigured ? 'partial' : 'unavailable'
}

export const ANNOTAMD_AGENT_PROFILE_PRESETS: readonly AnnotaMDAgentProfilePreset[] = [
  {
    kind: 'codex',
    name: 'Codex CLI',
    command: 'codex exec --json'
  },
  {
    kind: 'claude-code',
    name: 'Claude Code CLI',
    command: 'claude -p --output-format stream-json --verbose --permission-mode auto'
  },
  {
    kind: 'codebuddy-code',
    name: 'CodeBuddy Code CLI',
    command: 'codebuddy -p --output-format stream-json'
  },
  {
    kind: 'custom',
    name: '',
    command: ''
  }
]

export const defaultAgentProfile = (
  profiles: readonly AnnotaMDAgentProfile[],
  defaultProfileId: string
): AnnotaMDAgentProfile | undefined => (
  profiles.find((profile) => profile.id === defaultProfileId) ?? profiles[0]
)

export const parseAgentCommand = (command: string): string[] => {
  const input = command.trim()
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!
    if (character === '\\' && quote !== "'") {
      const next = input[index + 1]
      const escapesNext = next != null && (
        /\s/.test(next) || next === '\\' || next === '"' || next === "'"
      )
      if (escapesNext) {
        current += next
        index += 1
      } else {
        current += character
      }
    } else if (quote) {
      if (character === quote) quote = null
      else current += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (/\s/.test(character)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += character
    }
  }

  if (quote) throw new Error('Agent command contains an unfinished quote')
  if (current) tokens.push(current)
  return tokens
}
