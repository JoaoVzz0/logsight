import {
  EMPTY_FILTERS,
  serializeFilterKey,
  type IssueFilters,
} from '../model/filters'

import { IssuesFilterBar } from './issues-filter-bar'
import { IssuesResults } from './issues-results'

type IssuesViewProps = {
  readonly filters: IssueFilters
  readonly onFiltersChange: (filters: IssueFilters) => void
}

export function IssuesView({ filters, onFiltersChange }: IssuesViewProps) {
  return (
    <section className="flex min-w-0 flex-col">
      <header className="pb-3">
        <h1 className="text-lg font-semibold">Issues</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Occurrences grouped by signature, ranked by recency.
        </p>
      </header>

      <IssuesFilterBar filters={filters} onChange={onFiltersChange} />

      <IssuesResults
        key={serializeFilterKey(filters)}
        filters={filters}
        onClearFilters={() => onFiltersChange(EMPTY_FILTERS)}
      />
    </section>
  )
}
