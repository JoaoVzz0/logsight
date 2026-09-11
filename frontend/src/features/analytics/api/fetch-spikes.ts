import { api, type SpikesResponse } from '../../../shared/lib/api-client'
import type { TimeRange } from '../model/time-range'

export async function fetchSpikes(range: TimeRange): Promise<SpikesResponse> {
  const { data, error } = await api.GET('/analytics/spikes', {
    params: { query: { from: range.from, to: range.to } },
  })

  if (error !== undefined || data === undefined) {
    throw new Error('Could not load spikes')
  }
  return data
}
