import type { Issue, PrismaClient } from '@prisma/client'

import type { TimeWindow } from './time-window'

export type IssueSummary = {
  readonly fingerprint: string
  readonly sampleMessage: string
  readonly severity: number | null
  readonly eventCount: number
  readonly firstSeen: string
}

export type NewIssuesResult = {
  readonly issues: IssueSummary[]
}

export async function newIssues(
  prisma: PrismaClient,
  window: TimeWindow,
): Promise<NewIssuesResult> {
  const rows = await prisma.issue.findMany({
    where: {
      firstSeen: { gte: new Date(window.from), lt: new Date(window.to) },
    },
    orderBy: { firstSeen: 'desc' },
  })

  return { issues: rows.map(toIssueSummary) }
}

export function toIssueSummary(issue: Issue): IssueSummary {
  return {
    fingerprint: issue.fingerprint,
    sampleMessage: issue.sampleMessage,
    severity: issue.severityNumber,
    eventCount: Number(issue.eventCount),
    firstSeen: issue.firstSeen.toISOString(),
  }
}
