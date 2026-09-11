import { useQuery } from '@tanstack/react-query'

import { fetchErrorRate } from '../api/fetch-error-rate'
import type { TimeRange } from '../model/time-range'

export function useErrorRate(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'error-rate', range.from, range.to],
    queryFn: () => fetchErrorRate(range),
    retry: false,
  })
}
