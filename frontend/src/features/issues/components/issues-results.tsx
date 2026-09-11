import { useIssues } from '../hooks/use-issues'
import { hasActiveFilters, type IssueFilters } from '../model/filters'

import { IssuesList } from './issues-list'
import { IssuesSkeleton } from './issues-skeleton'
import { IssuesEmpty, IssuesError, IssuesNoMatches } from './issues-states'

type IssuesResultsProps = {
  readonly filters: IssueFilters
  readonly onClearFilters: () => void
}

export function IssuesResults({ filters, onClearFilters }: IssuesResultsProps) {
  const query = useIssues(filters)

  if (query.isPending) {
    return <IssuesSkeleton />
  }

  if (query.isError) {
    return <IssuesError onRetry={query.refetch} />
  }

  const issues = query.data.issues

  if (issues.length === 0) {
    return hasActiveFilters(filters) ? (
      <IssuesNoMatches onClear={onClearFilters} />
    ) : (
      <IssuesEmpty />
    )
  }

  return <IssuesList issues={issues} />
}
