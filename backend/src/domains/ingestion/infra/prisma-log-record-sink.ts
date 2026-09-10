import type { Prisma, PrismaClient } from '@prisma/client'

import type { LogRecord } from '../core/log-record'
import type { LogRecordSink } from '../ports/log-record-sink'

export class PrismaLogRecordSink implements LogRecordSink {
  constructor(private readonly prisma: PrismaClient) {}

  async insertBatch(
    importJobId: string,
    records: readonly LogRecord[],
  ): Promise<void> {
    if (records.length === 0) {
      return
    }

    await this.prisma.logRecord.createMany({
      data: records.map((record) => toCreateManyInput(importJobId, record)),
    })
  }
}

function toCreateManyInput(
  importJobId: string,
  record: LogRecord,
): Prisma.LogRecordCreateManyInput {
  return {
    timestamp: record.timestamp,
    observedAt: record.observedAt,
    severityNumber: record.severityNumber,
    severityText: record.severityText,
    body: record.body,
    serviceName: record.serviceName,
    host: record.host,
    environment: record.environment,
    traceId: record.traceId,
    spanId: record.spanId,
    attributes: record.attributes as Prisma.InputJsonValue,
    sourceType: record.sourceType,
    fingerprint: record.fingerprint,
    raw: record.raw,
    importJobId,
  }
}
