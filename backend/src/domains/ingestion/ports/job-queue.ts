export type ImportJobMessage = {
  readonly importJobId: string
  readonly storageKey: string
  readonly totalLines: number | null
  readonly sourceType: string | null
}

export type JobHandler = (message: ImportJobMessage) => Promise<void>

export interface JobQueue {
  enqueue(message: ImportJobMessage): Promise<void>

  onJob(handler: JobHandler): void
}
