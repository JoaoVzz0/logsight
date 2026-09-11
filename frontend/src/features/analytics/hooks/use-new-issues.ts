import { useQuery } from '@tanstack/react-query'

import { fetchNewIssues } from '../api/fetch-new-issues'
import type { TimeRange } from '../model/time-range'

export function useNewIssues(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'new-issues', range.from, range.to],
    queryFn: () => fetchNewIssues(range),
    retry: false,
  })
}
