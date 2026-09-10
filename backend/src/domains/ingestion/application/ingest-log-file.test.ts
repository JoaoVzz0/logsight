import { describe, expect, it } from 'vitest'

import type { Issue } from '../../issues/core/issue'
import type { Occurrence } from '../../issues/core/occurrence'
import type { IssueRepository } from '../../issues/ports/issue-repository'
import type { LogRecord } from '../core/log-record'
import type {
  ImportJobStore,
  IngestionOutcome,
  IngestionProgress,
  NewImportJob,
} from '../ports/import-job-store'
import type { LogRecordSink } from '../ports/log-record-sink'
import type {
  LogSourceAdapter,
  ParseResult,
  SourceType,
} from '../ports/log-source-adapter'

import {
  ingestLogFile,
  type IngestLogFileDependencies,
  type IngestLogFileRequest,
} from './ingest-log-file'

const logRecord = (overrides: Partial<LogRecord> = {}): LogRecord => ({
  timestamp: new Date('2026-09-08T10:00:00.000Z'),
  observedAt: new Date('2026-09-08T10:00:00.000Z'),
  severityNumber: 17,
  severityText: 'ERROR',
  body: 'checkout failed for order 4471',
  serviceName: 'checkout',
  host: null,
  environment: null,
  traceId: null,
  spanId: null,
  attributes: {},
  sourceType: 'json-lines',
  fingerprint: 'fp-a',
  raw: '{}',
  ...overrides,
})

const parseError = (line: string): ParseResult => ({
  kind: 'parse-error',
  line,
  code: 'unrecognized-shape',
})

class StubAdapter implements LogSourceAdapter {
  readonly parsedLines: string[] = []

  constructor(
    readonly sourceType: SourceType,
    private readonly behaviour: (line: string) => ParseResult = (line) =>
      line.trim().length === 0 ? parseError(line) : logRecord(),
  ) {}

  detect(): number {
    return 1
  }

  parse(line: string): ParseResult {
    this.parsedLines.push(line)
    return this.behaviour(line)
  }
}

class RecordingRecordSink implements LogRecordSink {
  readonly batches: { importJobId: string; records: LogRecord[] }[] = []

  async insertBatch(
    importJobId: string,
    records: readonly LogRecord[],
  ): Promise<void> {
    this.batches.push({ importJobId, records: [...records] })
  }
}

class RecordingIssueRepository implements IssueRepository {
  readonly calls: Occurrence[][] = []

  async upsertBatch(occurrences: readonly Occurrence[]): Promise<void> {
    this.calls.push([...occurrences])
  }

  async findByFingerprint(): Promise<Issue | null> {
    return null
  }
}

class RecordingImportJobStore implements ImportJobStore {
  readonly transitions: string[] = []
  readonly progress: IngestionProgress[] = []
  running: { totalLines: number | null } | undefined
  completed: IngestionOutcome | undefined
  failed: string | undefined

  async create(_job: NewImportJob): Promise<{ id: string }> {
    return { id: 'job-1' }
  }

  async markRunning(
    _importJobId: string,
    totalLines: number | null,
  ): Promise<void> {
    this.transitions.push('running')
    this.running = { totalLines }
  }

  async reportProgress(
    _importJobId: string,
    progress: IngestionProgress,
  ): Promise<void> {
    this.progress.push(progress)
  }

  async markCompleted(
    _importJobId: string,
    outcome: IngestionOutcome,
  ): Promise<void> {
    this.transitions.push('completed')
    this.completed = outcome
  }

  async markFailed(_importJobId: string, reason: string): Promise<void> {
    this.transitions.push('failed')
    this.failed = reason
  }
}

async function* asLines(values: string[]): AsyncGenerator<string> {
  for (const value of values) {
    yield value
  }
}

