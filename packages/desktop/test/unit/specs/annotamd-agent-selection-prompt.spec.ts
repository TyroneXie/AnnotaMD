import { readSource as readFileSync } from '../readSource'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('Agent selection prompt', () => {
  const prompt = read(
    'packages/desktop/src/renderer/src/components/agent/AgentSelectionPrompt.vue'
  )

  it('can be dragged away from the selected text', () => {
    expect(prompt).toContain('@pointerdown="startDrag"')
    expect(prompt).toContain(':class="{ \'is-dragging\': dragging }"')
    expect(prompt).toContain('clampToViewport(')
    expect(prompt).toContain("window.addEventListener('pointermove', moveDrag)")
    expect(prompt).toContain("window.addEventListener('pointerup', endDrag)")
    // A dragged panel keeps its place instead of snapping back to the selection.
    expect(prompt).toMatch(
      /if \(userPositioned\.value\) \{[^}]*position\.value = \{ left:/
    )
    expect(prompt).toMatch(/\.selection-context \{[^}]*cursor:\s*grab;/s)
  })

  it('renders the model reply as sanitized Markdown', () => {
    expect(prompt).toContain("import { renderAgentMarkdown } from './agentMarkdown'")
    expect(prompt).toContain('renderAgentMarkdown(text)')
    expect(prompt).toContain('v-html="part.html"')
    expect(prompt).toContain('class="result-markdown"')
    // The raw reply must not be printed as plain text anymore.
    expect(prompt).not.toContain('{{ result.text }}')
  })
})
