import { api, type IssueListResponse } from '../../../shared/lib/api-client'
import { filtersToQuery, type IssueFilters } from '../model/filters'

export async function fetchIssues(filters: IssueFilters): Promise<IssueListResponse> {
  const { data, error } = await api.GET('/issues', {
    params: { query: filtersToQuery(filters) },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load issues')
  }
  return data
}
