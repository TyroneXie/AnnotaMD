import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const editor = readFileSync(
  resolve(repoRoot, 'packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue'),
  'utf8'
)

describe('AnnotaMD image viewer floating tools', () => {
  it('hides editor floating tools for the entire fullscreen session', () => {
    expect(editor).toMatch(
      /<Teleport\s+to="body">[\s\S]*?v-show="imageViewerVisible"[\s\S]*?class="image-viewer"[\s\S]*?<\/Teleport>/
    )
    expect(editor).toMatch(/\.image-viewer\s*\{[^}]*z-index:\s*2147482000;/s)
    expect(editor).toMatch(
      /const setImageViewerVisible = \(status: boolean\) => \{[^}]*document\.body\.classList\.toggle\('annotamd-image-viewer-open', status\)[^}]*if \(status\) \{[^}]*editor\.value\?\.hideAllFloatTools\(\)/s
    )
    expect(editor).toMatch(
      /body\.annotamd-image-viewer-open \.mu-front-button-wrapper,\s*body\.annotamd-image-viewer-open \.mu-float-wrapper\s*\{[^}]*display:\s*none !important;/s
    )
    expect(editor).toMatch(
      /onBeforeUnmount\(\(\) => \{[^}]*document\.body\.classList\.remove\('annotamd-image-viewer-open'\)/s
    )
  })
})
