import { z } from 'zod'

import type { IssueListQuery } from '../../../shared/lib/api-client'

export type SeverityLevelFilter = number | 'unknown'

export type IssueFilters = {
  readonly service: string | null
  readonly severity: readonly SeverityLevelFilter[]
}

export const EMPTY_FILTERS: IssueFilters = {
  service: null,
  severity: [],
}

const severityValue = z.union([
  z.literal('unknown'),
  z.coerce.number().int().min(1).max(24),
])
const nonEmpty = z.string().min(1)

export function parseIssueFilters(params: URLSearchParams): IssueFilters {
  return {
    service: parseOne(nonEmpty, params.get('service')),
    severity: params
      .getAll('severity')
      .map((raw) => severityValue.safeParse(raw))
      .flatMap((result) => (result.success ? [result.data] : [])),
  }
}

export function filtersToQuery(filters: IssueFilters): IssueListQuery {
  const query: IssueListQuery = {}
  if (filters.service !== null) {
    query.service = filters.service
  }
  if (filters.severity.length > 0) {
    query.severity = [...filters.severity]
  }
  return query
}

export function filtersToSearchParams(filters: IssueFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.service !== null) {
    params.set('service', filters.service)
  }
  for (const severity of filters.severity) {
    params.append('severity', String(severity))
  }
  return params
}

export function serializeFilterKey(filters: IssueFilters): string {
  const params = filtersToSearchParams(filters)
  params.sort()
  return params.toString()
}

export function hasActiveFilters(filters: IssueFilters): boolean {
  return filters.service !== null || filters.severity.length > 0
}

function parseOne<T>(schema: z.ZodType<T>, raw: string | null): T | null {
  if (raw === null) {
    return null
  }
  const result = schema.safeParse(raw)
  return result.success ? result.data : null
}
