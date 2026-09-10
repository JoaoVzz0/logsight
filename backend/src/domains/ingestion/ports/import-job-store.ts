export type IngestionProgress = {
  readonly processedLines: number
  readonly parseErrors: number
}

export type IngestionOutcome = {
  readonly totalLines: number
  readonly processedLines: number
  readonly parseErrors: number
  readonly ingestedRecords: number
  readonly elapsedMs: number
}

export interface ImportJobStore {
  markRunning(importJobId: string, totalLines: number | null): Promise<void>

  reportProgress(
    importJobId: string,
    progress: IngestionProgress,
  ): Promise<void>

  markCompleted(importJobId: string, outcome: IngestionOutcome): Promise<void>

  markFailed(importJobId: string, reason: string): Promise<void>
}
