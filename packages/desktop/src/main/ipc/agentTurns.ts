import { ipcMain } from 'electron'
import type { AnnotaMDAgentTurnRequest } from '@shared/types/agentTurns'
import { runClaudeAgentTurn } from '../agentTurns/ClaudeAgentTurnService'

export const registerAgentTurnHandlers = (): void => {
  ipcMain.handle(
    'annotamd::agent-turns::run',
    (_event, request: AnnotaMDAgentTurnRequest) => runClaudeAgentTurn(request)
  )
}
