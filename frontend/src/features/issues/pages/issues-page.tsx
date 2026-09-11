import { useSearchParams } from 'react-router-dom'

import { IssuesView } from '../components/issues-view'
import {
  filtersToSearchParams,
  parseIssueFilters,
  type IssueFilters,
} from '../model/filters'

export function IssuesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseIssueFilters(searchParams)

  function applyFilters(next: IssueFilters) {
    setSearchParams(filtersToSearchParams(next))
  }

  return <IssuesView filters={filters} onFiltersChange={applyFilters} />
}
