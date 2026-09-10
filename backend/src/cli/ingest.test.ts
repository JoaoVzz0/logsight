import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ingest, parseIngestArgs } from './ingest'

describe('parseIngestArgs', () => {
  it('reads the file path and the --source-type override', () => {
    expect(
      parseIngestArgs(['logs.jsonl', '--source-type', 'gcp-cloud-logging']),
    ).toEqual({ filePath: 'logs.jsonl', sourceType: 'gcp-cloud-logging' })
  })

  it('leaves sourceType undefined when the flag is absent', () => {
    expect(parseIngestArgs(['logs.jsonl'])).toEqual({ filePath: 'logs.jsonl' })
  })

  it('reads --batch-size as a positive integer', () => {
    expect(parseIngestArgs(['logs.jsonl', '--batch-size', '1000'])).toEqual({
      filePath: 'logs.jsonl',
      batchSize: 1000,
    })
  })

  it('rejects a non-positive --batch-size', () => {
    expect(() => parseIngestArgs(['logs.jsonl', '--batch-size', '0'])).toThrow(
      /batch-size/,
    )
  })

  it('rejects an invocation with no file path', () => {
    expect(() => parseIngestArgs(['--source-type', 'json-lines'])).toThrow(
      /usage/,
    )
  })
})

describe('ingest', () => {
  let workDir: string

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'ingest-cli-'))
  })

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('fails cleanly when the file does not exist', async () => {
    await expect(
      ingest({ filePath: join(workDir, 'missing.jsonl') }),
    ).rejects.toThrow(/ENOENT|no such file/i)
  })
})
