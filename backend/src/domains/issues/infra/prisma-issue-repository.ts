import type {
  Issue as IssueRecord,
  IssueStatus as IssueStatusColumn,
  Prisma,
  PrismaClient,
} from '@prisma/client'

import { Issue, type IssueSnapshot, type IssueStatus } from '../core/issue'
import type { Occurrence } from '../core/occurrence'
import { aggregateOccurrences } from '../core/services/aggregate-occurrences'
import type { IssueRepository } from '../ports/issue-repository'

const STATUS_TO_COLUMN: Record<IssueStatus, IssueStatusColumn> = {
  unresolved: 'UNRESOLVED',
  resolved: 'RESOLVED',
  ignored: 'IGNORED',
}

const STATUS_FROM_COLUMN: Record<IssueStatusColumn, IssueStatus> = {
  UNRESOLVED: 'unresolved',
  RESOLVED: 'resolved',
  IGNORED: 'ignored',
}

export class PrismaIssueRepository implements IssueRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertBatch(occurrences: readonly Occurrence[]): Promise<void> {
    const fingerprints = [
      ...new Set(occurrences.map((occurrence) => occurrence.fingerprint)),
    ]
    const records = await this.prisma.issue.findMany({
      where: { fingerprint: { in: fingerprints } },
    })
    const existing = new Map(
      records.map((record) => [record.fingerprint, toSnapshot(record)]),
    )

    for (const issue of aggregateOccurrences(occurrences, existing)) {
      const row = toRow(issue.snapshot)
      await this.prisma.issue.upsert({
        where: { fingerprint: row.fingerprint },
        create: row,
        update: row,
      })
    }
  }

  async findByFingerprint(fingerprint: string): Promise<Issue | null> {
    const record = await this.prisma.issue.findUnique({ where: { fingerprint } })
    return record === null ? null : Issue.restore(toSnapshot(record))
  }
}

function toSnapshot(record: IssueRecord): IssueSnapshot {
  return {
    fingerprint: record.fingerprint,
    sampleMessage: record.sampleMessage,
    severityNumber: record.severityNumber,
    firstSeen: record.firstSeen,
    lastSeen: record.lastSeen,
    eventCount: Number(record.eventCount),
    affectedServices: record.affectedServices,
    status: STATUS_FROM_COLUMN[record.status],
    resolvedAt: record.resolvedAt,
    regression: false,
  }
}

function toRow(snapshot: IssueSnapshot): Prisma.IssueCreateInput {
  return {
    fingerprint: snapshot.fingerprint,
    sampleMessage: snapshot.sampleMessage,
    severityNumber: snapshot.severityNumber,
    firstSeen: snapshot.firstSeen,
    lastSeen: snapshot.lastSeen,
    eventCount: BigInt(snapshot.eventCount),
    affectedServices: [...snapshot.affectedServices],
    status: STATUS_TO_COLUMN[snapshot.status],
    resolvedAt: snapshot.resolvedAt,
  }
}
