import { useInfiniteQuery } from '@tanstack/react-query'

import { fetchLogsPage } from '../api/list-logs'
import { serializeFilterKey, type LogFilters } from '../model/filters'
import { nextPageParam } from '../model/pagination'

export function useLogs(filters: LogFilters) {
  return useInfiniteQuery({
    queryKey: ['logs', serializeFilterKey(filters)],
    queryFn: ({ pageParam }) => fetchLogsPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageParam,
    retry: false,
  })
}
