export interface AiSelectionContext {
  documentName: string
  blockPath: string
  startOffset: number
  endOffset: number
  selectedText: string
  selectedMarkdown: string
  before: string
  after: string
}

export interface AiSelectionRequest {
  requestId: string
  instruction: string
  context: AiSelectionContext
  modelId?: string
}

export type AiSelectionResult =
  | { kind: 'answer'; text: string }
  | { kind: 'replacement'; text: string; replacementMarkdown: string }
