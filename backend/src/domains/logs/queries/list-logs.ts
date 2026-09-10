import type {
  LogRecord as LogRecordRow,
  Prisma,
  PrismaClient,
} from '@prisma/client'

import { decodeCursor, encodeCursor } from './cursor'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200
const MIN_SEARCH_LENGTH = 3

export type SeverityLevel = number | 'unknown'

export type ListLogsParams = {
  readonly level?: readonly SeverityLevel[]
  readonly from?: string
  readonly to?: string
  readonly service?: string
  readonly q?: string
  readonly limit?: number
  readonly cursor?: string
}

export type LogListItem = {
  readonly id: string
  readonly timestamp: string
  readonly observedAt: string
  readonly severityNumber: number | null
  readonly severityText: string | null
  readonly body: string
  readonly serviceName: string | null
  readonly host: string | null
  readonly environment: string | null
  readonly traceId: string | null
  readonly spanId: string | null
  readonly sourceType: string
  readonly fingerprint: string
}

export type LogListResult = {
  readonly records: LogListItem[]
  readonly nextCursor: string | null
}

export async function listLogs(
  prisma: PrismaClient,
  params: ListLogsParams,
): Promise<LogListResult> {
  const limit = params.limit ?? DEFAULT_LIMIT

  const rows = await prisma.logRecord.findMany({
    where: buildWhere(params),
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)

  return {
    records: page.map(toItem),
    nextCursor:
      hasMore && last !== undefined
        ? encodeCursor({ timestamp: last.timestamp.toISOString(), id: last.id })
        : null,
  }
}

function buildWhere(params: ListLogsParams): Prisma.LogRecordWhereInput {
  const clauses: Prisma.LogRecordWhereInput[] = []

  const level = levelClause(params.level)
  if (level !== undefined) {
    clauses.push(level)
  }

  const timestamp = timestampClause(params.from, params.to)
  if (timestamp !== undefined) {
    clauses.push({ timestamp })
  }

  if (params.service !== undefined) {
    clauses.push({ serviceName: params.service })
  }

  if (params.q !== undefined && params.q.length >= MIN_SEARCH_LENGTH) {
    clauses.push({ body: { contains: params.q, mode: 'insensitive' } })
  }

  if (params.cursor !== undefined) {
    clauses.push(keysetClause(params.cursor))
  }

  return clauses.length === 0 ? {} : { AND: clauses }
}

function keysetClause(rawCursor: string): Prisma.LogRecordWhereInput {
  const cursor = decodeCursor(rawCursor)
  const boundary = new Date(cursor.timestamp)

  return {
    AND: [
      { timestamp: { lte: boundary } },
      { OR: [{ timestamp: { lt: boundary } }, { id: { lt: cursor.id } }] },
    ],
  }
}

function levelClause(
  level: readonly SeverityLevel[] | undefined,
): Prisma.LogRecordWhereInput | undefined {
  if (level === undefined || level.length === 0) {
    return undefined
  }

  const numbers = level.filter(
    (value): value is number => typeof value === 'number',
  )
  const matchesUnknown = level.includes('unknown')

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

function timestampClause(
  from: string | undefined,
  to: string | undefined,
): Prisma.DateTimeFilter | undefined {
  if (from === undefined && to === undefined) {
    return undefined
  }

  const filter: Prisma.DateTimeFilter = {}
  if (from !== undefined) {
    filter.gte = new Date(from)
  }
  if (to !== undefined) {
    filter.lt = new Date(to)
  }
  return filter
}

function toItem(row: LogRecordRow): LogListItem {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    observedAt: row.observedAt.toISOString(),
    severityNumber: row.severityNumber,
    severityText: row.severityText,
    body: row.body,
    serviceName: row.serviceName,
    host: row.host,
    environment: row.environment,
    traceId: row.traceId,
    spanId: row.spanId,
    sourceType: row.sourceType,
    fingerprint: row.fingerprint,
  }
}
