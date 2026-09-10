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

type IssueWriter = Prisma.TransactionClient

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
    await this.prisma.$transaction((tx) => upsertIssues(tx, occurrences))
  }

  async findByFingerprint(fingerprint: string): Promise<Issue | null> {
    const record = await this.prisma.issue.findUnique({ where: { fingerprint } })
    return record === null ? null : Issue.restore(toSnapshot(record))
  }
}

export async function upsertIssues(
  db: IssueWriter,
  occurrences: readonly Occurrence[],
): Promise<void> {
  if (occurrences.length === 0) {
    return
  }

  const fingerprints = [
    ...new Set(occurrences.map((occurrence) => occurrence.fingerprint)),
  ]
  const records = await db.issue.findMany({
    where: { fingerprint: { in: fingerprints } },
  })
  const existing = new Map(
    records.map((record) => [record.fingerprint, toSnapshot(record)]),
  )

  const rows = aggregateOccurrences(occurrences, existing).map((issue) =>
    toRecordsetRow(issue.snapshot),
  )

  // Parameterized bulk upsert: `.claude/rules/performance.md` requires the
  // batch to become one write, and Prisma has no native multi-row upsert with
  // per-row values. This is the deliberate exception to ADR 0009's "raw SQL
  // only in analytics/" — one merge-on-key statement on the ingestion hot
  // path, not an analytical read. `$queryRawUnsafe` stays banned.
  await db.$executeRaw`
    INSERT INTO "public"."issues" (
      "fingerprint", "sample_message", "severity_number",
      "first_seen", "last_seen", "event_count",
      "affected_services", "status", "resolved_at"
    )
    SELECT
      r."fingerprint", r."sample_message", r."severity_number",
      r."first_seen", r."last_seen", r."event_count",
      r."affected_services", r."status", r."resolved_at"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
      "fingerprint" text, "sample_message" text, "severity_number" int,
      "first_seen" timestamptz, "last_seen" timestamptz, "event_count" bigint,
      "affected_services" text[], "status" "public"."IssueStatus",
      "resolved_at" timestamptz
    )
    ON CONFLICT ("fingerprint") DO UPDATE SET
      "sample_message" = EXCLUDED."sample_message",
      "severity_number" = EXCLUDED."severity_number",
      "first_seen" = EXCLUDED."first_seen",
      "last_seen" = EXCLUDED."last_seen",
      "event_count" = EXCLUDED."event_count",
      "affected_services" = EXCLUDED."affected_services",
      "status" = EXCLUDED."status",
      "resolved_at" = EXCLUDED."resolved_at"
  `
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

type IssueRecordsetRow = {
  readonly fingerprint: string
  readonly sample_message: string
  readonly severity_number: number | null
  readonly first_seen: string
  readonly last_seen: string
  readonly event_count: number
  readonly affected_services: readonly string[]
  readonly status: IssueStatusColumn
  readonly resolved_at: string | null
}

function toRecordsetRow(snapshot: IssueSnapshot): IssueRecordsetRow {
  return {
    fingerprint: snapshot.fingerprint,
    sample_message: snapshot.sampleMessage,
    severity_number: snapshot.severityNumber,
    first_seen: snapshot.firstSeen.toISOString(),
    last_seen: snapshot.lastSeen.toISOString(),
    event_count: snapshot.eventCount,
    affected_services: [...snapshot.affectedServices],
    status: STATUS_TO_COLUMN[snapshot.status],
    resolved_at:
      snapshot.resolvedAt === null ? null : snapshot.resolvedAt.toISOString(),
  }
}
