import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import type { RegisterImportJobDependencies } from '../application/register-import-job'
import { importJobHandler } from '../application/run-import'
import { toOccurrence } from '../application/ingest-log-file'
import type { FileStorage } from '../ports/file-storage'
import type { JobQueue } from '../ports/job-queue'

import { resolveAdapter, registeredSourceTypes } from './adapter-registry'
import { PrismaImportJobStore } from './prisma-import-job-store'
import {
  insertLogRecords,
  PrismaLogRecordSink,
} from './prisma-log-record-sink'
import {
  PrismaIssueRepository,
  upsertIssues,
} from '../../issues/infra/prisma-issue-repository'

const BATCH_TRANSACTION_TIMEOUT_MS = 120_000

export type ImportProcessingOptions = {
  readonly prisma: PrismaClient
  readonly fileStorage: FileStorage
  readonly jobQueue: JobQueue
  readonly maxUploadBytes: number
}

export function createImportProcessing(
  options: ImportProcessingOptions,
): RegisterImportJobDependencies {
  const { prisma, fileStorage, jobQueue } = options
  const importJobStore = new PrismaImportJobStore(prisma)

  jobQueue.onJob(
    importJobHandler({
      fileStorage,
      importJobStore,
      recordSink: new PrismaLogRecordSink(prisma),
      issueRepository: new PrismaIssueRepository(prisma),
      resolveAdapter: (sample, sourceType) => resolveAdapter(sample, sourceType),
      now: () => Date.now(),
      persistBatch: (importJobId, records) =>
        prisma.$transaction(
          async (tx) => {
            await upsertIssues(tx, records.map(toOccurrence))
            await insertLogRecords(tx, importJobId, records)
          },
          { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
        ),
    }),
  )

  return {
    fileStorage,
    importJobStore,
    jobQueue,
    acceptedSourceTypes: registeredSourceTypes,
    maxUploadBytes: options.maxUploadBytes,
    newStorageKey: () => randomUUID(),
  }
}
