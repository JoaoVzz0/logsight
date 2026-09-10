import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { PrismaClient } from '@prisma/client'

import {
  ingestLogFile,
  toOccurrence,
} from '../domains/ingestion/application/ingest-log-file'
import { resolveAdapter } from '../domains/ingestion/infra/adapter-registry'
import { PrismaImportJobStore } from '../domains/ingestion/infra/prisma-import-job-store'
import {
  insertLogRecords,
  PrismaLogRecordSink,
} from '../domains/ingestion/infra/prisma-log-record-sink'
import { streamFileLines } from '../domains/ingestion/infra/stream-file-lines'
import type {
  ImportJobStore,
  IngestionOutcome,
  IngestionProgress,
} from '../domains/ingestion/ports/import-job-store'
import {
  PrismaIssueRepository,
  upsertIssues,
} from '../domains/issues/infra/prisma-issue-repository'

const BATCH_TRANSACTION_TIMEOUT_MS = 120_000

const DEFAULT_BATCH_SIZE = 5_000
const PROGRESS_STEP_PERCENT = 5

export type IngestArgs = {
  readonly filePath: string
  readonly sourceType?: string
  readonly batchSize?: number
}

export type IngestResult = IngestionOutcome & {
  readonly importJobId: string
  readonly sourceType: string
  readonly chunks: number
  readonly batchSize: number
}

export async function ingest(args: IngestArgs): Promise<IngestResult> {
  const prisma = new PrismaClient()
  try {
    return await runIngestion(prisma, args)
  } finally {
    await prisma.$disconnect()
  }
}

async function runIngestion(
  prisma: PrismaClient,
  args: IngestArgs,
): Promise<IngestResult> {
  const filePath = resolve(process.env.INIT_CWD ?? process.cwd(), args.filePath)
  const fileStats = await stat(filePath)
  const batchSize = args.batchSize ?? DEFAULT_BATCH_SIZE
  const totalLines = await countLines(filePath)
  const estimatedChunks = Math.max(1, Math.ceil(totalLines / batchSize))

  process.stderr.write(
    `Ingesting ${basename(filePath)} · ${formatBytes(fileStats.size)} · ` +
      `${totalLines} lines · ~${estimatedChunks} chunks of ${batchSize}\n`,
  )

  const job = await prisma.importJob.create({
    data: {
      filename: basename(filePath),
      sizeBytes: BigInt(fileStats.size),
      ...(args.sourceType !== undefined ? { sourceType: args.sourceType } : {}),
    },
  })

  let selectedSourceType = args.sourceType ?? 'unknown'
  const progress = new ConsoleProgressReporter(
    new PrismaImportJobStore(prisma),
    totalLines,
    batchSize,
  )

  const outcome = await ingestLogFile(
    {
      importJobId: job.id,
      lines: streamFileLines(filePath),
      totalLines,
      ...(args.sourceType !== undefined ? { sourceType: args.sourceType } : {}),
    },
    {
      resolveAdapter: (sample, sourceType) => {
        const adapter = resolveAdapter(sample, sourceType)
        selectedSourceType = adapter.sourceType
        return adapter
      },
      recordSink: new PrismaLogRecordSink(prisma),
      issueRepository: new PrismaIssueRepository(prisma),
      importJobStore: progress,
      now: () => Date.now(),
      batchSize,
      persistBatch: (importJobId, records) =>
        prisma.$transaction(
          async (tx) => {
            await upsertIssues(tx, records.map(toOccurrence))
            await insertLogRecords(tx, importJobId, records)
          },
          { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
        ),
    },
  )

  return {
    ...outcome,
    importJobId: job.id,
    sourceType: selectedSourceType,
    chunks: progress.chunks,
    batchSize,
  }
}

class ConsoleProgressReporter implements ImportJobStore {
  chunks = 0
  private lastShownPercent = -PROGRESS_STEP_PERCENT

  constructor(
    private readonly delegate: ImportJobStore,
    private readonly totalLines: number,
    private readonly batchSize: number,
  ) {}

  markRunning(importJobId: string, totalLines: number | null): Promise<void> {
    return this.delegate.markRunning(importJobId, totalLines)
  }

  markCompleted(
    importJobId: string,
    outcome: IngestionOutcome,
  ): Promise<void> {
    return this.delegate.markCompleted(importJobId, outcome)
  }

  markFailed(importJobId: string, reason: string): Promise<void> {
    return this.delegate.markFailed(importJobId, reason)
  }

  async reportProgress(
    importJobId: string,
    progress: IngestionProgress,
  ): Promise<void> {
    await this.delegate.reportProgress(importJobId, progress)
    this.chunks += 1
    this.render(progress)
  }

  private render(progress: IngestionProgress): void {
    const percent =
      this.totalLines > 0
        ? Math.min(
            100,
            Math.floor((progress.processedLines / this.totalLines) * 100),
          )
        : 0

    if (percent < 100 && percent < this.lastShownPercent + PROGRESS_STEP_PERCENT) {
      return
    }
    this.lastShownPercent = percent

    const estimatedChunks = Math.max(
      1,
      Math.ceil(this.totalLines / this.batchSize),
    )
    process.stderr.write(
      `  chunk ${this.chunks}/~${estimatedChunks} · ` +
        `${progress.processedLines}/${this.totalLines} lines (${percent}%) · ` +
        `${progress.parseErrors} parse errors\n`,
    )
  }
}

async function countLines(path: string): Promise<number> {
  let count = 0
  for await (const _line of streamFileLines(path)) {
    count += 1
  }
  return count
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function parseIngestArgs(argv: string[]): IngestArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'source-type': { type: 'string' },
      'batch-size': { type: 'string' },
    },
    allowPositionals: true,
  })

  const filePath = positionals[0]
  if (filePath === undefined) {
    throw new Error(
      'usage: pnpm ingest <file> [--source-type <id>] [--batch-size <n>]',
    )
  }

  const sourceType = values['source-type']
  return {
    filePath,
    ...(sourceType !== undefined ? { sourceType } : {}),
    ...(values['batch-size'] !== undefined
      ? { batchSize: parseBatchSize(values['batch-size']) }
      : {}),
  }
}

function parseBatchSize(raw: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--batch-size expects a positive integer, received "${raw}"`)
  }
  return value
}

function formatOutcome(result: IngestResult): string {
  const seconds = result.elapsedMs / 1000
  const rate =
    seconds > 0
      ? Math.round(result.processedLines / seconds)
      : result.processedLines

  return [
    `Ingested ${result.importJobId}`,
    `  source type:   ${result.sourceType}`,
    `  total lines:   ${result.totalLines}`,
    `  records:       ${result.ingestedRecords}`,
    `  parse errors:  ${result.parseErrors}`,
    `  chunks:        ${result.chunks} of ${result.batchSize}`,
    `  elapsed:       ${seconds.toFixed(2)}s`,
    `  rate:          ${rate} lines/s`,
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const result = await ingest(parseIngestArgs(process.argv.slice(2)))
  process.stdout.write(formatOutcome(result))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
