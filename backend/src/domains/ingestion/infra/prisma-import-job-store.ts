import type { PrismaClient } from '@prisma/client'

import type {
  ImportJobStore,
  IngestionOutcome,
  IngestionProgress,
  NewImportJob,
} from '../ports/import-job-store'

export class PrismaImportJobStore implements ImportJobStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(job: NewImportJob): Promise<{ id: string }> {
    const row = await this.prisma.importJob.create({
      data: {
        filename: job.filename,
        storageKey: job.storageKey,
        sizeBytes: BigInt(job.sizeBytes),
        totalLines: job.totalLines,
        sourceType: job.sourceType,
      },
    })
    return { id: row.id }
  }

  async markRunning(
    importJobId: string,
    totalLines: number | null,
  ): Promise<void> {
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: { status: 'RUNNING', totalLines },
    })
  }

  async reportProgress(
    importJobId: string,
    progress: IngestionProgress,
  ): Promise<void> {
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: {
        processedLines: progress.processedLines,
        parseErrors: progress.parseErrors,
      },
    })
  }

  async markCompleted(
    importJobId: string,
    outcome: IngestionOutcome,
  ): Promise<void> {
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'COMPLETED',
        totalLines: outcome.totalLines,
        processedLines: outcome.processedLines,
        parseErrors: outcome.parseErrors,
        elapsedMs: outcome.elapsedMs,
        finishedAt: new Date(),
      },
    })
  }

  async markFailed(importJobId: string, reason: string): Promise<void> {
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: { status: 'FAILED', error: reason, finishedAt: new Date() },
    })
  }
}
