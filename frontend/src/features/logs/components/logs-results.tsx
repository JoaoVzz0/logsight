import { useLogs } from '../hooks/use-logs'
import { hasActiveFilters, type LogFilters } from '../model/filters'

import { LogsGrid } from './logs-grid'
import { LogsSkeleton } from './logs-skeleton'
import { LogsEmpty, LogsError, LogsNoMatches } from './logs-states'

type LogsResultsProps = {
  readonly filters: LogFilters
  readonly onClearFilters: () => void
}

export function LogsResults({ filters, onClearFilters }: LogsResultsProps) {
  const query = useLogs(filters)

  if (query.isPending) {
    return <LogsSkeleton />
  }

  if (query.isError) {
    return <LogsError onRetry={query.refetch} />
  }

  const records = query.data.pages.flatMap((page) => page.records)

  if (records.length === 0) {
    return hasActiveFilters(filters) ? (
      <LogsNoMatches onClear={onClearFilters} />
    ) : (
      <LogsEmpty />
    )
  }

  return (
    <LogsGrid
      records={records}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      onLoadMore={query.fetchNextPage}
    />
  )
}
