import type { JobStatus } from '@prisma/client'

export type ImportStatusValue = 'pending' | 'running' | 'completed' | 'failed'

const STATUS_FROM_COLUMN: Record<JobStatus, ImportStatusValue> = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
}

export function toStatusValue(column: JobStatus): ImportStatusValue {
  return STATUS_FROM_COLUMN[column]
}
