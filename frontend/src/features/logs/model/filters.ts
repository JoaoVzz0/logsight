import { z } from 'zod'

import type { LogListQuery } from '../../../shared/lib/api-client'

export type SeverityLevelFilter = number | 'unknown'

export type LogFilters = {
  readonly level: readonly SeverityLevelFilter[]
  readonly from: string | null
  readonly to: string | null
  readonly service: string | null
  readonly q: string | null
}

export const MIN_SEARCH_LENGTH = 3

export type LogFilterQuery = Pick<
  LogListQuery,
  'level' | 'from' | 'to' | 'service' | 'q'
>

export const EMPTY_FILTERS: LogFilters = {
  level: [],
  from: null,
  to: null,
  service: null,
  q: null,
}

const levelValue = z.union([
  z.literal('unknown'),
  z.coerce.number().int().min(1).max(24),
])
const isoTimestamp = z.string().datetime({ offset: true })
const nonEmpty = z.string().min(1)

export function parseLogFilters(params: URLSearchParams): LogFilters {
  return {
    level: params
      .getAll('level')
      .map((raw) => levelValue.safeParse(raw))
      .flatMap((result) => (result.success ? [result.data] : [])),
    from: parseOne(isoTimestamp, params.get('from')),
    to: parseOne(isoTimestamp, params.get('to')),
    service: parseOne(nonEmpty, params.get('service')),
    q: parseOne(nonEmpty, params.get('q')),
  }
}

export function filtersToQuery(filters: LogFilters): LogFilterQuery {
  const query: LogFilterQuery = {}
  if (filters.level.length > 0) {
    query.level = [...filters.level]
  }
  if (filters.from !== null) {
    query.from = filters.from
  }
  if (filters.to !== null) {
    query.to = filters.to
  }
  if (filters.service !== null) {
    query.service = filters.service
  }
  if (filters.q !== null && filters.q.length >= MIN_SEARCH_LENGTH) {
    query.q = filters.q
  }
  return query
}

export function filtersToSearchParams(filters: LogFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const level of filters.level) {
    params.append('level', String(level))
  }
  if (filters.from !== null) {
    params.set('from', filters.from)
  }
  if (filters.to !== null) {
    params.set('to', filters.to)
  }
  if (filters.service !== null) {
    params.set('service', filters.service)
  }
  if (filters.q !== null) {
    params.set('q', filters.q)
  }
  return params
}

export function serializeFilterKey(filters: LogFilters): string {
  const params = filtersToSearchParams(filters)
  params.sort()
  return params.toString()
}

export function hasActiveFilters(filters: LogFilters): boolean {
  return (
    filters.level.length > 0 ||
    filters.from !== null ||
    filters.to !== null ||
    filters.service !== null ||
    filters.q !== null
  )
}

function parseOne<T>(schema: z.ZodType<T>, raw: string | null): T | null {
  if (raw === null) {
    return null
  }
  const result = schema.safeParse(raw)
  return result.success ? result.data : null
}
