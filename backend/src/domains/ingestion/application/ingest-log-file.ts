import type { Occurrence } from '../../issues/core/occurrence'
import type { IssueRepository } from '../../issues/ports/issue-repository'

import type { LogRecord } from '../core/log-record'
import type { ImportJobStore, IngestionOutcome } from '../ports/import-job-store'
import type { LogRecordSink } from '../ports/log-record-sink'
import type {
  LogSourceAdapter,
  ParseError,
  ParseResult,
} from '../ports/log-source-adapter'

const DEFAULT_BATCH_SIZE = 5_000
const DEFAULT_SAMPLE_SIZE = 20

export type IngestLogFileRequest = {
  readonly importJobId: string
  readonly lines: AsyncIterable<string>
  readonly totalLines: number | null
  readonly sourceType?: string
}

export type IngestLogFileDependencies = {
  readonly resolveAdapter: (
    sample: string[],
    sourceType?: string,
  ) => LogSourceAdapter
  readonly recordSink: LogRecordSink
  readonly issueRepository: IssueRepository
  readonly importJobStore: ImportJobStore
  readonly now: () => number
  readonly batchSize?: number
  readonly sampleSize?: number
}

type RunTotals = {
  processedLines: number
  parseErrors: number
  ingestedRecords: number
}

export async function ingestLogFile(
  request: IngestLogFileRequest,
  deps: IngestLogFileDependencies,
): Promise<IngestionOutcome> {
  const startedAt = deps.now()
  await deps.importJobStore.markRunning(request.importJobId, request.totalLines)

  try {
    const totals = await consumeStream(request, deps)
    const outcome: IngestionOutcome = {
      totalLines: totals.processedLines,
      processedLines: totals.processedLines,
      parseErrors: totals.parseErrors,
      ingestedRecords: totals.ingestedRecords,
      elapsedMs: deps.now() - startedAt,
    }
    await deps.importJobStore.markCompleted(request.importJobId, outcome)
    return outcome
  } catch (error) {
    await deps.importJobStore.markFailed(request.importJobId, reasonOf(error))
    throw error
  }
}

async function consumeStream(
  request: IngestLogFileRequest,
  deps: IngestLogFileDependencies,
): Promise<RunTotals> {
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE
  const sampleSize = deps.sampleSize ?? DEFAULT_SAMPLE_SIZE
  const totals: RunTotals = {
    processedLines: 0,
    parseErrors: 0,
    ingestedRecords: 0,
  }

  const events = expandCloudWatchEnvelopes(request.lines)
  const { sample, stream } = await takeSample(events, sampleSize)
  const adapter = deps.resolveAdapter(sample, request.sourceType)

  const flush = async (batch: readonly LogRecord[]): Promise<void> => {
    if (batch.length === 0) {
      return
    }
    await deps.issueRepository.upsertBatch(batch.map(toOccurrence))
    await deps.recordSink.insertBatch(request.importJobId, batch)
    totals.ingestedRecords += batch.length
    await deps.importJobStore.reportProgress(request.importJobId, {
      processedLines: totals.processedLines,
      parseErrors: totals.parseErrors,
    })
  }

  let batch: LogRecord[] = []
  for await (const line of stream) {
    totals.processedLines += 1
    const parsed = adapter.parse(line)
    if (isParseError(parsed)) {
      totals.parseErrors += 1
    } else {
      batch.push(parsed)
    }

    if (batch.length >= batchSize) {
      await flush(batch)
      batch = []
    }
  }
  await flush(batch)

  return totals
}

function toOccurrence(record: LogRecord): Occurrence {
  return {
    fingerprint: record.fingerprint,
    message: record.body,
    severityNumber: record.severityNumber,
    serviceName: record.serviceName,
    occurredAt: record.timestamp,
  }
}

async function takeSample(
  events: AsyncGenerator<string>,
  sampleSize: number,
): Promise<{ sample: string[]; stream: AsyncGenerator<string> }> {
  const buffered: string[] = []
  const sample: string[] = []

  while (sample.length < sampleSize) {
    const next = await events.next()
    if (next.done === true) {
      break
    }
    buffered.push(next.value)
    if (next.value.trim().length > 0) {
      sample.push(next.value)
    }
  }

  return { sample, stream: bufferedThenRest(buffered, events) }
}

async function* bufferedThenRest(
  buffered: readonly string[],
  rest: AsyncGenerator<string>,
): AsyncGenerator<string> {
  for (const line of buffered) {
    yield line
  }
  for await (const line of rest) {
    yield line
  }
}

async function* expandCloudWatchEnvelopes(
  lines: AsyncIterable<string>,
): AsyncGenerator<string> {
  for await (const line of lines) {
    for (const event of expandCloudWatchEnvelope(line)) {
      yield event
    }
  }
}

type CloudWatchEnvelope = {
  readonly logGroup: string
  readonly logStream: string
  readonly logEvents: readonly unknown[]
}

function expandCloudWatchEnvelope(line: string): string[] {
  const parsed = tryParseJson(line)
  if (!isCloudWatchEnvelope(parsed)) {
    return [line]
  }

  return parsed.logEvents.map((event) =>
    JSON.stringify({
      logGroup: parsed.logGroup,
      logStream: parsed.logStream,
      ...(isRecord(event) ? event : { message: event }),
    }),
  )
}

function isCloudWatchEnvelope(value: unknown): value is CloudWatchEnvelope {
  return (
    isRecord(value) &&
    typeof value.logGroup === 'string' &&
    typeof value.logStream === 'string' &&
    Array.isArray(value.logEvents)
  )
}

function isParseError(result: ParseResult): result is ParseError {
  return 'kind' in result && result.kind === 'parse-error'
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
