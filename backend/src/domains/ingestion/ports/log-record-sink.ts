import type { LogRecord } from '../core/log-record'

export interface LogRecordSink {
  insertBatch(importJobId: string, records: readonly LogRecord[]): Promise<void>
}
