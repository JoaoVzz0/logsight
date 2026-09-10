import { api, type LogListResponse } from '../../../shared/lib/api-client'
import { filtersToQuery, type LogFilters } from '../model/filters'

export const PAGE_SIZE = 100

export async function fetchLogsPage(
  filters: LogFilters,
  cursor: string | undefined,
): Promise<LogListResponse> {
  const { data, error } = await api.GET('/logs', {
    params: {
      query: {
        ...filtersToQuery(filters),
        limit: PAGE_SIZE,
        ...(cursor !== undefined ? { cursor } : {}),
      },
    },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load logs')
  }
  return data
}
