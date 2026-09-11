import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

import { toIssueSummary, type IssueSummary } from './new-issues'
import type { TimeWindow } from './time-window'

export const SPIKE_FACTOR = 3

export type SpikeIssue = IssueSummary & {
  readonly currentCount: number
  readonly previousCount: number
  readonly multiplier: number
}

export type SpikesResult = {
  readonly issues: SpikeIssue[]
}

const spikeRow = z.object({
  fingerprint: z.string(),
  currentCount: z.coerce.number(),
  previousCount: z.coerce.number(),
})

export async function spikes(
  prisma: PrismaClient,
  window: TimeWindow,
): Promise<SpikesResult> {
  const from = new Date(window.from)
  const to = new Date(window.to)
  const previousFrom = new Date(from.getTime() - (to.getTime() - from.getTime()))

  const rawRows: unknown = await prisma.$queryRaw`
    WITH current_window AS (
      SELECT fingerprint, count(*) AS current_count
      FROM log_records
      WHERE timestamp >= ${from} AND timestamp < ${to}
      GROUP BY fingerprint
    ),
    previous_window AS (
      SELECT fingerprint, count(*) AS previous_count
      FROM log_records
      WHERE timestamp >= ${previousFrom} AND timestamp < ${from}
      GROUP BY fingerprint
    )
    SELECT
      current_window.fingerprint AS fingerprint,
      current_window.current_count AS "currentCount",
      previous_window.previous_count AS "previousCount"
    FROM current_window
    JOIN previous_window ON previous_window.fingerprint = current_window.fingerprint
    WHERE current_window.current_count >= previous_window.previous_count * ${SPIKE_FACTOR}
  `

  const rows = spikeRow.array().parse(rawRows)
  if (rows.length === 0) {
    return { issues: [] }
  }

  const issues = await prisma.issue.findMany({
    where: { fingerprint: { in: rows.map((row) => row.fingerprint) } },
  })
  const issueByFingerprint = new Map(
    issues.map((issue) => [issue.fingerprint, issue]),
  )

  const spikeIssues: SpikeIssue[] = []
  for (const row of rows) {
    const issue = issueByFingerprint.get(row.fingerprint)
    if (issue === undefined) {
      continue
    }
    spikeIssues.push({
      ...toIssueSummary(issue),
      currentCount: row.currentCount,
      previousCount: row.previousCount,
      multiplier: row.currentCount / row.previousCount,
    })
  }

  return { issues: spikeIssues }
}
