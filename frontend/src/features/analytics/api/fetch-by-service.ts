import { api, type ByServiceResponse } from '../../../shared/lib/api-client'
import type { TimeRange } from '../model/time-range'

export async function fetchByService(range: TimeRange): Promise<ByServiceResponse> {
  const { data, error } = await api.GET('/analytics/by-service', {
    params: { query: { from: range.from, to: range.to } },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load the service distribution')
  }
  return data
}
