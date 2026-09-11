import type { PrismaClient } from '@prisma/client'

import { toIssueSummary, type IssueSummary } from './new-issues'
import type { TimeWindow } from './time-window'

export const DEFAULT_TOP_ISSUES_LIMIT = 10
export const MAX_TOP_ISSUES_LIMIT = 50

export type TopIssuesParams = TimeWindow & {
  readonly limit?: number
}

export type TopIssuesResult = {
  readonly issues: IssueSummary[]
}

export async function topIssues(
  prisma: PrismaClient,
  params: TopIssuesParams,
): Promise<TopIssuesResult> {
  const limit = params.limit ?? DEFAULT_TOP_ISSUES_LIMIT

  const grouped = await prisma.logRecord.groupBy({
    by: ['fingerprint'],
    where: {
      timestamp: { gte: new Date(params.from), lt: new Date(params.to) },
    },
    _count: { _all: true },
    orderBy: { _count: { fingerprint: 'desc' } },
    take: limit,
  })

  if (grouped.length === 0) {
    return { issues: [] }
  }

  const countByFingerprint = new Map(
    grouped.map((row) => [row.fingerprint, row._count._all]),
  )
  const issues = await prisma.issue.findMany({
    where: { fingerprint: { in: [...countByFingerprint.keys()] } },
  })
  const issueByFingerprint = new Map(
    issues.map((issue) => [issue.fingerprint, issue]),
  )

  const summaries = grouped
    .map((row) => issueByFingerprint.get(row.fingerprint))
    .filter((issue) => issue !== undefined)
    .map((issue) => ({
      ...toIssueSummary(issue),
      eventCount: countByFingerprint.get(issue.fingerprint) ?? 0,
    }))

  return { issues: summaries }
}
