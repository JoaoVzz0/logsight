import { useQuery } from '@tanstack/react-query'

import { fetchIssues } from '../api/list-issues'
import { serializeFilterKey, type IssueFilters } from '../model/filters'

export function useIssues(filters: IssueFilters) {
  return useQuery({
    queryKey: ['issues', serializeFilterKey(filters)],
    queryFn: () => fetchIssues(filters),
    retry: false,
  })
}
