import { useQuery } from '@tanstack/react-query'

import { fetchByService } from '../api/fetch-by-service'
import type { TimeRange } from '../model/time-range'

export function useByService(range: TimeRange) {
  return useQuery({
    queryKey: ['analytics', 'by-service', range.from, range.to],
    queryFn: () => fetchByService(range),
    retry: false,
  })
}
