import type { PrismaClient } from '@prisma/client'
import { SEVERITY_NUMBER } from 'domain-constants'
import { z } from 'zod'

import type { TimeWindow } from './time-window'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MINUTE_BUCKET_MAX_DURATION_MS = 3 * HOUR_MS
const HOUR_BUCKET_MAX_DURATION_MS = 3 * DAY_MS

type BucketUnit = 'minute' | 'hour' | 'day'

export type ErrorRateBucket = {
  readonly bucket: string
  readonly total: number
  readonly errors: number
  readonly ratio: number
}

export type ErrorRateResult = {
  readonly buckets: ErrorRateBucket[]
}

const errorRateRow = z.object({
  bucket: z.coerce.date(),
  total: z.coerce.number(),
  errors: z.coerce.number(),
})

export async function errorRate(
  prisma: PrismaClient,
  window: TimeWindow,
): Promise<ErrorRateResult> {
  const from = new Date(window.from)
  const to = new Date(window.to)
  const unit = bucketUnitFor(to.getTime() - from.getTime())
  const step = `1 ${unit}`
  const seriesEnd = new Date(to.getTime() - 1)

  const rawRows: unknown = await prisma.$queryRaw`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${unit}, ${from}::timestamptz),
        date_trunc(${unit}, ${seriesEnd}::timestamptz),
        ${step}::interval
      ) AS bucket
    )
    SELECT
      buckets.bucket AS bucket,
      count(log_records.id) AS total,
      count(log_records.id) FILTER (
        WHERE log_records.severity_number >= ${SEVERITY_NUMBER.ERROR}
      ) AS errors
    FROM buckets
    LEFT JOIN log_records
      ON date_trunc(${unit}, log_records.timestamp) = buckets.bucket
      AND log_records.timestamp >= ${from}
      AND log_records.timestamp < ${to}
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket ASC
  `

  const rows = errorRateRow.array().parse(rawRows)

  return {
    buckets: rows.map((row) => ({
      bucket: row.bucket.toISOString(),
      total: row.total,
      errors: row.errors,
      ratio: row.total === 0 ? 0 : row.errors / row.total,
    })),
  }
}

function bucketUnitFor(durationMs: number): BucketUnit {
  if (durationMs <= MINUTE_BUCKET_MAX_DURATION_MS) {
    return 'minute'
  }
  if (durationMs <= HOUR_BUCKET_MAX_DURATION_MS) {
    return 'hour'
  }
  return 'day'
}
