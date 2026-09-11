import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { LogRecord } from '../domains/ingestion/core/log-record'
import { resolveAdapter } from '../domains/ingestion/infra/adapter-registry'
import { createAwsCloudWatchAdapter } from '../domains/ingestion/infra/adapters/aws-cloudwatch'
import { gcpCloudLoggingAdapter } from '../domains/ingestion/infra/adapters/gcp-cloud-logging'
import { createJsonLinesAdapter } from '../domains/ingestion/infra/adapters/json-lines-adapter'
import type { ParseResult } from '../domains/ingestion/ports/log-source-adapter'

import { generateLogFile } from './generate-logs'

const clock = (): Date => new Date('2026-09-09T00:00:00.000Z')

const isParseError = (
  result: ParseResult,
): result is Extract<ParseResult, { kind: 'parse-error' }> => 'kind' in result

const asRecords = (results: readonly ParseResult[]): LogRecord[] => {
  expect(results.every((result) => !isParseError(result))).toBe(true)
  return results.filter((result): result is LogRecord => !isParseError(result))
}

describe('generateLogFile', () => {
  let workDir: string

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'synthetic-logs-'))
  })

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  const generate = async (
    format: Parameters<typeof generateLogFile>[0]['format'],
    name: string,
  ): Promise<string[]> => {
    const out = join(workDir, name)
    const summary = await generateLogFile({ lines: 400, format, out })
    expect(summary.lines).toBe(400)
    expect(summary.degenerate).toBeGreaterThan(0)

    const raw = await readFile(out, 'utf8')
    return raw.split('\n').filter((line) => line.length > 0)
  }

  it('emits json-lines the json-lines adapter parses into varied records', async () => {
    const lines = await generate('json-lines', 'sample.jsonl')
    expect(lines).toHaveLength(400)

    const adapter = createJsonLinesAdapter(clock)
    const records = asRecords(lines.map((line) => adapter.parse(line)))

    expect(new Set(records.map((record) => record.fingerprint)).size).toBeGreaterThan(20)
    expect(records.some((record) => record.severityNumber === null)).toBe(true)
    expect(records.some((record) => record.body === '')).toBe(true)
    expect(resolveAdapter(lines.slice(0, 20)).sourceType).toBe('json-lines')
  })

  it('emits gcp entries the gcp adapter parses into varied records', async () => {
    const lines = await generate('gcp', 'sample.gcp.json')

    const records = asRecords(
      lines.map((line) => gcpCloudLoggingAdapter.parse(line)),
    )

    expect(new Set(records.map((record) => record.serviceName)).size).toBeGreaterThan(1)
    expect(new Set(records.map((record) => record.fingerprint)).size).toBeGreaterThan(20)
    expect(resolveAdapter(lines.slice(0, 20)).sourceType).toBe('gcp-cloud-logging')
  })

  it('emits cloudwatch events the cloudwatch adapter parses into varied records', async () => {
    const lines = await generate('cloudwatch', 'sample.cw.json')

    const adapter = createAwsCloudWatchAdapter(clock)
    const records = asRecords(lines.map((line) => adapter.parse(line)))

    expect(new Set(records.map((record) => record.fingerprint)).size).toBeGreaterThan(20)
    expect(resolveAdapter(lines.slice(0, 20)).sourceType).toBe('aws-cloudwatch')
  })

  it('spreads timestamps across a multi-day window for a dashboard trend', async () => {
    const lines = await generate('json-lines', 'sample.window.jsonl')
    const adapter = createJsonLinesAdapter(clock)
    const records = asRecords(lines.map((line) => adapter.parse(line)))

    const times = records.map((record) => record.timestamp.getTime())
    const spanMs = Math.max(...times) - Math.min(...times)
    expect(spanMs).toBeGreaterThan(24 * 60 * 60 * 1000)
  })

  it('ends the window at generation time so a default 24h dashboard view is populated', async () => {
    const generatedAt = Date.now()
    const lines = await generate('json-lines', 'sample.recent.jsonl')
    const adapter = createJsonLinesAdapter(clock)
    const records = asRecords(lines.map((line) => adapter.parse(line)))

    const times = records.map((record) => record.timestamp.getTime())
    const DAY_MS = 24 * 60 * 60 * 1000

    expect(Math.max(...times)).toBeGreaterThan(generatedAt - 5 * 60_000)
    expect(Math.min(...times)).toBeGreaterThan(generatedAt - 3 * DAY_MS)

    const withinLast24h = times.filter((t) => t > generatedAt - DAY_MS).length
    expect(withinLast24h / times.length).toBeGreaterThan(0.3)
  })
})
