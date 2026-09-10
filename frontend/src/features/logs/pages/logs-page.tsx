import { useSearchParams } from 'react-router-dom'

import { LogsView } from '../components/logs-view'
import {
  filtersToSearchParams,
  parseLogFilters,
  type LogFilters,
} from '../model/filters'

export function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseLogFilters(searchParams)

  function applyFilters(next: LogFilters) {
    setSearchParams(filtersToSearchParams(next))
  }

  return <LogsView filters={filters} onFiltersChange={applyFilters} />
}
