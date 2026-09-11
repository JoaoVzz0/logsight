import type {
  Issue as IssueRow,
  IssueStatus as IssueStatusColumn,
  Prisma,
  PrismaClient,
} from '@prisma/client'

export const MAX_ISSUES = 500

export type IssueStatusFilter = 'unresolved' | 'resolved' | 'ignored'
export type IssueSeverityFilter = number | 'unknown'

export type ListIssuesParams = {
  readonly service?: string
  readonly severity?: readonly IssueSeverityFilter[]
}

export type IssueListItem = {
  readonly fingerprint: string
  readonly sampleMessage: string
  readonly severityNumber: number | null
  readonly eventCount: number
  readonly firstSeen: string
  readonly lastSeen: string
  readonly affectedServices: string[]
  readonly status: IssueStatusFilter
  readonly regression: boolean
}

export type IssueListResult = {
  readonly issues: IssueListItem[]
}

const STATUS_FROM_COLUMN: Record<IssueStatusColumn, IssueStatusFilter> = {
  UNRESOLVED: 'unresolved',
  RESOLVED: 'resolved',
  IGNORED: 'ignored',
}

export async function listIssues(
  prisma: PrismaClient,
  params: ListIssuesParams,
): Promise<IssueListResult> {
  const rows = await prisma.issue.findMany({
    where: buildWhere(params),
    orderBy: { lastSeen: 'desc' },
    take: MAX_ISSUES,
  })

  return { issues: rows.map(toItem) }
}

function buildWhere(params: ListIssuesParams): Prisma.IssueWhereInput {
  const clauses: Prisma.IssueWhereInput[] = []

  if (params.service !== undefined) {
    clauses.push({ affectedServices: { has: params.service } })
  }

  const severity = severityClause(params.severity)
  if (severity !== undefined) {
    clauses.push(severity)
  }

  return clauses.length === 0 ? {} : { AND: clauses }
}

function severityClause(
  severity: readonly IssueSeverityFilter[] | undefined,
): Prisma.IssueWhereInput | undefined {
  if (severity === undefined || severity.length === 0) {
    return undefined
  }

  const numbers = severity.filter(
    (value): value is number => typeof value === 'number',
  )
  const matchesUnknown = severity.includes('unknown')

  if (!matchesUnknown) {
    return { severityNumber: { in: numbers } }
  }
  if (numbers.length === 0) {
    return { severityNumber: null }
  }
  return {
    OR: [{ severityNumber: { in: numbers } }, { severityNumber: null }],
  }
}

function toItem(row: IssueRow): IssueListItem {
  return {
    fingerprint: row.fingerprint,
    sampleMessage: row.sampleMessage,
    severityNumber: row.severityNumber,
    eventCount: Number(row.eventCount),
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
    affectedServices: row.affectedServices,
    status: STATUS_FROM_COLUMN[row.status],
    regression: row.regression,
  }
}
