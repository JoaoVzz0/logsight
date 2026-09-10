import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { streamFileLines } from './stream-file-lines'

const workdir = mkdtempSync(join(tmpdir(), 'stream-file-lines-'))

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true })
})

const fileWith = (name: string, contents: string): string => {
  const path = join(workdir, name)
  writeFileSync(path, contents)
  return path
}

describe('streamFileLines', () => {
  it('yields the file one line at a time without reading the rest of the stream', async () => {
    const lineCount = 50_000
    const body = Array.from(
      { length: lineCount },
      (_unused, index) => `line ${index}`,
    ).join('\n')
    const path = fileWith('large.log', body)

    const seen: string[] = []
    for await (const line of streamFileLines(path)) {
      seen.push(line)
      if (seen.length === 3) {
        break
      }
    }

    expect(seen).toEqual(['line 0', 'line 1', 'line 2'])

    const all: string[] = []
    for await (const line of streamFileLines(path)) {
      all.push(line)
    }
    expect(all).toHaveLength(lineCount)
    expect(all.at(-1)).toBe(`line ${lineCount - 1}`)
  })
})
