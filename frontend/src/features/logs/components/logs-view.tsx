import {
  EMPTY_FILTERS,
  serializeFilterKey,
  type LogFilters,
} from '../model/filters'

import { LogsFilterBar } from './logs-filter-bar'
import { LogsResults } from './logs-results'

type LogsViewProps = {
  readonly filters: LogFilters
  readonly onFiltersChange: (filters: LogFilters) => void
}

export function LogsView({ filters, onFiltersChange }: LogsViewProps) {
  return (
    <section className="flex min-w-0 flex-col">
      <header className="pb-3">
        <h1 className="text-lg font-semibold">Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Raw records with composable filters and infinite scroll.
        </p>
      </header>

      <LogsFilterBar filters={filters} onChange={onFiltersChange} />

      <LogsResults
        key={serializeFilterKey(filters)}
        filters={filters}
        onClearFilters={() => onFiltersChange(EMPTY_FILTERS)}
      />
    </section>
  )
}
