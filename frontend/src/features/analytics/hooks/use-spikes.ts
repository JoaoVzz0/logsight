import { useQuery } from '@tanstack/react-query'

import { fetchSpikes } from '../api/fetch-spikes'
import type { TimeRange } from '../model/time-range'

export function useSpikes(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'spikes', range.from, range.to],
    queryFn: () => fetchSpikes(range),
    retry: false,
  })
}
