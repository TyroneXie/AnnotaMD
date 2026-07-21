import { cp, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AnnotaMDMcpClientId } from '@shared/types/mcpClients'

const SKILL_NAME = 'annotamd-comment-review'
const MANAGED_MARKER = '<!-- Managed by AnnotaMD: annotamd-comment-review -->'
const MANAGED_FILES = ['SKILL.md', join('agents', 'openai.yaml')]

export const getCommentSkillInstallDirectory = (
  id: AnnotaMDMcpClientId,
  userHome = homedir()
): string => id === 'claude-code'
  ? join(userHome, '.claude', 'skills', SKILL_NAME)
  : join(userHome, '.agents', 'skills', SKILL_NAME)

const readIfPresent = async(pathname: string): Promise<string | null> => {
  try {
    return await readFile(pathname, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export const isCommentSkillCurrent = async(
  sourceDirectory: string,
  installDirectory: string
): Promise<boolean> => {
  for (const relativePath of MANAGED_FILES) {
    const source = await readIfPresent(join(sourceDirectory, relativePath))
    const installed = await readIfPresent(join(installDirectory, relativePath))
    if (source === null || installed !== source) return false
  }
  return true
}

export const installCommentSkill = async(
  sourceDirectory: string,
  installDirectory: string
): Promise<void> => {
  const sourceSkill = await readFile(join(sourceDirectory, 'SKILL.md'), 'utf8')
  if (!sourceSkill.includes(MANAGED_MARKER)) {
    throw new Error('Bundled AnnotaMD comment skill is missing its managed marker')
  }

  const installedSkill = await readIfPresent(join(installDirectory, 'SKILL.md'))
  if (installedSkill !== null && !installedSkill.includes(MANAGED_MARKER)) {
    throw new Error(`Refusing to replace an unmanaged skill at ${installDirectory}`)
  }

  await mkdir(installDirectory, { recursive: true })
  await cp(sourceDirectory, installDirectory, { recursive: true, force: true })
}
