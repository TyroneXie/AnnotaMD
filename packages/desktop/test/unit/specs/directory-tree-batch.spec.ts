import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

describe('directory tree batch insertion', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'path', {
      configurable: true,
      value: path.posix
    })
  })

  it('adds a large unsorted batch and sorts each folder at the end', async() => {
    const { addFiles } = await import('@/store/treeCtrl')
    const tree = {
      pathname: '/workspace',
      name: 'workspace',
      isDirectory: true as const,
      isFile: false as const,
      isMarkdown: false as const,
      folders: [],
      files: []
    }
    const files = Array.from({ length: 1000 }, (_, index) => ({
      pathname: `/workspace/docs/file-${999 - index}.md`,
      name: `file-${999 - index}.md`,
      isDirectory: false as const,
      isFile: true as const,
      isMarkdown: true
    }))

    addFiles(tree, files, 'title', 'asc')

    expect(tree.folders).toHaveLength(1)
    expect(tree.folders[0]?.files).toHaveLength(1000)
    expect(tree.folders[0]?.files[0]?.name).toBe('file-0.md')
    expect(tree.folders[0]?.files[999]?.name).toBe('file-999.md')
  })
})
