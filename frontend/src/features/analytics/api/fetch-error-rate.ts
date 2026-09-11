import { api, type ErrorRateResponse } from '../../../shared/lib/api-client'
import type { TimeRange } from '../model/time-range'

export async function fetchErrorRate(range: TimeRange): Promise<ErrorRateResponse> {
  const { data, error } = await api.GET('/analytics/error-rate', {
    params: { query: { from: range.from, to: range.to } },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load the error rate')
  }
  return data
}
