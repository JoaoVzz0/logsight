import { api, type NewIssuesResponse } from '../../../shared/lib/api-client'
import type { TimeRange } from '../model/time-range'

export async function fetchNewIssues(range: TimeRange): Promise<NewIssuesResponse> {
  const { data, error } = await api.GET('/analytics/new-issues', {
    params: { query: { from: range.from, to: range.to } },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load new issues')
  }
  return data
}
