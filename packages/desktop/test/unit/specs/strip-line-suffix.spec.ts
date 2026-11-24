import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stripLineSuffix } from 'common/filesystem/paths'

// Documents cite source locations as `run_agent.py:11395`. The link handler fed
// that whole string to shell.openPath(), which cannot open it — the click did
// nothing and reported nothing. The suffix is not part of the filename, so it is
// stripped before opening.

let dir = ''

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotamd-line-suffix-'))
  fs.writeFileSync(path.join(dir, 'run_agent.py'), 'print(1)\n')
  fs.mkdirSync(path.join(dir, 'tools'))
  // POSIX allows `:` in file names: a real file must never be truncated.
  fs.writeFileSync(path.join(dir, 'notes:2024.md'), '# kept\n')
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('stripLineSuffix', () => {
  it('strips a trailing line number from an existing file', () => {
    expect(stripLineSuffix(`${dir}/run_agent.py:11395`)).toBe(`${dir}/run_agent.py`)
  })

  it('strips a trailing line and column number', () => {
    expect(stripLineSuffix(`${dir}/run_agent.py:11395:4`)).toBe(`${dir}/run_agent.py`)
  })

  it('strips the suffix to reach a directory', () => {
    expect(stripLineSuffix(`${dir}/tools:12`)).toBe(`${dir}/tools`)
  })

  it('leaves a path that exists as written untouched', () => {
    expect(stripLineSuffix(`${dir}/notes:2024.md`)).toBe(`${dir}/notes:2024.md`)
    expect(stripLineSuffix(`${dir}/run_agent.py`)).toBe(`${dir}/run_agent.py`)
  })

  it('leaves a non-numeric or unrelated suffix untouched', () => {
    expect(stripLineSuffix(`${dir}/run_agent.py:abc`)).toBe(`${dir}/run_agent.py:abc`)
    expect(stripLineSuffix(`${dir}/missing.py:12`)).toBe(`${dir}/missing.py:12`)
  })

  it('tolerates empty and non-string input', () => {
    expect(stripLineSuffix('')).toBe('')
    expect(stripLineSuffix(undefined as unknown as string)).toBe(undefined)
  })
})
