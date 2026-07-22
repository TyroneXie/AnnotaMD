import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getCommentSkillInstallDirectory,
  installCommentSkill,
  isCommentSkillCurrent
} from '../../../src/main/mcpClients/commentSkill'

const repoRoot = resolve(import.meta.dirname, '../../../../..')
const sourceDirectory = resolve(
  repoRoot,
  'tools/annotamd-mcp/skills/annotamd-comment-review'
)

describe('AnnotaMD global comment skill', () => {
  it('uses the portable Agent Skills path for Codex and the Claude user path for Claude Code', () => {
    expect(getCommentSkillInstallDirectory('codex', '/Users/test')).toBe(
      '/Users/test/.agents/skills/annotamd-comment-review'
    )
    expect(getCommentSkillInstallDirectory('claude-code', '/Users/test')).toBe(
      '/Users/test/.claude/skills/annotamd-comment-review'
    )
  })

  it('installs the bundled skill idempotently and detects the current version', async() => {
    const root = await mkdtemp(join(tmpdir(), 'annotamd-comment-skill-'))
    const installDirectory = join(root, 'skill')

    expect(await isCommentSkillCurrent(sourceDirectory, installDirectory)).toBe(false)
    await installCommentSkill(sourceDirectory, installDirectory)
    expect(await isCommentSkillCurrent(sourceDirectory, installDirectory)).toBe(true)

    await installCommentSkill(sourceDirectory, installDirectory)
    const installedSkill = await readFile(join(installDirectory, 'SKILL.md'), 'utf8')
    expect(installedSkill).toContain('annotamd_list_inbox')
    expect(installedSkill).toContain('all comment threads')
    expect(installedSkill).toContain('final message is from Local')
    expect(installedSkill).toContain('localEndingComments')
    expect(installedSkill).toContain('localEndingCommentCount` is `0')
    expect(installedSkill).toContain('Never answer a completion-status question from memory')
    expect(installedSkill).toContain('Do not infer pending work from `resolved`')
  })

  it('does not overwrite an existing skill that AnnotaMD does not manage', async() => {
    const root = await mkdtemp(join(tmpdir(), 'annotamd-comment-skill-'))
    const installDirectory = join(root, 'skill')
    await mkdir(installDirectory, { recursive: true })
    await writeFile(join(installDirectory, 'SKILL.md'), 'user-owned skill')

    await expect(installCommentSkill(sourceDirectory, installDirectory)).rejects.toThrow(
      'Refusing to replace an unmanaged skill'
    )
    expect(await readFile(join(installDirectory, 'SKILL.md'), 'utf8')).toBe('user-owned skill')
  })
})
