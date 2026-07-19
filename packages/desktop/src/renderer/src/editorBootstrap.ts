import type { BootstrapEditorConfig } from '@shared/types/files'

let pendingEditorBootstrap: BootstrapEditorConfig | null = null
let editorBootstrapListener: ((config: BootstrapEditorConfig) => void) | null = null

export const captureEditorBootstrap = (config: BootstrapEditorConfig): void => {
  if (editorBootstrapListener) {
    editorBootstrapListener(config)
  } else {
    pendingEditorBootstrap = config
  }
}

export const listenForEditorBootstrap = (
  listener: (config: BootstrapEditorConfig) => void
): void => {
  editorBootstrapListener = listener
  if (pendingEditorBootstrap) {
    const config = pendingEditorBootstrap
    pendingEditorBootstrap = null
    listener(config)
  }
}
