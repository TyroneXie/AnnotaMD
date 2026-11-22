import type { Editor } from 'codemirror'
import type { Muya } from '@muyajs/core'

/** Runtime handles attached by the two editor engines to their DOM roots. */
export type MuyaElement = HTMLElement & {
  __MUYA_BLOCK__: {
    text: string
    path: Array<string | number>
    setCursor(anchor: number, focus: number, focusEditor?: boolean): void
    muya: Muya
  }
}
export type CodeMirrorElement = HTMLElement & { CodeMirror: Editor }