const steppingClock = (values: number[]): (() => number) => {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

type ResolverCall = { sample: string[]; sourceType: string | undefined }

type RunOptions = {
  sourceType?: string
  totalLines?: number | null
  importJobId?: string
  batchSize?: number
  sampleSize?: number
}

type Harness = {
  request: (lines: string[], options?: RunOptions) => Promise<IngestionOutcome>
  adapter: StubAdapter
  recordSink: RecordingRecordSink
  issueRepository: RecordingIssueRepository
  importJobStore: RecordingImportJobStore
  resolverCalls: ResolverCall[]
}

const harness = (deps: Partial<IngestLogFileDependencies> = {}): Harness => {
  const adapter = new StubAdapter('json-lines')
  const recordSink = new RecordingRecordSink()
  const issueRepository = new RecordingIssueRepository()
  const importJobStore = new RecordingImportJobStore()
  const resolverCalls: ResolverCall[] = []

  const fullDeps: IngestLogFileDependencies = {
    resolveAdapter: (sample, sourceType) => {
      resolverCalls.push({ sample: [...sample], sourceType })
      return adapter
    },
    recordSink,
    issueRepository,
    importJobStore,
    now: steppingClock([0, 1]),
    ...deps,
  }

  return {
    request: (lines, options = {}) => {
      const request: IngestLogFileRequest = {
        importJobId: options.importJobId ?? 'job-1',
        lines: asLines(lines),
        totalLines: options.totalLines ?? null,
        ...(options.sourceType === undefined
          ? {}
          : { sourceType: options.sourceType }),
      }
      const runDeps: IngestLogFileDependencies = {
        ...fullDeps,
        ...(options.batchSize === undefined
          ? {}
          : { batchSize: options.batchSize }),
        ...(options.sampleSize === undefined
          ? {}
          : { sampleSize: options.sampleSize }),
      }
      return ingestLogFile(request, runDeps)
    },
    adapter,
    recordSink,
    issueRepository,
    importJobStore,
    resolverCalls,
  }
}

describe('ingestLogFile', () => {
  it('samples the first non-blank lines for the registry and forwards a caller source type instead of detecting', async () => {
    const detected = harness()
    await detected.request(['', '  ', 'first', 'second', 'third'], {
      sampleSize: 2,
    })

    expect(detected.resolverCalls).toHaveLength(1)
    expect(detected.resolverCalls[0]).toEqual({
      sample: ['first', 'second'],
      sourceType: undefined,
    })

    const overridden = harness()
    await overridden.request(['first', 'second'], {
      sourceType: 'aws-cloudwatch',
    })

    expect(overridden.resolverCalls[0]?.sourceType).toBe('aws-cloudwatch')
  })

  it('splits a CloudWatch export into per-event lines carrying the envelope log group and stream before the adapter sees them', async () => {
    const test = harness()
    const envelope = JSON.stringify({
      logGroup: '/aws/lambda/checkout-api',
      logStream: '2026/09/08/[$LATEST]abc',
      logEvents: [
        { id: '1', timestamp: 1757325600000, message: 'first event' },
        { id: '2', timestamp: 1757325600123, message: 'second event' },
      ],
    })

    await test.request([envelope])

    expect(test.adapter.parsedLines).toHaveLength(2)
    const events = test.adapter.parsedLines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    )
    expect(events).toEqual([
      {
        logGroup: '/aws/lambda/checkout-api',
        logStream: '2026/09/08/[$LATEST]abc',
        id: '1',
        timestamp: 1757325600000,
        message: 'first event',
      },
      {
        logGroup: '/aws/lambda/checkout-api',
        logStream: '2026/09/08/[$LATEST]abc',
        id: '2',
        timestamp: 1757325600123,
        message: 'second event',
      },
    ])
  })

  it('counts a parse failure and keeps going instead of aborting the run', async () => {
    const test = harness({
      resolveAdapter: () =>
        new StubAdapter('json-lines', (line) =>
          line === 'broken' ? parseError(line) : logRecord({ raw: line }),
        ),
    })

    const outcome = await test.request(['ok-1', 'broken', 'ok-2', 'ok-3'])

    expect(outcome.parseErrors).toBe(1)
    expect(outcome.ingestedRecords).toBe(3)
    const persisted = test.recordSink.batches.flatMap((batch) => batch.records)
    expect(persisted.map((record) => record.raw)).toEqual([
      'ok-1',
      'ok-2',
      'ok-3',
    ])
  })

  it('persists records in bulk batches rather than one row per line', async () => {
    const test = harness()

    await test.request(['a', 'b', 'c', 'd', 'e'], { batchSize: 2 })

    expect(test.recordSink.batches.map((batch) => batch.records.length)).toEqual([
      2, 2, 1,
    ])
  })

  it('upserts the issue repository once per batch with the whole batch, not once per record', async () => {
    const fingerprints = ['fp-a', 'fp-a', 'fp-b', 'fp-a', 'fp-b', 'fp-a']
    const test = harness({
      resolveAdapter: () => {
        let index = 0
        return new StubAdapter('json-lines', () =>
          logRecord({ fingerprint: fingerprints[index++] ?? 'fp-a' }),
        )
      },
    })

    await test.request(['1', '2', '3', '4', '5', '6'], { batchSize: 6 })

    expect(test.issueRepository.calls).toHaveLength(1)
    expect(
      [...new Set(test.issueRepository.calls[0]?.map((o) => o.fingerprint))].sort(),
    ).toEqual(['fp-a', 'fp-b'])
    expect(test.issueRepository.calls[0]).toHaveLength(6)
  })

  it('links every persisted record to the import job', async () => {
    const test = harness()

    await test.request(['a', 'b', 'c'], { batchSize: 2, importJobId: 'job-77' })

    expect(test.recordSink.batches.length).toBeGreaterThan(0)
    expect(
      test.recordSink.batches.every((batch) => batch.importJobId === 'job-77'),
    ).toBe(true)
  })

  it('advances the job to running then completed, or to failed, updating the line and error counters', async () => {
    const completedRun = harness({
      resolveAdapter: () =>
        new StubAdapter('json-lines', (line) =>
          line === 'bad' ? parseError(line) : logRecord(),
        ),
    })

    await completedRun.request(['good', 'bad', 'good'], {
      batchSize: 1,
      totalLines: 3,
    })

    expect(completedRun.importJobStore.transitions).toEqual([
      'running',
      'completed',
    ])
    expect(completedRun.importJobStore.running?.totalLines).toBe(3)
    expect(completedRun.importJobStore.progress.at(-1)).toEqual({
      processedLines: 3,
      parseErrors: 1,
    })
    expect(completedRun.importJobStore.completed).toMatchObject({
      totalLines: 3,
      processedLines: 3,
      parseErrors: 1,
    })

    const failingRun = harness({
      recordSink: {
        insertBatch: () => Promise.reject(new Error('disk full')),
      },
    })

    await expect(failingRun.request(['a'])).rejects.toThrow('disk full')
    expect(failingRun.importJobStore.transitions).toEqual(['running', 'failed'])
    expect(failingRun.importJobStore.failed).toContain('disk full')
  })

  it('reports how many records were ingested and how many lines failed to parse', async () => {
    const test = harness({
      resolveAdapter: () =>
        new StubAdapter('json-lines', (line) =>
          line.startsWith('bad') ? parseError(line) : logRecord(),
        ),
    })

    const outcome = await test.request(['ok', 'bad-1', 'ok', 'bad-2', 'ok'])

    expect(outcome.ingestedRecords).toBe(3)
    expect(outcome.parseErrors).toBe(2)
  })

  it('records the elapsed time on completion so an ingestion rate can be derived', async () => {
    const test = harness({ now: steppingClock([1000, 4000]) })

    const outcome = await test.request(['a', 'b', 'c'])

    expect(outcome.elapsedMs).toBe(3000)
    expect(test.importJobStore.completed?.elapsedMs).toBe(3000)
  })
})
