import { Readable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import type { Issue } from '../../issues/core/issue'
import type { Occurrence } from '../../issues/core/occurrence'
import type { IssueRepository } from '../../issues/ports/issue-repository'
import type { LogRecord } from '../core/log-record'
import type {
  IngestionOutcome,
  IngestionProgress,
  NewImportJob,
} from '../ports/import-job-store'
import type { ImportJobMessage } from '../ports/job-queue'
import type { LogRecordSink } from '../ports/log-record-sink'
import type {
  LogSourceAdapter,
  ParseResult,
  SourceType,
} from '../ports/log-source-adapter'

import type { RunImportDependencies } from './run-import'
import { importJobHandler } from './run-import'

const logRecord = (overrides: Partial<LogRecord> = {}): LogRecord => ({
  timestamp: new Date('2026-09-08T10:00:00.000Z'),
  observedAt: new Date('2026-09-08T10:00:00.000Z'),
  severityNumber: 17,
  severityText: 'ERROR',
  body: 'checkout failed',
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

class StubAdapter implements LogSourceAdapter {
  constructor(
    readonly sourceType: SourceType,
    private readonly behaviour: (line: string) => ParseResult = () => logRecord(),
  ) {}

  detect(): number {
    return 1
  }

  parse(line: string): ParseResult {
    return this.behaviour(line)
  }
}

class RecordingRecordSink implements LogRecordSink {
  readonly records: LogRecord[] = []

  async insertBatch(
    _importJobId: string,
    records: readonly LogRecord[],
  ): Promise<void> {
    this.records.push(...records)
  }
}

class RecordingIssueRepository implements IssueRepository {
  readonly batches: Occurrence[][] = []

  async upsertBatch(occurrences: readonly Occurrence[]): Promise<void> {
    this.batches.push([...occurrences])
  }

  async findByFingerprint(): Promise<Issue | null> {
    return null
  }
}

class RecordingImportJobStore {
  running: { totalLines: number | null } | undefined
  progress: IngestionProgress[] = []
  completed: IngestionOutcome | undefined
  failed: string | undefined
  readonly transitions: string[] = []

  async create(_job: NewImportJob): Promise<{ id: string }> {
    return { id: 'job-1' }
  }

  async markRunning(_id: string, totalLines: number | null): Promise<void> {
    this.transitions.push('running')
    this.running = { totalLines }
  }

  async reportProgress(_id: string, progress: IngestionProgress): Promise<void> {
    this.progress.push(progress)
  }

  async markCompleted(_id: string, outcome: IngestionOutcome): Promise<void> {
    this.transitions.push('completed')
    this.completed = outcome
  }

  async markFailed(_id: string, reason: string): Promise<void> {
    this.transitions.push('failed')
    this.failed = reason
  }
}

type Harness = {
  recordSink: RecordingRecordSink
  issueRepository: RecordingIssueRepository
  importJobStore: RecordingImportJobStore
  resolverCalls: { sample: string[]; sourceType: string | undefined }[]
  deps: RunImportDependencies
}

const harness = (options: {
  storedFile?: string
  openError?: Error
  adapter?: StubAdapter
}): Harness => {
  const recordSink = new RecordingRecordSink()
  const issueRepository = new RecordingIssueRepository()
  const importJobStore = new RecordingImportJobStore()
  const resolverCalls: { sample: string[]; sourceType: string | undefined }[] =
    []
  const adapter = options.adapter ?? new StubAdapter('json-lines')

  return {
    recordSink,
    issueRepository,
    importJobStore,
    resolverCalls,
    deps: {
      fileStorage: {
        createWriteStream: async () => {
          throw new Error('not used')
        },
        open: async () => {
          if (options.openError !== undefined) {
            throw options.openError
          }
          return Readable.from(options.storedFile ?? '')
        },
      },
      recordSink,
      issueRepository,
      importJobStore,
      resolveAdapter: (sample, sourceType) => {
        resolverCalls.push({ sample: [...sample], sourceType })
        return adapter
      },
      now: (() => {
        const values = [1000, 4000]
        let index = 0
        return () => values[Math.min(index++, values.length - 1)] ?? 0
      })(),
    },
  }
}

const message = (overrides: Partial<ImportJobMessage> = {}): ImportJobMessage => ({
  importJobId: 'job-1',
  storageKey: 'key-1',
  totalLines: 3,
  sourceType: null,
  ...overrides,
})

describe('importJobHandler', () => {
  it('feeds the stored file, its line total and the source-type override into the pipeline', async () => {
    const test = harness({ storedFile: 'a\nb\nc\n' })

    await importJobHandler(test.deps)(
      message({ totalLines: 3, sourceType: 'aws-cloudwatch' }),
    )

    expect(test.recordSink.records).toHaveLength(3)
    expect(test.issueRepository.batches.flat()).toHaveLength(3)
    expect(test.resolverCalls[0]?.sourceType).toBe('aws-cloudwatch')
    expect(test.importJobStore.running?.totalLines).toBe(3)
  })

  it('completes the job with an elapsed processing time', async () => {
    const test = harness({ storedFile: 'a\nb\nc\n' })

    await importJobHandler(test.deps)(message())

    expect(test.importJobStore.transitions).toEqual(['running', 'completed'])
    expect(test.importJobStore.completed?.elapsedMs).toBe(3000)
    expect(test.importJobStore.completed?.ingestedRecords).toBe(3)
  })

  it('counts an unparseable line and still completes the job', async () => {
    const test = harness({
      storedFile: 'ok\nbad\nok\n',
      adapter: new StubAdapter('json-lines', (line) =>
        line === 'bad'
          ? { kind: 'parse-error', line, code: 'unrecognized-shape' }
          : logRecord(),
      ),
    })

    await importJobHandler(test.deps)(message())

    expect(test.importJobStore.transitions).toEqual(['running', 'completed'])
    expect(test.importJobStore.progress.at(-1)?.parseErrors).toBe(1)
  })

  it('records a background failure as a failed job without rethrowing', async () => {
    const test = harness({ openError: new Error('storage unavailable') })

    await expect(
      importJobHandler(test.deps)(message()),
    ).resolves.toBeUndefined()
    expect(test.importJobStore.failed).toContain('storage unavailable')
  })
})
