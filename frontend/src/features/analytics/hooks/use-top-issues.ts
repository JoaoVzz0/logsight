import { useQuery } from '@tanstack/react-query'

import { fetchTopIssues } from '../api/fetch-top-issues'
import type { TimeRange } from '../model/time-range'

export function useTopIssues(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'top-issues', range.from, range.to],
    queryFn: () => fetchTopIssues(range),
    retry: false,
  })
}
