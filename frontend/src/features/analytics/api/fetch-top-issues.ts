import { api, type TopIssuesResponse } from '../../../shared/lib/api-client'
import type { TimeRange } from '../model/time-range'

export async function fetchTopIssues(range: TimeRange): Promise<TopIssuesResponse> {
  const { data, error } = await api.GET('/analytics/top-issues', {
    params: { query: { from: range.from, to: range.to } },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load top issues')
  }
  return data
}
